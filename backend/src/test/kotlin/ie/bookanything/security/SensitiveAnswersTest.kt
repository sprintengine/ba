package ie.bookanything.security

import ie.bookanything.jobs.JobWorker
import ie.bookanything.notifications.SendResult
import ie.bookanything.notifications.SmsMessage
import ie.bookanything.notifications.SmsSender
import ie.bookanything.support.Api
import ie.bookanything.support.Bo
import ie.bookanything.support.Clinic
import ie.bookanything.support.FakeModelClient
import ie.bookanything.support.Fixtures
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.Roles
import ie.bookanything.support.SecurityFixtures.dublin
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertStatus
import ie.bookanything.support.createBusiness
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.parse
import ie.bookanything.support.reply
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Answers to questions marked `sensitive` (docs/architecture.md 4, 8, 9 and 17.4; the privacy page: "visible only to that
 * business's staff; left out of confirmation and reminder emails; never sent to AI models"). Owners and admins see them
 * on bookings and in GDPR exports, staff on the bookings of their own calendar (the only bookings they can see at all);
 * nothing else ever carries them: no email, SMS, job payload, audit entry, customer view, MCP result or model prompt.
 */
class SensitiveAnswersTest {
    private val secret = "SECRET-HEALTH-DETAIL-${unique("s")}"
    private val label = "Reason for visit"
    private val shared = "A friend told me"

    private val setup = testBusiness("Sensitive Clinic") {
        val ana = person("Ana")
        val ben = person("Ben")
        service("Consult", 60) { needs("Practitioner", ana, ben, choosable = true) }
        question(label, kind = "textarea", sensitive = true)
        question("How did you hear about us?")
    }

    private class RecordingSms : SmsSender {
        override val enabled = true
        val sent = CopyOnWriteArrayList<SmsMessage>()
        override fun send(message: SmsMessage): SendResult {
            sent += message
            return SendResult("sent", "sms_${sent.size}")
        }
    }

    /** Books [resource]'s calendar with both answers; returns the BookingResult. */
    private suspend fun book(
        api: Api, shop: Clinic, env: TestEnv, resource: String, time: String, customer: TestUser? = null, days: Long = 2,
    ) = api.post(
        "${shop.public}/bookings",
        jsonOf(
            "serviceId" to shop.service("Consult"), "resourceId" to shop.resource(resource), "start" to dublin(env.clock, days, time),
            "customer" to mapOf(
                "name" to "Pat Patient", "email" to (customer?.email ?: "${unique("pat")}@example.test"), "phone" to "+353871234567",
            ),
            "answers" to mapOf(shop.questions.getValue(label) to secret, shop.questions.getValue("How did you hear about us?") to shared),
        ),
        customer?.token,
    ).also { assertStatus(HttpStatusCode.Created, it) }.obj()

    private fun assertNoSecret(what: String, text: String) {
        assertFalse(text.contains(secret), "$what must not contain the sensitive answer: $text")
    }

    @Test
    fun `emails, SMS, queued jobs and the audit log never carry answers`() {
        val sms = RecordingSms()
        val env = TestEnv(sms = sms)
        withApp(env) { api ->
            val shop = api.createBusiness(setup)
            Fixtures.sql("UPDATE businesses SET plan = 'pro' WHERE id = ?::uuid", shop.id) // SMS reminders need a paid plan
            val booking = book(api, shop, env, "Ana", "10:00", days = 1)
            val token = booking.s("manageToken")
            val worker = JobWorker(env.ctx)
            worker.drain()
            // Reminder (email and SMS), a reschedule by the business and a cancellation by the customer.
            env.clock.advanceMinutes(120)
            worker.runPeriodic(force = true)
            worker.drain()
            val id = booking["booking"]!!.s("id")
            val moved = api.post("${shop.base}/bookings/$id/reschedule", jsonOf("start" to dublin(env.clock, 3, "11:00")), shop.owner.token)
            assertStatus(HttpStatusCode.OK, moved)
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/$token/cancel", "{}"))
            worker.drain()

            val mine = env.email.sent.filter { it.toString().contains("Sensitive Clinic") }
            assertTrue(mine.size >= 3, "confirmation, reminder, reschedule/cancel emails: ${mine.map { it.subject }}")
            assertTrue(sms.sent.isNotEmpty(), "the reminder SMS went out")
            (env.email.sent.map { it.toString() } + sms.sent.map { it.toString() }).forEach { message ->
                assertNoSecret("a message", message)
                assertFalse(message.contains(shared) || message.contains(label), "emails carry no answers at all: $message")
            }
            Fixtures.sqlAll("SELECT payload::text FROM jobs").forEach { assertNoSecret("a job payload", it) }
            Fixtures.sqlAll("SELECT summary::text FROM audit_events WHERE business_id = ?", shop.id).forEach { assertNoSecret("audit", it) }
            assertNoSecret("the audit API", api.get("${shop.base}/audit", shop.owner.token).bodyAsText())
            Fixtures.sqlAll("SELECT subject FROM email_log").forEach { assertNoSecret("the email log", it) }
            // The email previews are built from sample data with no answers either.
            assertFalse(api.get("/v1/dev/emails/booking_confirmed?format=text").bodyAsText().contains(label))
        }
    }

    @Test
    fun `the team sees answers as documented, customers and assistants never do`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(setup)
            val admin = Roles.member(api, shop, "admin")
            val staff = Roles.member(api, shop, "staff", "Ana")
            val customer = TestUser.create("patient", "Pat Patient")
            val onAna = book(api, shop, env, "Ana", "10:00", customer)
            val onBen = book(api, shop, env, "Ben", "12:00", customer)
            val (anaId, benId) = listOf(onAna, onBen).map { it["booking"]!!.s("id") }
            assertNoSecret("the booking response", onAna.toString())

            fun answers(json: String) = Regex("\"value\":\"$secret\",\"sensitive\":true").containsMatchIn(json)
            // Owners and admins: booking detail, list and GDPR export.
            for (member in listOf(shop.owner, admin)) {
                assertTrue(answers(api.get("${shop.base}/bookings/$anaId", member.token).bodyAsText()))
                assertTrue(answers(api.get("${shop.base}/bookings/$benId", member.token).bodyAsText()))
                assertTrue(answers(api.get("${shop.base}/bookings?from=2026-10-01&to=2026-10-31", member.token).bodyAsText()))
                val customerId = Fixtures.sqlOne("SELECT customer_id::text FROM bookings WHERE id = ?", anaId) { it.getString(1) }
                val export = api.get("${shop.base}/customers/$customerId/export", member.token)
                assertStatus(HttpStatusCode.OK, export)
                assertTrue(answers(export.bodyAsText()), "the GDPR export is complete")
            }
            // Staff: their own calendar's bookings only (with answers, as the team); nothing on Ben's; no export.
            assertTrue(answers(api.get("${shop.base}/bookings/$anaId", staff.token).bodyAsText()))
            assertEquals(HttpStatusCode.NotFound, api.get("${shop.base}/bookings/$benId", staff.token).status)
            val list = api.get("${shop.base}/bookings?from=2026-10-01&to=2026-10-31", staff.token).bodyAsText()
            assertTrue(list.contains(anaId) && !list.contains(benId), list)
            val customerId = Fixtures.sqlOne("SELECT customer_id::text FROM bookings WHERE id = ?", anaId) { it.getString(1) }
            assertEquals(HttpStatusCode.Forbidden, api.get("${shop.base}/customers/$customerId/export", staff.token).status)
            val profile = api.get("${shop.base}/customers/$customerId", staff.token).bodyAsText()
            assertTrue(profile.contains(anaId) && !profile.contains(benId), "staff see the customer's bookings on their calendar only")

            // The customer: manage link, My bookings, and their AI assistant over the customer MCP.
            assertNoSecret("the manage view", api.get("/v1/public/manage/${onAna.s("manageToken")}").bodyAsText())
            assertNoSecret("my bookings", api.get("/v1/me/bookings", customer.token).bodyAsText())
            val sim = OAuthClientSim(api).register()
            val access = sim.connect(customer).s("access_token")
            for (tool in listOf("list_my_bookings", "get_next_appointment")) {
                val args = if (tool == "list_my_bookings") """{"status":"all","limit":50}""" else "{}"
                val result = sim.call(access, tool, parse(args))
                assertFalse(OAuthClientSim.isError(result), result.toString())
                if (tool == "list_my_bookings") assertTrue(result.toString().contains(anaId), "the booking is listed: $result")
                assertNoSecret("the MCP tool $tool", result.toString())
            }
            // Other members' business: nothing.
            assertEquals(HttpStatusCode.NotFound, api.get("${shop.base}/bookings/$anaId", Fixtures.clinic(api).owner.token).status)
        }
    }

    @Test
    fun `Bo and the AI site builder never see sensitive answers, for owners or staff`() {
        val model = FakeModelClient(structured = { reply("refusal", "") })
        val env = TestEnv(modelClient = model)
        withApp(env) { api ->
            val shop = api.createBusiness(setup)
            val staff = Roles.member(api, shop, "staff", "Ana")
            val booking = book(api, shop, env, "Ana", "10:00", days = 0)
            val id = booking["booking"]!!.s("id")
            model.script(
                """{"rules": [{"match": ["*"], "steps": [
                {"tools": [{"name": "get_schedule", "input": {"date": "${'$'}{today}", "days": 7, "resourceId": null}},
                           {"name": "find_bookings", "input": {"query": "Pat", "status": null, "from": null, "to": null, "customerId": null}},
                           {"name": "find_customers", "input": {"query": "Pat"}}]},
                {"tools": [{"name": "reschedule_booking", "input": {"bookingId": "$id", "start": "${dublin(env.clock, 1, "14:00")}", "resourceIds": null, "notifyCustomer": false}},
                           {"name": "cancel_bookings", "input": {"bookingIds": ["$id"], "reason": null, "refund": "policy", "notifyCustomer": false}}]},
                {"text": "Done looking."}
            ]}]}""",
            )
            for (member in listOf(shop.owner, staff)) {
                val thread = Bo.thread(api, shop, member.token)
                Bo.send(api, shop, member.token, thread, "Tell me about Pat")
            }
            assertEquals(6, model.conversations.size, "three model calls per member")
            val everything = model.conversations.joinToString("\n") { it.toString() }
            assertTrue(everything.contains(shared), "non-sensitive answers are shown, so the check is not vacuous")
            assertNoSecret("Bo's model requests", everything)
            assertFalse(everything.contains(label), "nor the sensitive question")

            assertStatus(HttpStatusCode.OK, api.post("${shop.base}/site/generate", jsonOf("prompt" to "Calm"), shop.owner.token))
            val prompt = model.structuredRequests.single().user
            listOf(secret, label, shared, "Pat Patient").forEach { assertFalse(prompt.contains(it), "site prompt contains $it") }
        }
    }
}
