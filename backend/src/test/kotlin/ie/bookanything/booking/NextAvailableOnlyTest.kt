package ie.bookanything.booking

import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures.book
import ie.bookanything.support.MarketplaceFixtures
import ie.bookanything.support.MarketplaceFixtures.isolatedPoint
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.createBusiness
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.weekdays
import ie.bookanything.support.withApp
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** "Offer the next available time only": customers see one free time at a time and step forward with `after`. */
class NextAvailableOnlyTest {
    private val tue = "2026-10-06"
    private val wed = "2026-10-07"

    /** Ann works 09:00-17:00 and Ben 13:00-17:00 on weekdays; the customer may choose either. */
    private val oneAtATime = testBusiness("One at a time") {
        val ann = person("Ann")
        val ben = person("Ben", hours = weekdays("13:00", "17:00"))
        service("Session", 60) { needs("Therapist", ann, ben, choosable = true) }
    }

    private fun at(date: String, time: String) = "${date}T$time:00+01:00"

    /** A slot start as a query value (`+` would read as a space). */
    private fun q(start: String) = start.replace("+", "%2B")

    private suspend fun availability(res: HttpResponse): JsonObject {
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()
    }

    /** Every slot start in the response, by day (every day of the range is listed). */
    private fun starts(body: JsonObject): Map<String, List<String>> =
        body["days"]!!.a.associate { d -> d.s("date") to d.o["slots"]!!.a.map { it.s("start") } }

    private suspend fun public(api: Api, shop: Clinic, extra: String = "", from: String = tue, to: String = wed) =
        availability(api.get("${shop.public}/availability?serviceId=${shop.service("Session")}&from=$from&to=$to$extra"))

    private suspend fun setNextOnly(api: Api, shop: Clinic, on: Boolean): JsonObject {
        val res = api.patch(shop.base, jsonOf("policies" to mapOf("nextAvailableOnly" to on)), shop.owner.token)
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()["policies"]!!.o
    }

    @Test
    fun `customers are shown the next free time only and step forward with after`() = withApp { api ->
        val shop = api.createBusiness(oneAtATime)
        assertFalse(api.get(shop.public).obj()["policies"]!!.b("nextAvailableOnly"))
        assertFalse(public(api, shop).b("nextAvailableOnly"))

        // The setting round-trips (and merges: other policies keep their values).
        val policies = setNextOnly(api, shop, true)
        assertTrue(policies.b("nextAvailableOnly"))
        assertEquals("15", policies.s("holdMinutes"))
        assertTrue(api.get(shop.base, shop.owner.token).obj()["policies"]!!.b("nextAvailableOnly"))
        assertTrue(api.get(shop.public).obj()["policies"]!!.b("nextAvailableOnly"))

        // One slot across the whole range; every day is still listed.
        val first = public(api, shop)
        assertTrue(first.b("nextAvailableOnly"))
        assertEquals(mapOf(tue to listOf(at(tue, "09:00")), wed to emptyList()), starts(first))
        // Stepping: the next time that day, then past the day's last time to the next day.
        assertEquals(mapOf(tue to listOf(at(tue, "10:00")), wed to emptyList()), starts(public(api, shop, "&after=${q(at(tue, "09:00"))}")))
        assertEquals(mapOf(tue to emptyList(), wed to listOf(at(wed, "09:00"))), starts(public(api, shop, "&after=${q(at(tue, "16:00"))}")))
        assertEquals(
            mapOf(tue to emptyList<String>()),
            starts(public(api, shop, "&after=${q(at(tue, "16:00"))}", to = tue)),
            "nothing after the range's last time",
        )

        // Choosing a person narrows it to their next time.
        val ben = "&resourceId=${shop.resource("Ben")}"
        assertEquals(mapOf(tue to listOf(at(tue, "13:00")), wed to emptyList()), starts(public(api, shop, ben)))
        assertEquals(
            mapOf(tue to emptyList(), wed to listOf(at(wed, "13:00"))), starts(public(api, shop, "$ben&after=${q(at(tue, "16:00"))}")),
        )

        // Staff see every free time.
        val staff = availability(
            api.get("${shop.base}/availability?serviceId=${shop.service("Session")}&from=$tue&to=$tue", shop.owner.token),
        )
        assertFalse(staff.b("nextAvailableOnly"))
        assertEquals((9..16).map { at(tue, "${it.toString().padStart(2, '0')}:00") }, starts(staff)[tue])

        // Booking isn't limited to the time shown.
        book(api, shop, "Session", at(tue, "11:00"))
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.get("${shop.public}/availability?serviceId=${shop.service("Session")}&from=$tue&to=$tue&after=soon"),
        )
        val bad = api.get("${shop.public}/availability?serviceId=${shop.service("Session")}&from=$tue&to=$tue&after=soon").obj()
        assertTrue("after" in bad["error"]!!.o["fields"]!!.o)

        // Off again: `after` still applies, the full grid comes back.
        assertFalse(setNextOnly(api, shop, false).b("nextAvailableOnly"))
        val later = public(api, shop, "&after=${q(at(tue, "09:00"))}", to = tue)
        assertFalse(later.b("nextAvailableOnly"))
        assertEquals(listOf("10:00", "12:00", "13:00", "14:00", "15:00", "16:00").map { at(tue, it) }, starts(later)[tue])
    }

    @Test
    fun `moving a booking by manage link or from my bookings shows one time at a time too`() = withApp { api ->
        val shop = api.createBusiness(oneAtATime)
        setNextOnly(api, shop, true)
        val user = TestUser.create("customer")
        val result = book(api, shop, "Session", at(tue, "15:00"), token = user.token, email = user.email)
        val manage = "/v1/public/manage/${result.s("manageToken")}/availability?from=$tue&to=$tue"
        val mine = "/v1/me/bookings/${result["booking"]!!.s("id")}/availability?from=$tue&to=$tue"

        val viaLink = availability(api.get(manage))
        assertTrue(viaLink.b("nextAvailableOnly"))
        assertEquals(mapOf(tue to listOf(at(tue, "09:00"))), starts(viaLink))
        assertEquals(mapOf(tue to listOf(at(tue, "10:00"))), starts(availability(api.get("$manage&after=${q(at(tue, "09:00"))}"))))
        val viaMe = availability(api.get("$mine&after=${q(at(tue, "10:00"))}", user.token))
        assertTrue(viaMe.b("nextAvailableOnly"))
        assertEquals(mapOf(tue to listOf(at(tue, "11:00"))), starts(viaMe))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("$mine&after=2026-13-01T09:00:00Z", user.token))

        // The move itself may go to any free time.
        val moved = api.post(
            "/v1/public/manage/${result.s("manageToken")}/reschedule", jsonOf("start" to at(tue, "12:00")),
        )
        assertStatus(HttpStatusCode.OK, moved)
        assertEquals(at(tue, "12:00"), moved.obj().s("start"))
    }

    @Test
    fun `marketplace cards show a single next time`() = withApp { api ->
        val p = isolatedPoint()
        val clinic = MarketplaceFixtures.listedClinic(api, p)
        suspend fun nextSlots() = api.get("/v1/public/marketplace/search?lat=${p.latitude}&lng=${p.longitude}&radiusKm=10").obj()
            .let { it["items"]!!.a.single().o["nextSlots"]!!.a }

        assertEquals(3, nextSlots().size)
        setNextOnly(api, clinic, true)
        assertEquals(1, nextSlots().size)
    }
}
