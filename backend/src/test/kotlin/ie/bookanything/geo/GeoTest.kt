package ie.bookanything.geo

import ie.bookanything.support.LocalHttpServer
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GeoTest {
    private val dublin = IrishPlaces.city("dublin")!!.point
    private val cork = IrishPlaces.city("cork")!!.point
    private val galway = IrishPlaces.city("galway")!!.point

    private fun assertNear(expected: Double, actual: Double, tolerance: Double) =
        assertTrue(abs(expected - actual) <= tolerance, "expected $expected ± $tolerance, got $actual")

    @Test
    fun `haversine distances match known great-circle distances`() {
        assertNear(219.0, Distance.haversineKm(dublin, cork), 3.0)
        assertNear(187.0, Distance.haversineKm(dublin, galway), 3.0)
        assertEquals(0.0, Distance.haversineKm(dublin, dublin))
        assertEquals(Distance.haversineKm(dublin, cork), Distance.haversineKm(cork, dublin))
        // One degree of latitude is ~111.2 km everywhere.
        assertNear(111.2, Distance.haversineKm(GeoPoint(53.0, -8.0), GeoPoint(54.0, -8.0)), 0.2)
    }

    @Test
    fun `the bounding box contains every point within the radius`() {
        val box = Distance.boundingBox(dublin, 25.0)
        // Points 24.9 km away in each direction are inside; Cork is not.
        listOf(0.0, 90.0, 180.0, 270.0, 45.0).forEach { bearing ->
            val p = destination(dublin, 24.9, bearing)
            assertTrue(Distance.haversineKm(dublin, p) < 25.0)
            assertTrue(box.contains(p), "bearing $bearing")
        }
        assertTrue(!box.contains(cork))
        // Longitude degrees shrink with latitude, so the box is wider in degrees than tall.
        assertTrue(box.maxLongitude - box.minLongitude > box.maxLatitude - box.minLatitude)
        assertFailsWith<IllegalArgumentException> { Distance.boundingBox(dublin, 0.0) }
        assertEquals(-180.0, Distance.boundingBox(GeoPoint(90.0, 0.0), 10.0).minLongitude)
    }

    /** Point [km] away from [from] on [bearingDeg] (spherical). */
    private fun destination(from: GeoPoint, km: Double, bearingDeg: Double): GeoPoint {
        val d = km / Distance.EARTH_RADIUS_KM
        val b = Math.toRadians(bearingDeg)
        val lat1 = Math.toRadians(from.latitude)
        val lng1 = Math.toRadians(from.longitude)
        val lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
        val lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
        return GeoPoint(Math.toDegrees(lat2), Math.toDegrees(lng2))
    }

    @Test
    fun `the table geocoder prefers known addresses, then routing keys, then cities`() {
        val g = TableGeocoder()
        val lantern = g.geocode(GeocodeQuery("Unit 4, Lantern Quay", null, "Dublin", "D02 XY01", "IE"))!!
        assertEquals(GeoPrecision.ADDRESS, lantern.precision)
        val byPostcode = g.geocode(GeocodeQuery("1 Nowhere Road", null, "Dublin", "d14 zz99", "IE"))!!
        assertEquals(GeoPrecision.POSTCODE, byPostcode.precision)
        assertEquals(IrishPlaces.ROUTING_KEYS["D14"], byPostcode.point)
        val byCity = g.geocode(GeocodeQuery(null, null, "Co. Galway", null, "IE"))!!
        assertEquals(GeoPrecision.CITY, byCity.precision)
        assertEquals(galway, byCity.point)
        assertNull(g.geocode(GeocodeQuery("1 Main St", null, "Atlantis", null, "IE")))
        assertNull(g.geocode(GeocodeQuery(null, null, "Dublin", null, "GB")), "only Irish places")
        assertNull(g.geocode(GeocodeQuery(null, null, null, null, "IE")))
        assertEquals(
            "unit 4, lantern quay||dublin|d02 xy01|ie", GeocodeQuery(" Unit 4,  Lantern Quay", null, "Dublin", "D02 XY01", "IE").key,
        )
    }

    @Test
    fun `mapbox results are parsed from GeoJSON and requested as permanent geocodes`() {
        val body = """{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[-6.2603,53.3498]},
            "properties":{"feature_type":"address","full_address":"1 Test St, Dublin"}}]}"""
        LocalHttpServer { LocalHttpServer.Response(200, body) }.use { server ->
            val result = MapboxGeocoder("pk.test", server.baseUrl).geocode(GeocodeQuery("1 Test St", null, "Dublin", null, "IE"))
            assertEquals(GeocodeResult(GeoPoint(53.3498, -6.2603), GeoPrecision.ADDRESS, "mapbox"), result)
            val q = server.requests.single().query!!
            assertTrue(q.contains("permanent=true") && q.contains("country=ie") && q.contains("access_token=pk.test"), q)
            assertTrue(server.requests.single().path.endsWith("/search/geocode/v6/forward"))
        }
        LocalHttpServer { LocalHttpServer.Response(200, """{"features":[]}""") }.use { server ->
            assertNull(MapboxGeocoder("pk.test", server.baseUrl).geocode(GeocodeQuery("x", null, "Dublin", null, "IE")))
        }
        LocalHttpServer { LocalHttpServer.Response(503, "{}") }.use { server ->
            assertFailsWith<java.io.IOException> {
                MapboxGeocoder("pk.test", server.baseUrl).geocode(GeocodeQuery("x", null, "Dublin", null, "IE"))
            }
        }
        assertEquals(
            GeoPrecision.CITY,
            MapboxGeocoder("k").parse(
                """{"features":[{"geometry":{"coordinates":[-8.47,51.9]},"properties":{"feature_type":"place"}}]}""",
            )!!.precision,
        )
    }

    @Test
    fun `the fallback geocoder uses the table when the provider finds nothing`() {
        val g = FallbackGeocoder({ null }, TableGeocoder())
        assertNotNull(g.geocode(GeocodeQuery(null, null, "Cork", null, "IE")))
        val primary = GeocodeResult(GeoPoint(1.0, 1.0), GeoPrecision.ADDRESS, "p")
        assertEquals(primary, FallbackGeocoder({ primary }, TableGeocoder()).geocode(GeocodeQuery(null, null, "Cork", null, "IE")))
    }
}
