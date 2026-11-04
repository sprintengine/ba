package ie.bookanything.support

import ie.bookanything.geo.GeoPoint
import io.ktor.http.HttpStatusCode
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/** Helpers for marketplace, offers and customer-MCP tests. */
object MarketplaceFixtures {
    /** Invites a new user as [role] and has them accept (automatic on `/v1/me` for their verified email). */
    suspend fun member(api: Api, clinic: Clinic, role: String): TestUser {
        val user = TestUser.create(role)
        assertStatus(
            HttpStatusCode.Created,
            api.post("${clinic.base}/team/invitations", jsonOf("email" to user.email, "role" to role), clinic.owner.token),
        )
        assertStatus(HttpStatusCode.OK, api.get("/v1/me", user.token))
        return user
    }

    fun setPlan(clinic: Clinic, plan: String) =
        Fixtures.sql("UPDATE businesses SET plan = ?::business_plan WHERE id = ?", plan, UUID.fromString(clinic.id))

    private val cells = AtomicInteger(0)

    /**
     * A point in the empty Atlantic, in its own 2° grid cell (~200 km from any other), so location searches only see
     * this test's businesses (all tests share one database; tests search within 50 km plus 30 km offsets).
     */
    fun isolatedPoint(): GeoPoint {
        val n = cells.getAndIncrement()
        return GeoPoint(20.0 + (n / 10) * 2.0, -45.0 + (n % 10) * 2.0)
    }

    /** A point [km] north of [p]. */
    fun north(p: GeoPoint, km: Double) = GeoPoint(p.latitude + km / 111.195, p.longitude)

    /** Stores a location directly (as the geocode job would), keyed to the business's current address. */
    fun place(clinic: Clinic, p: GeoPoint) {
        val id = UUID.fromString(clinic.id)
        val key = Fixtures.sqlOne(
            "SELECT concat_ws('|', coalesce(lower(address_line1), ''), coalesce(lower(address_line2), ''), coalesce(lower(city), ''), " +
                "coalesce(lower(postcode), ''), lower(country)) FROM businesses WHERE id = ?",
            id,
        ) { it.getString(1) }
        Fixtures.sql(
            """
            INSERT INTO business_locations (business_id, latitude, longitude, address_key, precision, source) VALUES (?, ?, ?, ?, 'address', 'test')
            ON CONFLICT (business_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, address_key = EXCLUDED.address_key
            """.trimIndent(),
            id, p.latitude, p.longitude, key,
        )
    }

    /** A Pro clinic listed on the marketplace at [p]. */
    suspend fun listedClinic(api: Api, p: GeoPoint? = null, category: String = "physio"): Clinic {
        val clinic = Fixtures.clinic(api)
        setPlan(clinic, "pro")
        assertStatus(
            HttpStatusCode.OK, api.put("${clinic.base}/marketplace", jsonOf("listed" to true, "category" to category), clinic.owner.token),
        )
        if (p != null) place(clinic, p)
        return clinic
    }
}
