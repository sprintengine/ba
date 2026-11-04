package ie.bookanything.notifications

import ie.bookanything.jobs.JobWorker
import ie.bookanything.oauth.jsonObj
import ie.bookanything.support.Fixtures
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.OAuthClientSim.Companion.data
import ie.bookanything.support.Roles
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Notifications (section 22): what each person is told in the app (the bell) and, as they choose, by email. */
class InboxTest {
    private suspend fun inbox(api: ie.bookanything.support.Api, user: TestUser): JsonObject =
        api.get("/v1/me/notifications", user.token).obj()

    private fun titles(list: JsonObject) = list["items"]!!.a.map { it.s("title") }

    /** Runs the delayed email jobs now (they wait a minute, so someone already looking at the app isn't emailed). */
    private fun sendEmails(env: TestEnv) {
        Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'inbox-email' AND status = 'pending'")
        JobWorker(env.ctx).drain()
    }

    @Test
    fun `the team hears about customers' new bookings, requests, moves and cancellations`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val roles = Roles.of(api, clinic)
            Fixtures.book(api, clinic, "Approval consult", "2026-10-06T11:00:00+01:00")
            JobWorker(env.ctx).drain() // the team hears with the business's email (a job)
            val request = titles(inbox(api, clinic.owner))
            assertTrue(request.any { it.startsWith("Request to approve") }, request.toString())
            assertTrue(titles(inbox(api, roles.admin)).any { it.startsWith("Request to approve") })
            // Customers aren't told about other people's bookings.
            assertTrue(titles(inbox(api, roles.customer)).isEmpty())

            val mine = Fixtures.book(
                api, clinic, "Consult", "2026-10-08T10:00:00+01:00", token = roles.customer.token, email = roles.customer.email,
            )["booking"]!!.o.s("id")
            JobWorker(env.ctx).drain()
            assertTrue(titles(inbox(api, clinic.owner)).any { it.startsWith("New appointment") || it.startsWith("New booking") })
            assertStatus(
                HttpStatusCode.OK,
                api.post("/v1/me/bookings/$mine/reschedule", jsonOf("start" to "2026-10-08T15:00:00+01:00"), roles.customer.token),
            )
            // Moving back to the first time is news again.
            assertStatus(
                HttpStatusCode.OK,
                api.post("/v1/me/bookings/$mine/reschedule", jsonOf("start" to "2026-10-08T10:00:00+01:00"), roles.customer.token),
            )
            assertEquals(2, inbox(api, clinic.owner)["items"]!!.a.count { it.s("title").contains("moved") })
            assertStatus(HttpStatusCode.OK, api.post("/v1/me/bookings/$mine/cancel", jsonOf(), roles.customer.token))
            val after = inbox(api, clinic.owner)
            val moved = after["items"]!!.a.first { it.s("title").contains("moved") }.o
            assertTrue(moved.s("body").contains("was"), moved.toString())
            assertTrue(titles(after).any { it.contains("cancelled") }, titles(after).toString())
            assertEquals("/dashboard/${clinic.slug}/bookings?booking=$mine", moved.s("link"))

            // A booking made in the dashboard by the business isn't news to it.
            val before = after["unreadCount"]!!.jsonPrimitive.int
            val staffBooking = jsonOf(
                "serviceId" to clinic.service("Consult"), "start" to "2026-10-09T10:00:00+01:00",
                "customer" to mapOf("name" to "Walk In", "email" to "walk.in@example.test"), "answers" to emptyMap<String, String>(),
                "notifyCustomer" to false,
            )
            assertTrue(api.post("${clinic.base}/bookings", staffBooking, clinic.owner.token).status.value in 200..299)
            assertEquals(before, inbox(api, clinic.owner)["unreadCount"]!!.jsonPrimitive.int)

            // Booking emails to members are off by default: the business's contact email already gets them.
            sendEmails(env)
            val team = setOf(clinic.owner.email, roles.admin.email, roles.staff.email)
            assertFalse(env.email.sent.any { it.template == EmailTemplates.NOTIFICATION && it.to in team })
        }
    }

    @Test
    fun `an agent's change waiting for approval is in the bell and emailed, and clears once decided`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val sim = OAuthClientSim.business(api).register("Claude")
            val token = sim.connect(clinic.owner).s("access_token")
            val proposed = data(sim.call(token, "block_time", jsonObj("resourceId" to clinic.resource("Alex"), "date" to "2026-10-09")))
            val id = proposed.s("proposalId")

            val list = inbox(api, clinic.owner)
            assertEquals(1, list["unreadCount"]!!.jsonPrimitive.int)
            val n = list["items"]!!.a.single().o
            assertEquals("agent_approval", n.s("kind"))
            assertEquals("Claude wants to: Block time", n.s("title"))
            assertEquals("/dashboard/${clinic.slug}/approvals/$id", n.s("link"))
            assertEquals(api.get(clinic.base, clinic.owner.token).obj().s("name"), n.s("businessName"))

            sendEmails(env)
            // (Other tests share the job queue: only this owner's emails count.)
            val email = env.email.sent.single { it.template == EmailTemplates.NOTIFICATION && it.to == clinic.owner.email }
            assertEquals(clinic.owner.email, email.to)
            assertTrue(email.html.contains("/dashboard/${clinic.slug}/approvals/$id"))
            sendEmails(env)
            val toOwner = env.email.sent.count { it.template == EmailTemplates.NOTIFICATION && it.to == clinic.owner.email }
            assertEquals(1, toOwner, "emailed once")

            // Approving it clears it from the bell.
            assertStatus(HttpStatusCode.OK, api.post("${clinic.base}/agent-requests/$id/approve", jsonOf(), clinic.owner.token))
            assertEquals(0, inbox(api, clinic.owner)["unreadCount"]!!.jsonPrimitive.int)
        }
    }

    @Test
    fun `people choose what is emailed, read things, and only ever see their own`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val roles = Roles.of(api, clinic)
            val settings = api.get("/v1/me/notification-settings", clinic.owner.token).obj()["items"]!!.a.associate {
                it.s("kind") to it.o["email"]!!.jsonPrimitive.content
            }
            assertEquals("true", settings["agent_approval"])
            assertEquals("false", settings["new_booking"])
            assertStatus(
                HttpStatusCode.OK,
                api.patch("/v1/me/notification-settings", jsonOf("email" to mapOf("agent_approval" to false)), clinic.owner.token),
            )
            assertStatus(
                HttpStatusCode.BadRequest,
                api.patch("/v1/me/notification-settings", jsonOf("email" to mapOf("everything" to true)), clinic.owner.token),
            )

            val sim = OAuthClientSim.business(api).register("Claude")
            val token = sim.connect(clinic.owner).s("access_token")
            sim.call(token, "block_time", jsonObj("resourceId" to clinic.resource("Alex"), "date" to "2026-10-09"))
            Fixtures.book(api, clinic, "Approval consult", "2026-10-06T11:00:00+01:00")
            sendEmails(env)
            assertFalse(env.email.sent.any { it.template == EmailTemplates.NOTIFICATION && it.to == clinic.owner.email }, "opted out")

            val items = inbox(api, clinic.owner)["items"]!!.a
            val first = items.first().s("id")
            assertStatus(HttpStatusCode.NotFound, api.post("/v1/me/notifications/$first/read", jsonOf(), roles.admin.token))
            assertStatus(HttpStatusCode.NoContent, api.post("/v1/me/notifications/$first/read", jsonOf(), clinic.owner.token))
            assertEquals(items.size - 1, inbox(api, clinic.owner)["unreadCount"]!!.jsonPrimitive.int)
            assertStatus(HttpStatusCode.NoContent, api.post("/v1/me/notifications/read-all", jsonOf(), clinic.owner.token))
            assertEquals(0, inbox(api, clinic.owner)["unreadCount"]!!.jsonPrimitive.int)
            assertStatus(HttpStatusCode.Unauthorized, api.get("/v1/me/notifications", null))
        }
    }
}
