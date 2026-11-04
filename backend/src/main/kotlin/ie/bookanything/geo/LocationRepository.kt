package ie.bookanything.geo

import ie.bookanything.business.BusinessRow
import ie.bookanything.db.instant
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.update
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/** A stored geocode for a business. [point] is null when the address could not be located. */
data class StoredLocation(val point: GeoPoint?, val addressKey: String, val precision: String, val source: String, val geocodedAt: Instant)

object LocationRepository {
    fun queryFor(b: BusinessRow) = GeocodeQuery(b.address.line1, b.address.line2, b.address.city, b.address.postcode, b.country)

    fun get(conn: Connection, businessId: UUID): StoredLocation? = conn.queryOne(
        "SELECT latitude, longitude, address_key, precision, source, geocoded_at FROM business_locations WHERE business_id = ?", businessId,
    ) { rs ->
        val lat = rs.getDouble("latitude").takeUnless { rs.wasNull() }
        val lng = rs.getDouble("longitude").takeUnless { rs.wasNull() }
        StoredLocation(
            if (lat != null && lng != null) GeoPoint(lat, lng) else null, rs.str("address_key"), rs.str("precision"), rs.str("source"),
            rs.instant("geocoded_at"),
        )
    }

    /** Stores [result] for [addressKey]; a null result records that the address could not be located. */
    fun save(conn: Connection, businessId: UUID, addressKey: String, result: GeocodeResult?, source: String, now: Instant) {
        conn.update(
            """
            INSERT INTO business_locations (business_id, latitude, longitude, address_key, precision, source, geocoded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (business_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
                address_key = EXCLUDED.address_key, precision = EXCLUDED.precision, source = EXCLUDED.source, geocoded_at = EXCLUDED.geocoded_at
            """.trimIndent(),
            businessId, result?.point?.latitude, result?.point?.longitude, addressKey, result?.precision?.value ?: "none",
            result?.source ?: source, now,
        )
    }

    fun delete(conn: Connection, businessId: UUID) {
        conn.update("DELETE FROM business_locations WHERE business_id = ?", businessId)
    }
}
