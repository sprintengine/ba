package ie.bookanything.notifications

import ie.bookanything.config.AppEnv
import ie.bookanything.config.AuthMode
import ie.bookanything.config.ClerkConfig
import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertStatus
import ie.bookanything.support.parse
import ie.bookanything.support.withApp
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URLDecoder
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NotificationProvidersTest {
    private class FakeTransport(var status: Int = 200, var body: String = """{"id":"email_123"}""") : HttpTransport {
        val calls = CopyOnWriteArrayList<HttpCall>()
        override fun execute(call: HttpCall): HttpResult { calls.add(call); return HttpResult(status, body) }
    }

    private val message = EmailMessage(
        "guest@example.test", "Confirmed: Consult", "text body", "<p>html</p>", "booking_confirmed",
        fromName = "Lumen \"Physio\" <Clinic>", replyTo = "hello@lumen.example", idempotencyKey = "job-1:0",
    )

    @Test
    fun `resend requests carry auth, idempotency key, branded from and both bodies`() {
        val t = FakeTransport()
        val sender = ResendEmailSender("re_test_key", "bookanything <bookings@bookanything.ie>", t)
        val result = sender.send(message)
        assertEquals(SendResult("sent", "email_123"), result)
        val call = t.calls.single()
        assertEquals("POST", call.method)
        assertEquals("https://api.resend.com/emails", call.url)
        assertEquals("Bearer re_test_key", call.headers["Authorization"])
        assertEquals("job-1:0", call.headers["Idempotency-Key"])
        val json = parse(call.body).jsonObject
        assertEquals("\"Lumen Physio Clinic\" <bookings@bookanything.ie>", json["from"]!!.jsonPrimitive.content)
        assertEquals(listOf("guest@example.test"), json["to"]!!.jsonArray.map { it.jsonPrimitive.content })
        assertEquals("hello@lumen.example", json["reply_to"]!!.jsonPrimitive.content)
        assertEquals("<p>html</p>", json["html"]!!.jsonPrimitive.content)
        assertEquals("text body", json["text"]!!.jsonPrimitive.content)

        t.status = 429
        assertFailsWith<RetryableSendException> { sender.send(message) }
        t.status = 503
        assertFailsWith<RetryableSendException> { sender.send(message) }
        t.status = 422; t.body = """{"message":"invalid to"}"""
        assertEquals("failed", sender.send(message).status)
        assertFailsWith<RetryableSendException> { ResendEmailSender("k", "x@y.z", { throw java.io.IOException("down") }).send(message) }
        assertEquals("bookings@bookanything.ie", ResendEmailSender.fromHeader("bookings@bookanything.ie", null))
    }

    @Test
    fun `twilio requests use basic auth and form encoding`() {
        val t = FakeTransport(201, """{"sid":"SM123","status":"queued"}""")
        val sms = TwilioSmsSender("AC123", "secret", "+15005550006", t)
        assertEquals(SendResult("sent", "SM123"), sms.send(SmsMessage("+353 87 000 0000", "Reminder: Consult & more")))
        val call = t.calls.single()
        assertEquals("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json", call.url)
        assertEquals("Basic " + Base64.getEncoder().encodeToString("AC123:secret".toByteArray()), call.headers["Authorization"])
        assertEquals("application/x-www-form-urlencoded", call.headers["Content-Type"])
        val form = call.body.split('&').associate { it.substringBefore('=') to URLDecoder.decode(it.substringAfter('='), Charsets.UTF_8) }
        assertEquals(mapOf("To" to "+353 87 000 0000", "From" to "+15005550006", "Body" to "Reminder: Consult & more"), form)
        val viaService = TwilioSmsSender("AC123", "secret", "MG999", t).buildCall(SmsMessage("+1", "x"))
        assertTrue(viaService.body.contains("MessagingServiceSid=MG999"))
        t.status = 500
        assertFailsWith<RetryableSendException> { sms.send(SmsMessage("+1", "x")) }
        t.status = 400
        assertEquals("failed", sms.send(SmsMessage("+1", "x")).status)
    }

    @Test
    fun `every template renders html and text, escapes input and keeps links`() {
        for (template in EmailTemplates.ALL) {
            val m = EmailPreviews.render(template)!!
            assertEquals(template, m.template)
            assertTrue(m.html.startsWith("<!doctype html>"), template)
            assertTrue(m.html.contains("max-width:560px"), "$template is mobile friendly")
            assertTrue(m.html.contains("Lumen Physiotherapy") && m.text.contains("Lumen Physiotherapy"), template)
            assertTrue(m.subject.isNotBlank() && m.subject.length <= 200, template)
            assertFalse(m.text.contains("<"), "$template text version has no markup")
        }
        val confirmed = EmailPreviews.render(EmailTemplates.BOOKING_CONFIRMED)!!
        assertTrue(confirmed.text.contains("Manage appointment: http://localhost:3000/manage/sample-token"))
        assertTrue(confirmed.html.contains("href=\"http://localhost:3000/manage/sample-token\""))
        assertTrue(EmailPreviews.render(EmailTemplates.CANCELLED)!!.text.contains("A refund of €32.50"))

        val brand = EmailBrand("<script>alert(1)</script> & Co", "#ffff00")
        val html = EmailTemplates.html(brand, EmailTemplates.teamInvitation(brand, "Eve \"x\"", "admin", "https://a.test/i?x=1&y=2"))
        assertFalse(html.contains("<script>"))
        assertTrue(html.contains("&lt;script&gt;"))
        assertTrue(html.contains("https://a.test/i?x=1&amp;y=2"))
        assertTrue(html.contains("color:#111827"), "dark text on a light brand colour")
        assertEquals("#4f46e5", EmailHtml.safeColor("red;background:url(x)"))
    }

    @Test
    fun `booking emails never include answers and reminders send sms on paid plans`() {
        val sent = CopyOnWriteArrayList<SmsMessage>()
        val sms = object : SmsSender {
            override val enabled = true
            override fun send(message: SmsMessage): SendResult { sent.add(message); return SendResult("sent", "SM1") }
        }
        val env = TestEnv(sms = sms)
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            Fixtures.sql(
                "UPDATE businesses SET plan = 'pro', contact_email = 'front.desk@clinic.example' WHERE id = ?", UUID.fromString(clinic.id),
            )
            val body = Fixtures.bookingBody(clinic, "Consult", "2026-10-06T09:00:00+01:00", email = "sms.guest@example.test")
                .replace("\"phone\":null", "\"phone\":\"+353870000001\"")
            val res = api.post("${clinic.public}/bookings", body)
            assertStatus(HttpStatusCode.Created, res)
            val worker = JobWorker(env.ctx)
            worker.drain()
            val confirmation = env.email.sent.single { it.to == "sms.guest@example.test" && it.template == "booking_confirmed" }
            assertFalse(confirmation.text.contains("Sore shoulder") || confirmation.html.contains("Sore shoulder"))
            assertEquals("Test Clinic ${clinic.slug}", confirmation.fromName)
            val business = env.email.sent.single { it.template == "new_booking_for_business" && it.to == "front.desk@clinic.example" }
            assertFalse(business.text.contains("Sore shoulder"), "answers stay in the dashboard")
            assertEquals("sms.guest@example.test", business.replyTo)

            env.clock.advanceMinutes(60)
            worker.runPeriodic(force = true)
            worker.drain()
            assertTrue(env.email.sent.any { it.to == "sms.guest@example.test" && it.template == "booking_reminder" })
            val reminder = sent.single { it.to == "+353870000001" }
            assertTrue(reminder.body.contains("Test Clinic") && reminder.body.contains("/manage/"))
        }
    }

    @Test
    fun `email previews are served in development only`() {
        withApp(TestEnv()) { api ->
            val index = api.get("/v1/dev/emails")
            assertStatus(HttpStatusCode.OK, index)
            assertTrue(index.bodyAsText().contains("booking_confirmed"))
            val html = api.get("/v1/dev/emails/booking_reminder")
            assertTrue(html.bodyAsText().contains("See you soon"))
            assertTrue(api.get("/v1/dev/emails/booking_reminder?format=text").bodyAsText().startsWith("Subject: Reminder"))
            assertEquals(HttpStatusCode.NotFound, api.get("/v1/dev/emails/nope").status)
        }
        val prod = TestConfig.config().copy(
            env = AppEnv.PRODUCTION, authMode = AuthMode.CLERK,
            tokenSecret = "production-secret-0123456789",
            clerk = ClerkConfig("https://clerk.example.test", "https://clerk.example.test/jwks", setOf("https://bookanything.ie"), null),
        )
        withApp(TestEnv(config = prod)) { api ->
            assertEquals(HttpStatusCode.NotFound, api.get("/v1/dev/emails").status)
            assertEquals(HttpStatusCode.NotFound, api.get("/v1/dev/emails/booking_confirmed").status)
        }
    }
}
