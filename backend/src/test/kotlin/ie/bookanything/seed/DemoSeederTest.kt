package ie.bookanything.seed

import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestEnv
import ie.bookanything.support.arr
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.devToken
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.jsonArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DemoSeederTest {
    private fun count(sql: String) = Fixtures.sqlOne(sql) { it.getInt(1) }!!

    @Test
    fun `seed-demo is idempotent and produces usable demo accounts`() {
        val env = TestEnv()
        DemoSeeder(env.ctx).seed()
        val slugs = "('lumen-physio', 'gleam-car-wash', 'cadence-music', 'meadowbrook-practice')"
        val bookings = count("SELECT count(*) FROM bookings b JOIN businesses x ON x.id = b.business_id WHERE x.slug IN $slugs")
        val businesses = count("SELECT count(*) FROM businesses WHERE slug IN $slugs")
        DemoSeeder(env.ctx).seed()
        assertEquals(4, businesses)
        assertEquals(4, count("SELECT count(*) FROM businesses WHERE slug IN $slugs"))
        assertEquals(bookings, count("SELECT count(*) FROM bookings b JOIN businesses x ON x.id = b.business_id WHERE x.slug IN $slugs"))
        assertTrue(bookings > 100)
        val statuses = Fixtures.sqlOne(
            "SELECT string_agg(DISTINCT b.status::text, ',') FROM bookings b JOIN businesses x ON x.id = b.business_id WHERE x.slug IN $slugs",
        ) { it.getString(1) }!!.split(',').toSet()
        assertTrue(statuses.containsAll(setOf("confirmed", "cancelled", "completed", "no_show", "pending_approval")), statuses.toString())

        withApp(env) { api ->
            val owner = devToken("dev_owner", "owner@bookanything.test", "Avery Morgan")
            val me = api.get("/v1/me", owner).obj()
            assertEquals(
                setOf("lumen-physio", "gleam-car-wash", "cadence-music", "meadowbrook-practice"),
                me["memberships"]!!.jsonArray.map { it.s("slug") }.toSet(),
            )
            val staff = api.get("/v1/me", devToken("dev_staff", "staff@bookanything.test", "Casey Lane")).obj()
            assertEquals(setOf("lumen-physio", "meadowbrook-practice"), staff["memberships"]!!.jsonArray.map { it.s("slug") }.toSet())
            val gp = staff["memberships"]!!.jsonArray.first { it.s("slug") == "meadowbrook-practice" }.s("businessId")
            val staffResources = api.get(
                "/v1/businesses/$gp/resources", devToken("dev_staff", "staff@bookanything.test", "Casey Lane"),
            ).arr()
            assertEquals(listOf("Dr Casey Lane"), staffResources.map { it.s("name") })
            val customer = devToken("dev_customer", "customer@bookanything.test", "Charlie Stone")
            val mine = api.get("/v1/me/bookings", customer).obj()
            assertTrue(mine["upcoming"]!!.jsonArray.isNotEmpty() || mine["past"]!!.jsonArray.isNotEmpty())
            val publicPage = api.get("/v1/public/businesses/lumen-physio")
            assertStatus(HttpStatusCode.OK, publicPage)
            assertEquals("Lumen Physiotherapy", publicPage.obj().s("name"))
            assertEquals("hello@lumen-physio.test", publicPage.obj().s("contactEmail"))
            assertTrue(publicPage.obj()["address"]!!.o.s("city") == "Dublin")
            // The seeded site is published: not the default plan, with real team ids and labelled sample reviews.
            val site = publicPage.obj()["site"]!!.o
            assertEquals(false, site.b("isDefault"))
            val sections = site["plan"]!!.o["sections"]!!.jsonArray
            val team = sections.first { it.s("type") == "team" }.o["content"]!!.o["members"]!!.jsonArray.map { it.s("resourceId") }
            assertEquals(site["context"]!!.o["team"]!!.jsonArray.map { it.s("id") }.toSet(), team.toSet())
            val reviews = sections.first { it.s("type") == "testimonials" }.o["content"]!!.o["items"]!!.jsonArray
            assertTrue(reviews.isNotEmpty() && reviews.all { it.s("author") == "Demo customer" && it.s("detail") == "Sample review" })
        }
    }

    @Test
    fun `seed-demo publishes one site per demo with distinct themes, also for existing businesses`() {
        val env = TestEnv()
        DemoSeeder(env.ctx).seed()
        // An existing dev database from before sites existed: businesses and bookings, but no site rows.
        Fixtures.sql("DELETE FROM site_versions WHERE business_id IN (SELECT id FROM businesses WHERE slug IN $SLUGS)")
        Fixtures.sql("DELETE FROM business_sites WHERE business_id IN (SELECT id FROM businesses WHERE slug IN $SLUGS)")
        DemoSeeder(env.ctx).seed()
        DemoSeeder(env.ctx).seed()
        val themes = Fixtures.sqlOne(
            "SELECT string_agg(x.slug || '=' || (s.published->>'theme'), ',' ORDER BY x.slug) FROM business_sites s JOIN businesses x ON " +
                "x.id = s.business_id WHERE x.slug IN $SLUGS",
        ) { it.getString(1) }!!.split(',').associate { it.substringBefore('=') to it.substringAfter('=') }
        assertEquals(
            mapOf("cadence-music" to "playful", "gleam-car-wash" to "bold", "lumen-physio" to "calm", "meadowbrook-practice" to "clinical"),
            themes,
        )
        assertEquals(
            4,
            count(
                "SELECT count(*) FROM site_versions v JOIN businesses x ON x.id = v.business_id WHERE x.slug IN $SLUGS AND v.source = 'seed'",
            ),
        )
        assertEquals(4, count("SELECT count(*) FROM site_versions v JOIN businesses x ON x.id = v.business_id WHERE x.slug IN $SLUGS"))
        assertEquals(
            4,
            count(
                "SELECT count(*) FROM business_sites s JOIN businesses x ON x.id = s.business_id WHERE x.slug IN $SLUGS AND " +
                    "s.published_version = 1 AND s.draft_version = 1",
            ),
        )
        // Publishing sets the business colour to the palette's primary colour.
        assertEquals(
            "#7c3aed", Fixtures.sqlOne("SELECT branding->>'primaryColor' FROM businesses WHERE slug = 'cadence-music'") { it.getString(1) },
        )
    }

    @Test
    fun `seed-demo places, lists and adds deals for the marketplace, idempotently`() {
        val env = TestEnv()
        DemoSeeder(env.ctx).seed()
        DemoSeeder(env.ctx).seed()
        // Every demo business is located (the table geocoder: deterministic, no network); the fictional addresses exactly.
        assertEquals(
            4,
            count(
                "SELECT count(*) FROM business_locations l JOIN businesses x ON x.id = l.business_id WHERE x.slug IN $SLUGS AND " +
                    "l.precision = 'address'",
            ),
        )
        // Paid demos are listed; the Free one is not (it shows the upgrade prompt).
        val listed = Fixtures.sqlOne(
            "SELECT string_agg(x.slug, ',' ORDER BY x.slug) FROM marketplace_listings m JOIN businesses x ON x.id = m.business_id WHERE " +
                "x.slug IN $SLUGS",
        ) { it.getString(1) }
        assertEquals("gleam-car-wash,lumen-physio,meadowbrook-practice", listed)
        assertEquals(1, count("SELECT count(*) FROM offers o JOIN businesses x ON x.id = o.business_id WHERE x.slug = 'gleam-car-wash'"))
        assertEquals(
            1,
            count(
                "SELECT count(*) FROM offers o JOIN businesses x ON x.id = o.business_id WHERE x.slug = 'lumen-physio' AND " +
                    "o.last_minute_hours IS NOT NULL",
            ),
        )
        // Extra fictional businesses across Irish cities, each listed exactly once.
        val extras = count(
            "SELECT count(*) FROM marketplace_listings m JOIN businesses x ON x.id = m.business_id WHERE x.slug NOT IN $SLUGS AND " +
                "x.contact_email LIKE 'hello@%.test'",
        )
        assertTrue(extras >= 7, "extras: $extras")
        assertTrue(
            count(
                "SELECT count(DISTINCT x.city) FROM marketplace_listings m JOIN businesses x ON x.id = m.business_id WHERE " +
                    "x.contact_email LIKE '%.test'",
            ) >= 5,
        )
        withApp(env) { api ->
            val cork = api.get("/v1/public/marketplace/search?city=cork").obj()["items"]!!.jsonArray.map { it.o["business"]!!.o.s("slug") }
            assertTrue("gleam-car-wash" in cork && "lark-and-lute" in cork, cork.toString())
            val deals = api.get(
                "/v1/public/marketplace/search?city=dublin&deals=true",
            ).obj()["items"]!!.jsonArray.map { it.o["business"]!!.o.s("slug") }
            assertTrue("lumen-physio" in deals, deals.toString())
        }
    }

    private companion object {
        const val SLUGS = "('lumen-physio', 'gleam-car-wash', 'cadence-music', 'meadowbrook-practice')"
    }
}
