package ie.bookanything.availability

import ie.bookanything.business.BusinessRepository
import ie.bookanything.services.ServiceRepository
import ie.bookanything.services.toDef
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.sql.Connection
import java.time.LocalDate
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Availability for several businesses and services computed in one pass matches each computed on its own. */
class ComputeAllTest {
    private val env = TestEnv()
    private val from = LocalDate.parse("2026-10-12")
    private val tuesday = LocalDate.parse("2026-10-13")
    private val saturday = LocalDate.parse("2026-10-17")

    private fun request(conn: Connection, c: Clinic, service: String, group: String? = null): AvailabilityRequest {
        val business = BusinessRepository.findById(conn, UUID.fromString(c.id))!!
        val def = ServiceRepository.get(conn, business.id, UUID.fromString(c.service(service)))!!.toDef()
        return AvailabilityRequest(
            business, def, groupId = group?.let { UUID.fromString(c.groups.getValue(it)) }, from = from, to = from.plusDays(6),
            mode = AvailabilityMode.PUBLIC,
        )
    }

    @Test
    fun `closures, bookings and customer groups stay with their own business`() = withApp(env) { api ->
        val a = Fixtures.clinic(api)
        val b = Fixtures.clinic(api)
        // A is closed all Tuesday; B has a booking on Tuesday morning.
        assertStatus(
            HttpStatusCode.Created,
            api.post(
                "${a.base}/closures",
                jsonOf(
                    "date" to tuesday.toString(), "isAvailable" to false, "startTime" to null, "endTime" to null, "reason" to "Training",
                ),
                a.owner.token,
            ),
        )
        Fixtures.book(api, b, "Consult", "2026-10-13T10:00:00+01:00")

        env.db.read { conn ->
            val requests = listOf(
                request(conn, a, "Consult"), request(conn, b, "Consult"), request(conn, a, "Class"), request(conn, b, "Buffered"),
                // VIP, a restricted group of A, gets the Saturday hours meant for it; customers with no group never do.
                request(conn, a, "Consult", group = "VIP"), request(conn, b, "Consult"),
            )
            val now = env.clock.instant()
            val together = AvailabilityService.computeAll(conn, requests, now)
            assertEquals(requests.map { AvailabilityService.compute(conn, it, now) }, together)

            assertTrue(together[0].getValue(tuesday).isEmpty(), "A's closure")
            assertTrue(together[1].getValue(tuesday).isNotEmpty(), "B is open")
            assertTrue(together[1].getValue(tuesday).none { it.start.toString() == "2026-10-13T09:00:00Z" }, "B's booking")
            assertTrue(together[3].getValue(tuesday).isNotEmpty(), "B's other services too")
            assertTrue(together[4].getValue(saturday).isNotEmpty(), "VIP hours")
            assertTrue(together[5].getValue(saturday).isEmpty(), "no VIP hours without the group")
        }
    }
}
