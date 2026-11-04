package ie.bookanything.marketplace

import ie.bookanything.booking.BookingStatus
import ie.bookanything.db.TextArray
import ie.bookanything.db.instant
import ie.bookanything.db.likeContains
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.geo.Distance
import ie.bookanything.geo.GeoPoint
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

data class Listing(val category: String, val listedAt: Instant)

/** A listed business matching the SQL part of a search, in result order. */
data class Candidate(val businessId: UUID, val category: String, val point: GeoPoint?, val distanceKm: Double?, val sortName: String) {
    fun cursor(byDistance: Boolean): SearchCursor =
        if (byDistance) SearchCursor.ByDistance(distanceKm!!, businessId) else SearchCursor.ByName(sortName, businessId)
}

object MarketplaceRepository {
    /** Listed businesses that are visible: active and on a paid plan (a downgrade to Free hides the listing). */
    private const val VISIBLE = "b.status = 'active' AND b.plan <> 'free'"

    fun listing(conn: Connection, businessId: UUID): Listing? =
        conn.queryOne(
            "SELECT category, listed_at FROM marketplace_listings WHERE business_id = ?", businessId,
        ) { Listing(it.str("category"), it.instant("listed_at")) }

    fun upsert(conn: Connection, businessId: UUID, category: String, now: Instant) {
        conn.update(
            """
            INSERT INTO marketplace_listings (business_id, category, listed_at, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (business_id) DO UPDATE SET category = EXCLUDED.category, updated_at = EXCLUDED.updated_at
            """.trimIndent(),
            businessId, category, now, now,
        )
    }

    fun delete(conn: Connection, businessId: UUID) {
        conn.update("DELETE FROM marketplace_listings WHERE business_id = ?", businessId)
    }

    /** Points of every visible, located listing (for per-city counts; small at our scale). */
    fun visiblePoints(conn: Connection): List<GeoPoint> = conn.query(
        """
        SELECT l.latitude, l.longitude FROM marketplace_listings ml
        JOIN businesses b ON b.id = ml.business_id JOIN business_locations l ON l.business_id = b.id
        WHERE $VISIBLE AND l.latitude IS NOT NULL
        """.trimIndent(),
    ) { GeoPoint(it.getDouble("latitude"), it.getDouble("longitude")) }

    /**
     * One page of candidates in result order after [SearchFilter.cursor]. Near searches use the bounding box on the
     * (latitude, longitude) index, then the exact haversine distance for the radius and the order.
     */
    fun candidates(conn: Connection, f: SearchFilter, after: SearchCursor?, now: Instant, limit: Int): List<Candidate> {
        val near = f.near
        val params = mutableListOf<Any?>()
        val distance = if (near != null) {
            params.addAll(listOf(near.center.latitude, near.center.latitude, near.center.longitude))
            Distance.sqlHaversineKm("l.latitude", "l.longitude")
        } else {
            "NULL::double precision"
        }
        val inner = StringBuilder(
            """
            SELECT b.id, ml.category, l.latitude, l.longitude, lower(b.name) AS sort_name, $distance AS distance_km
            FROM marketplace_listings ml
            JOIN businesses b ON b.id = ml.business_id
            LEFT JOIN business_locations l ON l.business_id = b.id
            WHERE $VISIBLE
            """.trimIndent(),
        )
        f.category?.let { inner.append(" AND ml.category = ?"); params += it.key }
        near?.let { inBoundingBox(it, inner, params) }
        f.text?.let { matchingText(it, inner, params) }
        val priceFiltered = f.minPriceCents != null || f.maxPriceCents != null
        if (priceFiltered) priced(f.minPriceCents ?: 0, f.maxPriceCents ?: Int.MAX_VALUE, inner, params)
        if (f.dealsOnly) withDeals(now, inner, params)
        val sql = StringBuilder("SELECT * FROM ($inner) t WHERE true")
        if (near != null) { sql.append(" AND t.distance_km <= ?"); params += near.radiusKm }
        when (after) {
            is SearchCursor.ByDistance -> {
                sql.append(" AND (t.distance_km, t.id) > (?, ?)"); params.addAll(listOf(after.distanceKm, after.id))
            }
            is SearchCursor.ByName -> { sql.append(" AND (t.sort_name, t.id) > (?, ?)"); params.addAll(listOf(after.sortName, after.id)) }
            null -> Unit
        }
        sql.append(if (near != null) " ORDER BY t.distance_km, t.id" else " ORDER BY t.sort_name, t.id")
        sql.append(" LIMIT ?")
        params += limit
        return conn.query(sql.toString(), *params.toTypedArray(), map = ::candidate)
    }

    private fun candidate(rs: ResultSet): Candidate {
        val lat = rs.getDouble("latitude").takeUnless { rs.wasNull() }
        val lng = rs.getDouble("longitude").takeUnless { rs.wasNull() }
        val dist = rs.getDouble("distance_km").takeUnless { rs.wasNull() }
        return Candidate(
            rs.uuid("id"), rs.str("category"), if (lat != null && lng != null) GeoPoint(lat, lng) else null, dist, rs.str("sort_name"),
        )
    }

    /** The bounding box of the radius, which the (latitude, longitude) index can use; the exact distance is checked after. */
    private fun inBoundingBox(near: NearFilter, sql: StringBuilder, params: MutableList<Any?>) {
        val box = Distance.boundingBox(near.center, near.radiusKm)
        sql.append(" AND l.latitude BETWEEN ? AND ? AND l.longitude BETWEEN ? AND ?")
        params.addAll(listOf(box.minLatitude, box.maxLatitude, box.minLongitude, box.maxLongitude))
    }

    /** Name, description, city, a matching category or a public service name contains [text]. */
    private fun matchingText(text: String, sql: StringBuilder, params: MutableList<Any?>) {
        val like = likeContains(text)
        val categories = MarketplaceCategories.matching(text).map { it.key }
        sql.append(
            " " + """
             AND (b.name ILIKE ? OR b.description ILIKE ? OR b.city ILIKE ? OR ml.category = ANY(?)
              OR EXISTS (SELECT 1 FROM services s WHERE s.business_id = b.id AND s.is_active AND s.is_public AND s.name ILIKE ?))
            """.trimIndent(),
        )
        params.addAll(listOf(like, like, like, TextArray(categories), like))
    }

    /** Some bookable (active, public, open to everyone) service's [FromPrice] is within [min]..[max]. */
    private fun priced(min: Int, max: Int, sql: StringBuilder, params: MutableList<Any?>) {
        sql.append(
            " AND EXISTS (SELECT 1 FROM services s WHERE s.business_id = b.id AND s.is_active AND s.is_public" +
                " AND s.allowed_group_ids = '{}' AND ${FromPrice.SQL} BETWEEN ? AND ?)",
        )
        params.addAll(listOf(min, max))
    }

    /** The business has an active, current offer with redemptions left. */
    private fun withDeals(now: Instant, sql: StringBuilder, params: MutableList<Any?>) {
        sql.append(
            " " + """
             AND EXISTS (SELECT 1 FROM offers o WHERE o.business_id = b.id AND o.status = 'active'
              AND (o.valid_until IS NULL OR o.valid_until >= (?::timestamptz AT TIME ZONE b.timezone)::date)
              AND (o.max_redemptions IS NULL OR o.max_redemptions > (SELECT count(*) FROM bookings bk
                   WHERE bk.business_id = o.business_id AND bk.offer_id = o.id AND ${BookingStatus.sqlIn("bk.status", BookingStatus.REDEEMING)})))
            """.trimIndent(),
        )
        params += now
    }
}
