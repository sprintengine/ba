package ie.bookanything.geo

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/** A WGS84 point in decimal degrees. */
data class GeoPoint(val latitude: Double, val longitude: Double) {
    init {
        require(latitude in -90.0..90.0) { "latitude out of range" }
        require(longitude in -180.0..180.0) { "longitude out of range" }
    }
}

/** A latitude/longitude rectangle used as an indexable prefilter before the exact distance check. */
data class BoundingBox(val minLatitude: Double, val maxLatitude: Double, val minLongitude: Double, val maxLongitude: Double) {
    fun contains(p: GeoPoint) = p.latitude in minLatitude..maxLatitude && p.longitude in minLongitude..maxLongitude
}

/** Pure distance maths (spherical Earth; well under 0.5% error at Irish distances, which is fine for "near me"). */
object Distance {
    const val EARTH_RADIUS_KM = 6371.0088

    /** Great-circle distance in kilometres (haversine). */
    fun haversineKm(a: GeoPoint, b: GeoPoint): Double {
        val dLat = Math.toRadians(b.latitude - a.latitude)
        val dLng = Math.toRadians(b.longitude - a.longitude)
        val h = sin(dLat / 2).let { it * it } +
            cos(Math.toRadians(a.latitude)) * cos(Math.toRadians(b.latitude)) * sin(dLng / 2).let { it * it }
        return 2 * EARTH_RADIUS_KM * asin(min(1.0, sqrt(h)))
    }

    /**
     * The smallest lat/lng box containing every point within [radiusKm] of [center]. Longitude degrees shrink with
     * latitude, so the box is wider in degrees than tall. Near the poles the box spans every longitude.
     */
    fun boundingBox(center: GeoPoint, radiusKm: Double): BoundingBox {
        require(radiusKm > 0) { "radius must be positive" }
        val dLat = Math.toDegrees(radiusKm / EARTH_RADIUS_KM)
        val cosLat = cos(Math.toRadians(center.latitude))
        val dLng = if (cosLat < 1e-6) 180.0 else min(180.0, Math.toDegrees(radiusKm / (EARTH_RADIUS_KM * cosLat)))
        return BoundingBox(
            minLatitude = (center.latitude - dLat).coerceAtLeast(-90.0),
            maxLatitude = (center.latitude + dLat).coerceAtMost(90.0),
            minLongitude = (center.longitude - dLng).coerceAtLeast(-180.0),
            maxLongitude = (center.longitude + dLng).coerceAtMost(180.0),
        )
    }

    /** SQL for the same haversine distance in km; binds (latitude, latitude, longitude) of the centre, in that order. */
    fun sqlHaversineKm(latColumn: String, lngColumn: String): String =
        "(2 * $EARTH_RADIUS_KM * asin(least(1.0, sqrt(" +
            "power(sin(radians($latColumn - ?) / 2), 2) + " +
            "cos(radians(?)) * cos(radians($latColumn)) * power(sin(radians($lngColumn - ?) / 2), 2)))))"
}
