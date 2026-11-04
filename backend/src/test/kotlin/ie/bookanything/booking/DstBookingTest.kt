package ie.bookanything.booking

import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.createBusiness
import ie.bookanything.support.everyDay
import ie.bookanything.support.o
import ie.bookanything.support.runTask
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Daylight saving in Europe/Dublin through the API. Clocks go back on Sunday 25 October 2026 (01:00-02:00 happens
 * twice: first at +01:00, then at +00:00) and forward on Sunday 28 March 2027 (01:00-02:00 does not exist). A night
 * business open 00:00-04:00 every day straddles both changes; a day business holds the bookings that get reminders.
 */
class DstBookingTest {
    private val fallBack = "2026-10-25"
    private val springForward = "2027-03-28"

    private val nightOwls = testBusiness("Night Owls") {
        policies = policies.copy(maxAdvanceDays = 365)
        val owl = person("Owl", hours = everyDay("00:00", "04:00"))
        val day = person("Day", hours = everyDay("09:00", "17:00"))
        service("Hour", 60) { needs("Owl", owl) }
        service("Ninety", 90) { needs("Owl", owl); every(30) }
        service("Day hour", 60) { needs("Day", day) }
    }

    private suspend fun slots(api: Api, shop: Clinic, service: String, date: String) = Fixtures.slots(api, shop, service, date)

    private fun minutes(booking: kotlinx.serialization.json.JsonObject): Long =
        Duration.between(OffsetDateTime.parse(booking.s("start")), OffsetDateTime.parse(booking.s("end"))).toMinutes()

    @Test
    fun `on the fall-back night the repeated hour is offered once per offset, and ordinary nights have four hours`() = withApp { api ->
        val shop = api.createBusiness(nightOwls)
        assertEquals(
            listOf("00:00:00+01:00", "01:00:00+01:00", "01:00:00+00:00", "02:00:00+00:00", "03:00:00+00:00"),
            slots(api, shop, "Hour", fallBack).map { it.substringAfter('T') },
        )
        assertEquals(5, slots(api, shop, "Hour", fallBack).map { OffsetDateTime.parse(it).toInstant() }.distinct().size)
        assertEquals(4, slots(api, shop, "Hour", "2026-10-24").size)
        assertEquals(4, slots(api, shop, "Hour", "2026-10-26").size)
    }

    @Test
    fun `on the spring-forward night the missing hour is never offered`() {
        val env = TestEnv()
        env.clock.instant = Instant.parse("2027-03-20T09:00:00Z")
        withApp(env) { api ->
            val shop = api.createBusiness(nightOwls)
            assertEquals(
                listOf("00:00:00+00:00", "02:00:00+01:00", "03:00:00+01:00"),
                slots(api, shop, "Hour", springForward).map { it.substringAfter('T') },
            )
            assertTrue(slots(api, shop, "Ninety", springForward).none { it.contains("T01:") }, "no 01:xx local time exists that night")
        }
    }

    @Test
    fun `a booking at an ambiguous local time takes the first occurrence unless the offset says otherwise`() = withApp { api ->
        val shop = api.createBusiness(nightOwls)
        val first = Money.book(api, shop, "Hour", "${fallBack}T01:00:00")["booking"]!!.o // no offset
        assertEquals("${fallBack}T01:00:00+01:00", first.s("start"))
        assertEquals(Instant.parse("2026-10-25T00:00:00Z"), OffsetDateTime.parse(first.s("start")).toInstant())
        val second = Money.book(api, shop, "Hour", "${fallBack}T01:00:00+00:00")["booking"]!!.o
        assertEquals("${fallBack}T01:00:00+00:00", second.s("start"))
        assertEquals(
            listOf("00:00:00+01:00", "02:00:00+00:00", "03:00:00+00:00"),
            slots(api, shop, "Hour", fallBack).map {
                it.substringAfter('T')
            },
        )
        // Both are an hour long, and the first one ends at 01:00 local time: the second 01:00 of the night.
        assertEquals(listOf(60L, 60L), listOf(minutes(first), minutes(second)))
        assertEquals("${fallBack}T01:00:00+00:00", first.s("end"))
    }

    @Test
    fun `a booking at a local time that does not exist moves forward by the gap, onto a real instant`() {
        val env = TestEnv()
        env.clock.instant = Instant.parse("2027-03-20T09:00:00Z")
        withApp(env) { api ->
            val shop = api.createBusiness(nightOwls)
            // 01:00 local does not exist on 28 March; it is read as 02:00 Irish Summer Time (the same instant as 01:00 GMT).
            val booked = Money.book(api, shop, "Hour", "${springForward}T01:00:00")["booking"]!!.o
            assertEquals("${springForward}T02:00:00+01:00", booked.s("start"))
            assertEquals("${springForward}T03:00:00+01:00", booked.s("end"))
            // 01:30 becomes 02:30, which is not a start time of the hourly service.
            assertError(
                HttpStatusCode.Conflict, "SLOT_UNAVAILABLE",
                api.post("${shop.public}/bookings", Money.bookingBody(shop, "Hour", "${springForward}T01:30:00")),
            )
        }
    }

    @Test
    fun `durations are real minutes across both changes`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(nightOwls)
            // 90 minutes from 00:30 summer time end at 01:00 winter time: half an hour later on the wall clock.
            val autumn = Money.book(api, shop, "Ninety", "${fallBack}T00:30:00+01:00")["booking"]!!.o
            assertEquals("${fallBack}T01:00:00+00:00", autumn.s("end"))
            assertEquals(90L, minutes(autumn))

            env.clock.instant = Instant.parse("2027-03-20T09:00:00Z")
            val spring = Money.book(api, shop, "Hour", "${springForward}T00:00:00+00:00")["booking"]!!.o
            assertEquals("${springForward}T02:00:00+01:00", spring.s("end"))
            assertEquals(60L, minutes(spring))
            val ninety = Money.book(api, shop, "Ninety", "${springForward}T02:30:00+01:00")["booking"]!!.o
            assertEquals("${springForward}T04:00:00+01:00", ninety.s("end"))
        }
    }

    @Test
    fun `reminders go out exactly 24 real hours before the start, across a clock change`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(nightOwls)
            val worker = JobWorker(env.ctx)
            // (booking start, 1 minute before it is due, when it is due)
            val cases = listOf(
                Triple("${fallBack}T09:00:00+00:00", "2026-10-24T08:59:00Z", "2026-10-24T09:00:00Z"), // 10:00 summer time on Saturday
                Triple("${springForward}T09:00:00+01:00", "2027-03-27T07:59:00Z", "2027-03-27T08:00:00Z"), // 08:00 winter time on Saturday
            )
            for ((start, early, due) in cases) {
                env.clock.instant = Instant.parse(early).minus(Duration.ofDays(5))
                val email = "${unique("owl")}@example.test"
                Money.book(api, shop, "Day hour", start, email = email)
                fun reminders() = env.email.sent.count { it.to == email && it.template == "booking_reminder" }

                env.clock.instant = Instant.parse(early)
                worker.runTask(env.ctx, "send-reminders")
                assertEquals(0, reminders(), "$start at $early")

                env.clock.instant = Instant.parse(due)
                worker.runTask(env.ctx, "send-reminders")
                assertEquals(1, reminders(), "$start at $due")
                val text = env.email.sent.single { it.to == email && it.template == "booking_reminder" }.text
                assertTrue(text.contains("at 09:00"), text)
            }
        }
    }
}
