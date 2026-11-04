package ie.bookanything.booking

import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.createBusiness
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.race
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.time.OffsetDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Who gets a time when several people want it: racing requests (released together, so they overlap in Postgres), holds
 * at their exact expiry, services that need several resources at once, and buffers between back-to-back bookings.
 * All through the API; Wednesday 7 October 2026, everyone works 09:00-17:00 Dublin time.
 */
class BookingConcurrencyTest {
    private val wed = "2026-10-07"
    private fun at(time: String) = "${wed}T$time:00+01:00"

    private val studio = testBusiness("Race Studio") {
        val pat = person("Pat")
        val sam = person("Sam")
        val lee = person("Lee")
        val room = space("Room")
        val hall = space("Hall")
        service("Yoga", 60) { capacity(4); needs("Hall", hall) }
        service("Massage", 60) { needs("Therapist", pat); needs("Room", room) }
        service("Room hire", 60) { needs("Room", room) }
        service("Phone consult", 60) { needs("Therapist", pat) }
        service("Couples massage", 60) { needs("Therapists", pat, sam, lee, quantity = 2) }
        service("Single", 60) { needs("Therapist", pat, sam, lee, choosable = true) }
        service("Paid session", 60) { price(4000); needs("Therapist", lee) }
        service("Wrap up", 30) { buffers(after = 15); needs("Therapist", sam); every(15) }
        service("Quick", 30) { needs("Therapist", sam); every(15) }
        service("Prepped", 30) { buffers(before = 15); needs("Therapist", sam); every(15) }
    }

    private suspend fun slots(api: Api, shop: Clinic, service: String) =
        Fixtures.slots(api, shop, service, wed).map { it.substring(11, 16) }

    @Test
    fun `the last seats of a group class go to exactly as many racers as there are seats`() = withApp { api ->
        val shop = api.createBusiness(studio)
        repeat(2) { Money.book(api, shop, "Yoga", at("10:00")) }
        val outcomes = race(6) { api.post("${shop.public}/bookings", Money.bookingBody(shop, "Yoga", at("10:00"))) }
        assertEquals(2, outcomes.count { it.status == HttpStatusCode.Created }, outcomes.toString())
        assertTrue(outcomes.filter { it.status != HttpStatusCode.Created }.all { it.errorCode == "SLOT_UNAVAILABLE" }, outcomes.toString())
        assertTrue("10:00" !in slots(api, shop, "Yoga"))
        val seats = Fixtures.sqlOne(
            "SELECT count(*) FROM bookings WHERE business_id = ? AND start_at = ? AND status = 'confirmed'", shop.id,
            OffsetDateTime.parse(at("10:00")),
        ) { it.getInt(1) }
        assertEquals(4, seats)
    }

    @Test
    fun `bookings moved onto the same free time at once - exactly one gets it, the others stay put`() = withApp { api ->
        val shop = api.createBusiness(studio)
        val bookings = listOf("09:00", "10:00", "11:00", "12:00").map { Money.book(api, shop, "Massage", at(it)) }
        val outcomes = race(bookings.size) { n ->
            val b = bookings[n]
            if (n % 2 == 0) {
                api.post("/v1/public/manage/${b.s("manageToken")}/reschedule", jsonOf("start" to at("15:00")))
            } else {
                api.post("${shop.base}/bookings/${Money.bookingId(b)}/reschedule", jsonOf("start" to at("15:00")), shop.owner.token)
            }
        }
        assertEquals(1, outcomes.count { it.status == HttpStatusCode.OK }, outcomes.toString())
        assertTrue(outcomes.filter { it.status != HttpStatusCode.OK }.all { it.errorCode == "SLOT_UNAVAILABLE" }, outcomes.toString())
        val starts = bookings.map { Money.view(api, it).s("start").substring(11, 16) }
        assertEquals(1, starts.count { it == "15:00" }, starts.toString())
        assertEquals(3, starts.count { it in setOf("09:00", "10:00", "11:00", "12:00") }, starts.toString())
    }

    @Test
    fun `a new booking racing a reschedule for the same time - exactly one gets it`() = withApp { api ->
        val shop = api.createBusiness(studio)
        repeat(3) { round ->
            val time = at("1${round + 3}:00")
            val existing = Money.book(api, shop, "Phone consult", at("1$round:00")) // Pat, whom the new Massage needs too
            val outcomes = race(2) { n ->
                if (n == 0) {
                    api.post("/v1/public/manage/${existing.s("manageToken")}/reschedule", jsonOf("start" to time))
                } else {
                    api.post("${shop.public}/bookings", Money.bookingBody(shop, "Massage", time))
                }
            }
            assertEquals(1, outcomes.count { it.status.value in 200..201 }, outcomes.toString())
            assertEquals(1, outcomes.count { it.errorCode == "SLOT_UNAVAILABLE" }, outcomes.toString())
        }
    }

    @Test
    fun `a new customer's simultaneous bookings on different calendars all succeed, as one customer`() = withApp { api ->
        val shop = api.createBusiness(studio)
        val email = "${unique("twice")}@example.test"
        // Different resources, so nothing serialises them before the customer record is created.
        val services = listOf("Phone consult", "Room hire", "Yoga", "Quick")
        val outcomes = race(services.size) { n ->
            api.post("${shop.public}/bookings", Money.bookingBody(shop, services[n], at("10:00"), email = email))
        }
        assertTrue(outcomes.all { it.status == HttpStatusCode.Created }, outcomes.toString())
        val customers = Fixtures.sqlOne(
            "SELECT count(DISTINCT b.customer_id) FROM bookings b JOIN customers c ON c.id = b.customer_id " +
                "WHERE b.business_id = ? AND c.email = ?",
            shop.id, email,
        ) { it.getInt(1) }
        assertEquals(1, customers)
    }

    @Test
    fun `a request retried with its Idempotency-Key while the first is still running gets the same booking`() = withApp { api ->
        val shop = api.createBusiness(studio)
        // One resource, a pool the retry could fall back on, and seats: every kind of slot answers retries the same way.
        for ((service, time) in listOf("Massage" to "10:00", "Single" to "11:00", "Yoga" to "12:00")) {
            val key = unique("retry-key")
            val body = Money.bookingBody(shop, service, at(time), email = "${unique("retry")}@example.test")
            val outcomes = race(4) { api.post("${shop.public}/bookings", body, headers = mapOf("Idempotency-Key" to key)) }
            assertEquals(1, outcomes.count { it.status == HttpStatusCode.Created }, "$service: $outcomes")
            assertEquals(3, outcomes.count { it.status == HttpStatusCode.OK }, "$service: $outcomes")
            val bookingIds = outcomes.map { Regex("\"id\":\"([0-9a-f-]{36})\"").find(it.body)!!.groupValues[1] }.toSet()
            assertEquals(1, bookingIds.size, "$service: $outcomes")
            assertEquals(listOf(bookingIds.single()), Fixtures.sqlAll("SELECT id::text FROM bookings WHERE idempotency_key = ?", key))
        }
    }

    @Test
    fun `the last redemption of a capped offer goes to one racer, the others get the next best offer`() = withApp { api ->
        val shop = api.createBusiness(studio)
        val offers = listOf(
            Triple("First one", mapOf("type" to "fixed", "amountCents" to 1000), 1),
            Triple("Ten percent", mapOf("type" to "percent", "percent" to 10), null),
        )
        for ((name, discount, cap) in offers) {
            val body = jsonOf(
                "name" to name, "description" to null, "serviceIds" to listOf(shop.service("Paid session")), "discount" to discount,
                "schedule" to mapOf("daysOfWeek" to emptyList<Int>(), "timeWindows" to emptyList<Any>(), "lastMinuteHours" to null),
                "validFrom" to null, "validUntil" to null, "maxRedemptions" to cap, "active" to true,
            )
            assertStatus(HttpStatusCode.Created, api.post("${shop.base}/offers", body, shop.owner.token))
        }
        val times = listOf("10:00", "11:00", "12:00", "13:00")
        val outcomes = race(times.size) { n -> api.post("${shop.public}/bookings", Money.bookingBody(shop, "Paid session", at(times[n]))) }
        assertTrue(outcomes.all { it.status == HttpStatusCode.Created }, outcomes.toString())
        val prices = outcomes.map { Regex("\"priceCents\":(\\d+)").find(it.body)!!.groupValues[1].toInt() }.sorted()
        assertEquals(listOf(3000, 3600, 3600, 3600), prices)
    }

    @Test
    fun `a hold blocks its time until exactly its expiry`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(studio)
            val held = Money.book(api, shop, "Paid session", at("10:00"))
            val expiry = OffsetDateTime.parse(held["booking"]!!.s("holdExpiresAt")).toInstant()
            assertEquals(env.clock.instant().plusSeconds(15 * 60), expiry)

            env.clock.instant = expiry.minusSeconds(1)
            assertTrue("10:00" !in slots(api, shop, "Paid session"))
            assertError(
                HttpStatusCode.Conflict, "SLOT_UNAVAILABLE",
                api.post("${shop.public}/bookings", Money.bookingBody(shop, "Paid session", at("10:00"))),
            )
            assertEquals("held", Money.view(api, held).s("status"))

            env.clock.instant = expiry
            assertTrue("10:00" in slots(api, shop, "Paid session"))
            val taken = Money.book(api, shop, "Paid session", at("10:00"))
            assertEquals("held", taken["booking"]!!.s("status"))
            assertEquals("expired", Money.view(api, held).s("status"))
        }
    }

    @Test
    fun `a service needing a therapist and a room loses the time when either one is taken`() = withApp { api ->
        val shop = api.createBusiness(studio)
        assertTrue(listOf("10:00", "12:00").all { it in slots(api, shop, "Massage") })
        Money.book(api, shop, "Room hire", at("10:00")) // the room, not the therapist
        Money.book(api, shop, "Phone consult", at("12:00")) // the therapist, not the room
        val massage = slots(api, shop, "Massage")
        assertTrue("10:00" !in massage && "12:00" !in massage, massage.toString())
        assertTrue("11:00" in massage && "13:00" in massage, massage.toString())
        for (time in listOf("10:00", "12:00")) {
            assertError(
                HttpStatusCode.Conflict, "SLOT_UNAVAILABLE",
                api.post("${shop.public}/bookings", Money.bookingBody(shop, "Massage", at(time))),
            )
        }
        val booked = Money.book(api, shop, "Massage", at("11:00"))["booking"]!!.o
        assertEquals(listOf("Pat", "Room"), booked["resources"]!!.a.map { it.s("name") }.sorted())
    }

    @Test
    fun `a quantity-two requirement needs two distinct free resources from its pool`() = withApp { api ->
        val shop = api.createBusiness(studio)
        val couples = Money.book(api, shop, "Couples massage", at("09:00"))["booking"]!!.o
        assertEquals(2, couples["resources"]!!.a.map { it.s("id") }.distinct().size)

        Money.book(api, shop, "Single", at("11:00"), resourceId = shop.resource("Pat"))
        assertTrue("11:00" in slots(api, shop, "Couples massage"), "Sam and Lee are still free")
        Money.book(api, shop, "Single", at("11:00"), resourceId = shop.resource("Sam"))
        assertTrue("11:00" !in slots(api, shop, "Couples massage"), "only Lee is left")
        assertError(
            HttpStatusCode.Conflict, "SLOT_UNAVAILABLE",
            api.post("${shop.public}/bookings", Money.bookingBody(shop, "Couples massage", at("11:00"))),
        )
        // Two couples at once would need four therapists: of two racers for 14:00, one wins.
        val outcomes = race(2) { api.post("${shop.public}/bookings", Money.bookingBody(shop, "Couples massage", at("14:00"))) }
        assertEquals(1, outcomes.count { it.status == HttpStatusCode.Created }, outcomes.toString())
    }

    @Test
    fun `buffers keep back-to-back bookings apart through the API`() = withApp { api ->
        val shop = api.createBusiness(studio)
        // "Wrap up" 10:00-10:30 then 15 minutes to tidy: Sam is busy until 10:45.
        val wrap = Money.book(api, shop, "Wrap up", at("10:00"))["booking"]!!.o
        val staffView = api.get("${shop.base}/bookings/${wrap.s("id")}", shop.owner.token).obj()
        assertEquals(listOf(0, 15), listOf(staffView.i("bufferBeforeMinutes"), staffView.i("bufferAfterMinutes")))

        val quick = slots(api, shop, "Quick")
        assertTrue("10:30" !in quick && "10:45" in quick, quick.toString())
        // "Prepped" needs 15 minutes before it: 10:45 would start its preparation at 10:30, inside the tidy-up.
        val prepped = slots(api, shop, "Prepped")
        assertTrue("10:45" !in prepped && "11:00" in prepped, prepped.toString())
        assertError(
            HttpStatusCode.Conflict, "SLOT_UNAVAILABLE", api.post("${shop.public}/bookings", Money.bookingBody(shop, "Quick", at("10:30"))),
        )
        assertError(
            HttpStatusCode.Conflict, "SLOT_UNAVAILABLE",
            api.post("${shop.public}/bookings", Money.bookingBody(shop, "Prepped", at("10:45"))),
        )
        assertStatus(HttpStatusCode.Created, api.post("${shop.public}/bookings", Money.bookingBody(shop, "Quick", at("10:45"))))
        // And the other way round: a booking may not start inside the preparation of the next one.
        Money.book(api, shop, "Prepped", at("14:00")) // Sam busy 13:45-14:30
        val before = slots(api, shop, "Quick")
        assertTrue("13:15" in before && "13:30" !in before, before.toString())
    }
}
