package ie.bookanything.marketplace

import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Api
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MarketplaceFixtures
import ie.bookanything.support.MarketplaceFixtures.isolatedPoint
import ie.bookanything.support.MarketplaceFixtures.north
import ie.bookanything.support.MutableClock
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MarketplaceSearchTest {
    private suspend fun search(api: Api, query: String): JsonObject {
        val res = api.get("/v1/public/marketplace/search?$query")
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()
    }

    private fun slugs(result: JsonObject) = result["items"]!!.a.map { it.o["business"]!!.s("slug") }

    @Test
    fun `filters by distance, category, text, price, deals and availability, in distance order with pagination`() = withApp { api ->
        val p = isolatedPoint()
        val near = "lat=${p.latitude}&lng=${p.longitude}"
        val a = MarketplaceFixtures.listedClinic(api, p)
        val b = MarketplaceFixtures.listedClinic(api, north(p, 5.0))
        val c = MarketplaceFixtures.listedClinic(api, north(p, 30.0), category = "fitness")

        assertEquals(listOf(a.slug, b.slug), slugs(search(api, "$near&radiusKm=10")))
        val wide = search(api, "$near&radiusKm=50")
        assertEquals(listOf(a.slug, b.slug, c.slug), slugs(wide))
        val distances = wide["items"]!!.a.map { it.o["distanceKm"]!!.jsonPrimitive.double }
        assertEquals(0.0, distances[0])
        assertEquals(5.0, distances[1])
        assertEquals(30.0, distances[2])
        assertEquals(p.latitude, wide["center"]!!.o["latitude"]!!.jsonPrimitive.double)
        assertEquals(listOf(c.slug), slugs(search(api, "$near&radiusKm=50&category=fitness")))

        // Cards: category, from-price, up to three next times, no invented rating.
        val card = wide["items"]!!.a.first().o
        assertEquals("physio", card["category"]!!.o.s("key"))
        assertEquals(JsonNull, card["rating"])
        assertEquals("0", card["priceFromCents"]!!.jsonPrimitive.content)
        val slots = card["nextSlots"]!!.a
        assertTrue(slots.size in 1..3)
        assertTrue(slots.first().s("start") >= "2026-10-05T10:00:00+01:00", "min notice applies")
        assertEquals(slots.size, slots.map { it.s("start") }.toSet().size, "distinct times, even across services")

        // Keyset pagination, one per page.
        val page1 = search(api, "$near&radiusKm=50&limit=1")
        assertEquals(listOf(a.slug), slugs(page1))
        val page2 = search(api, "$near&radiusKm=50&limit=1&cursor=${page1.s("nextCursor")}")
        assertEquals(listOf(b.slug), slugs(page2))
        val page3 = search(api, "$near&radiusKm=50&limit=1&cursor=${page2.s("nextCursor")}")
        assertEquals(listOf(c.slug), slugs(page3))
        assertEquals(null, page3.sOrNull("nextCursor"))
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("/v1/public/marketplace/search?q=clinic&cursor=${page1.s("nextCursor")}"),
        )

        // Text: business name, without a location.
        assertEquals(listOf(b.slug), slugs(search(api, "q=${b.slug}")))

        // Price: A stops offering its paid services; only B and C have something from €40 up.
        Fixtures.sql("UPDATE services SET is_active = false WHERE business_id = ? AND price_cents > 0", UUID.fromString(a.id))
        assertEquals(listOf(b.slug, c.slug), slugs(search(api, "$near&radiusKm=50&minPrice=4000")))
        assertEquals(listOf(a.slug, b.slug, c.slug), slugs(search(api, "$near&radiusKm=50&maxPrice=0")))

        // Deals: only B has an active one; its card lists it and flags discounted times.
        val offer = api.post(
            "${b.base}/offers",
            jsonOf(
                "name" to "Everyday 20%",
                "serviceIds" to listOf(
                    b.service("Consult"), b.service("Paid consult"),
                ),
                "discount" to mapOf("type" to "percent", "percent" to 20),
            ),
            b.owner.token,
        )
        assertStatus(HttpStatusCode.Created, offer)
        val deals = search(api, "$near&radiusKm=50&deals=true")
        assertEquals(listOf(b.slug), slugs(deals))
        assertEquals("20% off", deals["items"]!!.a.single().o["deals"]!!.a.single().s("label"))
        api.post("${b.base}/offers/${offer.obj().s("id")}/pause", null, b.owner.token)
        assertEquals(emptyList(), slugs(search(api, "$near&radiusKm=50&deals=true")))

        // Availability: A closes today, so it is not available today but is this week.
        assertStatus(
            HttpStatusCode.Created,
            api.post(
                "${a.base}/closures",
                jsonOf(
                    "date" to "2026-10-05", "isAvailable" to false,
                    "startTime" to null, "endTime" to null, "reason" to "Training",
                ),
                a.owner.token,
            ),
        )
        assertEquals(listOf(b.slug, c.slug), slugs(search(api, "$near&radiusKm=50&available=today")))
        assertEquals(listOf(a.slug, b.slug, c.slug), slugs(search(api, "$near&radiusKm=50&available=week")))
        assertEquals(listOf(b.slug, c.slug), slugs(search(api, "$near&radiusKm=50&date=2026-10-05")))
        // Sunday: nobody works weekends in the fixture.
        assertEquals(emptyList(), slugs(search(api, "$near&radiusKm=50&date=2026-10-11")))

        // Downgrading to Free or going back to draft hides a listing.
        MarketplaceFixtures.setPlan(c, "free")
        Fixtures.sql("UPDATE businesses SET status = 'draft' WHERE id = ?", UUID.fromString(b.id))
        assertEquals(listOf(a.slug), slugs(search(api, "$near&radiusKm=50")))
    }

    @Test
    fun `availability filtering keeps scanning past unavailable businesses`() = withApp { api ->
        val p = isolatedPoint()
        val closed = (1..3).map { MarketplaceFixtures.listedClinic(api, north(p, it.toDouble())) }
        val open = MarketplaceFixtures.listedClinic(api, north(p, 10.0))
        closed.forEach { c ->
            api.post(
                "${c.base}/closures",
                jsonOf("date" to "2026-10-05", "isAvailable" to false, "startTime" to null, "endTime" to null, "reason" to null),
                c.owner.token,
            )
        }
        val result = search(api, "lat=${p.latitude}&lng=${p.longitude}&radiusKm=20&available=today&limit=1")
        assertEquals(listOf(open.slug), slugs(result))
    }

    @Test
    fun `owners list on the marketplace from Pro, with geocoding through the job queue`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val settings = api.get("${clinic.base}/marketplace", clinic.owner.token).obj()
            assertEquals(false, settings.b("listed"))
            assertEquals("physio", settings.s("category"))
            assertEquals(false, settings.b("eligible"))
            assertEquals("missing_address", settings.s("locationStatus"))
            assertTrue(settings["categories"]!!.a.any { it.s("key") == "car-wash" })

            // Free plan: the upgrade prompt.
            assertError(
                HttpStatusCode.Conflict, "PLAN_LIMIT_REACHED",
                api.put("${clinic.base}/marketplace", jsonOf("listed" to true), clinic.owner.token),
            )

            MarketplaceFixtures.setPlan(clinic, "pro")
            assertStatus(
                HttpStatusCode.OK,
                api.patch(
                    clinic.base,
                    jsonOf(
                        "address" to mapOf(
                            "line1" to "1 Test Street", "line2" to null,
                            "city" to "Dublin", "postcode" to "D02 AB12",
                        ),
                    ),
                    clinic.owner.token,
                ),
            )
            assertEquals("pending", api.get("${clinic.base}/marketplace", clinic.owner.token).obj().s("locationStatus"))
            JobWorker(env.ctx).drain()
            val located = api.get("${clinic.base}/marketplace", clinic.owner.token).obj()
            assertEquals("located", located.s("locationStatus"))
            assertEquals("postcode", located["location"]!!.o.s("precision"))

            assertError(
                HttpStatusCode.BadRequest, "INVALID_REQUEST",
                api.put("${clinic.base}/marketplace", jsonOf("listed" to true, "category" to "nope"), clinic.owner.token),
            )
            val listed = api.put("${clinic.base}/marketplace", jsonOf("listed" to true, "category" to "massage"), clinic.owner.token).obj()
            assertEquals(true, listed.b("listed"))
            assertEquals("massage", listed.s("category"))
            assertTrue(
                api.get(
                    "/v1/public/marketplace/search?city=dublin&q=${clinic.slug}",
                ).obj()["items"]!!.a.any { it.o["business"]!!.s("slug") == clinic.slug },
            )

            // An address the table can't place is recorded as not found.
            api.patch(
                clinic.base, jsonOf("address" to mapOf("line1" to "1 Main St", "line2" to null, "city" to "Atlantis", "postcode" to null)),
                clinic.owner.token,
            )
            JobWorker(env.ctx).drain()
            assertEquals("not_found", api.get("${clinic.base}/marketplace", clinic.owner.token).obj().s("locationStatus"))

            // Only owners and admins manage it.
            val staff = MarketplaceFixtures.member(api, clinic, "staff")
            assertError(HttpStatusCode.Forbidden, "FORBIDDEN", api.get("${clinic.base}/marketplace", staff.token))
            val admin = MarketplaceFixtures.member(api, clinic, "admin")
            assertEquals(false, api.put("${clinic.base}/marketplace", jsonOf("listed" to false), admin.token).obj().b("listed"))
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("${clinic.base}/marketplace", TestUser.create("stranger").token))
            assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("${clinic.base}/marketplace"))
        }
    }

    @Test
    fun `meta lists categories and cities with listing counts`() = withApp { api ->
        val meta = api.get("/v1/public/marketplace/meta").obj()
        assertTrue(meta["categories"]!!.a.any { it.s("key") == "physio" })
        val dublin = meta["cities"]!!.a.first { it.s("slug") == "dublin" }.o
        assertEquals("Dublin", dublin.s("name"))
        assertTrue(dublin["listingCount"]!!.jsonPrimitive.content.toInt() >= 0)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("/v1/public/marketplace/search?city=atlantis"))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("/v1/public/marketplace/search?lat=abc&lng=1"))
    }

    @Test
    fun `search is rate limited per client`() {
        // A clock of its own so no other test shares the rate-limit window.
        val env = TestEnv(clock = MutableClock(DEFAULT_NOW.plusSeconds(86_400L * 400 + 7)), config = TestConfig.config(rateLimits = true))
        withApp(env) { api ->
            repeat(MARKETPLACE_SEARCH_LIMIT.max) {
                assertStatus(HttpStatusCode.OK, api.get("/v1/public/marketplace/search?q=zz-nothing-matches"))
            }
            assertError(HttpStatusCode.TooManyRequests, "RATE_LIMITED", api.get("/v1/public/marketplace/search?q=zz-nothing-matches"))
        }
    }
}
