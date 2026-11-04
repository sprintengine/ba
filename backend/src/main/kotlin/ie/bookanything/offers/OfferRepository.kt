package ie.bookanything.offers

import ie.bookanything.booking.BookingStatus
import ie.bookanything.db.Jsonb
import ie.bookanything.db.UuidArray
import ie.bookanything.db.instant
import ie.bookanything.db.int
import ie.bookanything.db.intOrNull
import ie.bookanything.db.localDateOrNull
import ie.bookanything.db.query
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidList
import ie.bookanything.http.ApiJson
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.serializer
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.time.LocalTime
import java.util.UUID

/** An offer row with its presentation fields. */
data class StoredOffer(val rule: OfferRule, val description: String?, val updatedAt: Instant)

object OfferRepository {
    private val windowsSerializer = ListSerializer(serializer<TimeWindowDto>())

    private const val SELECT = """
        SELECT o.business_id, o.id, o.name, o.description, o.discount_type, o.discount_value, o.days_of_week, o.time_windows::text AS time_windows,
            o.last_minute_hours, o.valid_from, o.valid_until, o.max_redemptions, o.status, o.created_at, o.updated_at,
            COALESCE((SELECT array_agg(os.service_id) FROM offer_services os WHERE os.offer_id = o.id), '{}') AS service_ids
        FROM offers o
    """

    private fun map(rs: ResultSet): StoredOffer {
        @Suppress("UNCHECKED_CAST")
        val days = (rs.getArray("days_of_week")?.array as Array<Any?>?)?.mapNotNull { (it as Number?)?.toInt() }?.toSet().orEmpty()
        val windows = ApiJson.decodeFromString(windowsSerializer, rs.str("time_windows")).map {
            TimeWindow(LocalTime.parse(it.start), LocalTime.parse(it.end))
        }
        val value = rs.int("discount_value")
        val rule = OfferRule(
            id = rs.uuid("id"), name = rs.str("name"),
            serviceIds = rs.uuidList("service_ids").toSet(),
            discount = if (rs.str("discount_type") == "percent") Discount.Percent(value) else Discount.Fixed(value),
            schedule = OfferSchedule(
                days, windows, rs.intOrNull("last_minute_hours"), rs.localDateOrNull("valid_from"),
                rs.localDateOrNull("valid_until"),
            ),
            maxRedemptions = rs.intOrNull("max_redemptions"), status = OfferStatus.parse(rs.str("status")),
            createdAt = rs.instant("created_at"),
        )
        return StoredOffer(rule, rs.strOrNull("description"), rs.instant("updated_at"))
    }

    fun list(conn: Connection, businessId: UUID): List<StoredOffer> =
        conn.query("$SELECT WHERE o.business_id = ? ORDER BY o.created_at, o.id", businessId, map = ::map)

    fun get(conn: Connection, businessId: UUID, id: UUID): StoredOffer? =
        conn.query("$SELECT WHERE o.business_id = ? AND o.id = ?", businessId, id, map = ::map).firstOrNull()

    /** Active offers of a business (optionally only those covering [serviceId]), for pricing. */
    fun active(conn: Connection, businessId: UUID, serviceId: UUID? = null): List<OfferRule> = conn.query(
        "$SELECT WHERE o.business_id = ? AND o.status = 'active'" +
            (if (serviceId != null) " AND EXISTS (SELECT 1 FROM offer_services s WHERE s.offer_id = o.id AND s.service_id = ?)" else "") +
            " ORDER BY o.created_at, o.id",
        *listOfNotNull(businessId, serviceId).toTypedArray(), map = ::map,
    ).map { it.rule }

    /** The active offers of each of [businessIds] with their presentation fields, in [active]'s order. */
    fun activeByBusiness(conn: Connection, businessIds: Set<UUID>): Map<UUID, List<StoredOffer>> =
        if (businessIds.isEmpty()) {
            emptyMap()
        } else {
            conn.query(
                "$SELECT WHERE o.business_id = ANY(?) AND o.status = 'active' ORDER BY o.created_at, o.id",
                UuidArray(businessIds),
            ) { it.uuid("business_id") to map(it) }.groupBy({ it.first }, { it.second })
        }

    /** Bookings holding a redemption: every booking with the offer that is not cancelled or expired. */
    fun redemptions(conn: Connection, businessId: UUID, offerIds: Collection<UUID>): Map<UUID, Int> =
        redemptions(conn, setOf(businessId), offerIds)

    /** [redemptions] of offers of any of [businessIds] (offer ids are unique across businesses). */
    fun redemptions(conn: Connection, businessIds: Set<UUID>, offerIds: Collection<UUID>): Map<UUID, Int> {
        if (offerIds.isEmpty()) return emptyMap()
        return conn.query(
            """
            SELECT offer_id, count(*) AS n FROM bookings
            WHERE business_id = ANY(?) AND offer_id = ANY(?) AND ${BookingStatus.sqlIn("status", BookingStatus.REDEEMING)}
            GROUP BY offer_id
            """.trimIndent(),
            UuidArray(businessIds), UuidArray(offerIds.toSet()),
        ) { it.uuid("offer_id") to it.int("n") }.toMap()
    }

    /** Serialises redemptions of a capped offer (the last one can't be taken twice). */
    fun lock(conn: Connection, businessId: UUID, offerId: UUID) {
        conn.query("SELECT id FROM offers WHERE business_id = ? AND id = ? FOR UPDATE", businessId, offerId) { 1 }
    }

    fun insert(conn: Connection, businessId: UUID, spec: OfferSpec, now: Instant): UUID {
        val id = UUID.randomUUID()
        conn.update(
            """
            INSERT INTO offers (id, business_id, name, description, discount_type, discount_value, days_of_week, time_windows,
                last_minute_hours, valid_from, valid_until, max_redemptions, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?::smallint[], ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id, businessId, spec.name, spec.description, discountType(spec.discount), discountValue(spec.discount), daysLiteral(spec),
            windowsJson(spec), spec.schedule.lastMinuteHours, spec.schedule.validFrom, spec.schedule.validUntil, spec.maxRedemptions,
            spec.status.value, now, now,
        )
        replaceServices(conn, businessId, id, spec.serviceIds)
        return id
    }

    fun update(conn: Connection, businessId: UUID, id: UUID, spec: OfferSpec, now: Instant) {
        conn.update(
            """
            UPDATE offers SET name = ?, description = ?, discount_type = ?, discount_value = ?, days_of_week = ?::smallint[], time_windows = ?,
                last_minute_hours = ?, valid_from = ?, valid_until = ?, max_redemptions = ?, status = ?, updated_at = ?
            WHERE business_id = ? AND id = ?
            """.trimIndent(),
            spec.name, spec.description, discountType(spec.discount), discountValue(spec.discount), daysLiteral(spec), windowsJson(spec),
            spec.schedule.lastMinuteHours, spec.schedule.validFrom, spec.schedule.validUntil, spec.maxRedemptions, spec.status.value, now,
            businessId, id,
        )
        replaceServices(conn, businessId, id, spec.serviceIds)
    }

    fun setStatus(conn: Connection, businessId: UUID, id: UUID, status: OfferStatus, now: Instant) {
        conn.update("UPDATE offers SET status = ?, updated_at = ? WHERE business_id = ? AND id = ?", status.value, now, businessId, id)
    }

    fun delete(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("DELETE FROM offers WHERE business_id = ? AND id = ?", businessId, id)
    }

    private fun replaceServices(conn: Connection, businessId: UUID, offerId: UUID, serviceIds: Set<UUID>) {
        conn.update("DELETE FROM offer_services WHERE business_id = ? AND offer_id = ?", businessId, offerId)
        conn.update(
            "INSERT INTO offer_services (business_id, offer_id, service_id) SELECT ?, ?, unnest(?::uuid[])",
            businessId, offerId, UuidArray(serviceIds),
        )
    }

    private fun discountType(d: Discount) = when (d) { is Discount.Percent -> "percent"; is Discount.Fixed -> "fixed" }
    private fun discountValue(d: Discount) = when (d) { is Discount.Percent -> d.percent; is Discount.Fixed -> d.amountCents }
    private fun daysLiteral(spec: OfferSpec) = spec.schedule.daysOfWeek.sorted().joinToString(",", "{", "}")
    private fun windowsJson(spec: OfferSpec) =
        Jsonb(
            ApiJson.encodeToString(windowsSerializer, spec.schedule.windows.map { TimeWindowDto(it.start.toString(), it.end.toString()) }),
        )
}
