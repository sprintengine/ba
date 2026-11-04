package ie.bookanything.mcp

import ie.bookanything.oauth.jsonObj
import ie.bookanything.support.Fixtures
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.OAuthClientSim.Companion.data
import ie.bookanything.support.OAuthClientSim.Companion.isError
import ie.bookanything.support.OAuthClientSim.Companion.text
import ie.bookanything.support.Roles
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The day-to-day tools added for members' own apps (and Bo): each proposes, and changes things only once confirmed, through
 * the same commands as the dashboard.
 */
class BusinessToolsTest {
    private class Agent(val sim: OAuthClientSim, val token: String) {
        suspend fun read(tool: String, vararg args: Pair<String, Any?>): JsonObject {
            val res = sim.call(token, tool, jsonObj(*args))
            assertFalse(isError(res), "$tool: ${text(res)}")
            return data(res)["data"]!!.o
        }

        /** Proposes with [tool] and confirms it; returns the outcome. */
        suspend fun change(tool: String, vararg args: Pair<String, Any?>): JsonObject {
            val proposed = sim.call(token, tool, jsonObj(*args))
            assertFalse(isError(proposed), "$tool: ${text(proposed)}")
            val outcome = data(sim.call(token, "confirm_action", jsonObj("proposalId" to data(proposed).s("proposalId"))))
            assertEquals("confirmed", outcome.s("status"), "$tool: $outcome")
            return outcome
        }

        suspend fun refused(tool: String, vararg args: Pair<String, Any?>): String {
            val res = sim.call(token, tool, jsonObj(*args))
            assertTrue(isError(res), "$tool should be refused: ${text(res)}")
            return text(res)
        }
    }

    private suspend fun agent(api: ie.bookanything.support.Api, user: ie.bookanything.support.TestUser): Agent {
        val sim = OAuthClientSim.business(api).register()
        return Agent(sim, sim.connect(user).s("access_token"))
    }

    private fun status(id: String) = Fixtures.sqlOne("SELECT status::text FROM bookings WHERE id = ?::uuid", id) { it.getString(1) }

    @Test
    fun `requests are approved or declined, and a booking's notes, payment at the venue and outcome are recorded`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.allowAgents(api, Fixtures.clinic(api))
            val owner = agent(api, clinic.owner)
            val first = Fixtures.book(api, clinic, "Approval consult", "2026-10-05T11:00:00+01:00")["booking"]!!.o.s("id")
            val second = Fixtures.book(api, clinic, "Approval consult", "2026-10-06T11:00:00+01:00")["booking"]!!.o.s("id")
            assertEquals("pending_approval", status(first))

            owner.change("approve_bookings", "bookingIds" to listOf(first))
            assertEquals("confirmed", status(first))
            owner.change("decline_booking", "bookingId" to second, "reason" to "Fully booked")
            assertEquals("cancelled", status(second)) // declined: cancelled by the business, recorded as booking.declined
            assertTrue(owner.refused("approve_bookings", "bookingIds" to listOf(second)).contains("approved"))

            owner.change("update_booking_notes", "bookingId" to first, "internalNotes" to "Bring the knee brace")
            val detail = owner.read("get_booking", "bookingId" to first)
            assertEquals("Bring the knee brace", detail["booking"]!!.o.s("internalNotes"))
            assertTrue(detail["history"]!!.a.any { it.toString().contains("booking.approved") }, detail.toString())

            // Outcomes only once the booking has started.
            assertTrue(owner.refused("set_booking_outcome", "bookingIds" to listOf(first), "outcome" to "completed").contains("started"))
            env.clock.advanceMinutes(150)
            val later = agent(api, clinic.owner) // access tokens last an hour
            later.change("mark_paid_in_person", "bookingId" to first)
            later.change("set_booking_outcome", "bookingIds" to listOf(first), "outcome" to "completed")
            assertEquals("completed", status(first))
            val paid = later.read("get_booking", "bookingId" to first)
            assertTrue(paid["payments"]!!.a.any { it.toString().contains("€30") }, paid.toString())
        }
    }

    @Test
    fun `customers are added, looked up and changed, and sensitive answers never come back`() = withApp { api ->
        val clinic = Fixtures.allowAgents(api, Fixtures.clinic(api))
        Roles.of(api, clinic) // a Consult with the sensitive "Reason for visit" answered
        val owner = agent(api, clinic.owner)

        val added = owner.change("create_customer", "name" to "Morgan Walk-in", "phone" to "+353 1 555 0199")
        val id = added["links"]!!.a.single().s("url").substringAfterLast('/')
        owner.change("update_customer", "customerId" to id, "email" to "morgan@example.test", "notes" to "Prefers mornings")
        val customer = owner.read("get_customer", "customerId" to id)
        assertEquals("morgan@example.test", customer["customer"]!!.o.s("email"))
        assertEquals("Prefers mornings", customer.s("notes"))
        assertTrue(owner.refused("create_customer", "name" to "Someone Else", "email" to "morgan@example.test").contains("already"))

        val booking = owner.read("find_bookings")["bookings"]!!.a.first().o
        val full = owner.read("get_booking", "bookingId" to booking.s("id"))
        assertFalse(full.toString().contains("Reason for visit"), full.toString())
    }

    @Test
    fun `blocked time can be listed and taken back, and staff see and change only their own`() = withApp { api ->
        val clinic = Fixtures.allowAgents(api, Fixtures.clinic(api))
        val roles = Roles.of(api, clinic)
        val owner = agent(api, clinic.owner)
        val alex = clinic.resource("Alex")
        val blake = clinic.resource("Blake")
        owner.change("block_time", "resourceId" to alex, "date" to "2026-10-09", "reason" to "Training")
        owner.change("block_time", "resourceId" to blake, "date" to "2026-10-09")
        owner.change("close_date", "date" to "2026-12-25", "reason" to "Christmas")

        val all = owner.read("list_time_off")["items"]!!.a.map { it.o }
        assertEquals(
            setOf("Alex", "Blake", null),
            all.map {
                it["resource"]?.let { r -> (r as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { p -> p.isString }?.content }
            }.toSet(),
        )

        val staff = agent(api, roles.staff) // linked to Alex
        val theirs = staff.read("list_time_off")["items"]!!.a.map { it.o }
        assertFalse(theirs.any { it.toString().contains("Blake") }, theirs.toString())
        val blakes = all.first { it.toString().contains("Blake") }.s("id")
        staff.refused("remove_time_off", "timeOffId" to blakes)
        val christmas = all.first { it.toString().contains("Christmas") }.s("id")
        staff.refused("remove_time_off", "timeOffId" to christmas)
        staff.change("remove_time_off", "timeOffId" to all.first { it.toString().contains("Training") }.s("id"))
        owner.change("remove_time_off", "timeOffId" to christmas)
        assertEquals(1, owner.read("list_time_off")["items"]!!.a.size)
    }

    @Test
    fun `admins pause and resume deals`() = withApp { api ->
        val clinic = Fixtures.allowAgents(api, Fixtures.clinic(api))
        val roles = Roles.of(api, clinic)
        assertStatus(
            HttpStatusCode.Created,
            api.post(
                "${clinic.base}/offers",
                jsonOf(
                    "name" to "Quiet mornings", "serviceIds" to listOf(clinic.service("Paid consult")),
                    "discount" to mapOf("type" to "percent", "percent" to 20),
                    "schedule" to mapOf("daysOfWeek" to listOf(2), "timeWindows" to listOf(mapOf("start" to "09:00", "end" to "12:00"))),
                ),
                clinic.owner.token,
            ),
        )
        val admin = agent(api, roles.admin)
        val deal = admin.read("list_deals")["deals"]!!.a.single().o
        assertEquals("active", deal.s("status"))
        admin.change("pause_or_resume_deal", "dealId" to deal.s("id"), "action" to "pause")
        assertEquals("paused", admin.read("list_deals")["deals"]!!.a.single().s("status"))
        assertTrue(admin.refused("pause_or_resume_deal", "dealId" to deal.s("id"), "action" to "pause").contains("already"))

        val staffSim = OAuthClientSim.business(api).register()
        val staffToken = staffSim.connect(roles.staff).s("access_token")
        val names = staffSim.rpc(staffToken, "tools/list")["tools"]!!.a.map { it.s("name") }
        assertFalse("list_deals" in names || "pause_or_resume_deal" in names)
    }
}
