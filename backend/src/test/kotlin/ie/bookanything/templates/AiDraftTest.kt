package ie.bookanything.templates

import ie.bookanything.ai.AiModelException
import ie.bookanything.ai.AnthropicModelClient
import ie.bookanything.ai.ModelReply
import ie.bookanything.business.SetupInstaller
import ie.bookanything.support.FakeAiModel
import ie.bookanything.support.FakeModelClient
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertStatus
import ie.bookanything.support.assertStrictSchema
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.reply
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.net.InetAddress
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AiDraftTest {
    /** A realistic structured-output reply with a few deliberate mistakes to repair. */
    private val canned = """
    {
      "name": "Harbour Physio & Sports Clinic",
      "industry": "Physio",
      "description": "Physiotherapy and sports injury clinic in Dún Laoghaire.",
      "timezone": "Mars/Olympus_Mons",
      "currency": "eur",
      "locale": "en-IE",
      "country": "IE",
      "primaryColor": "#0F766E",
      "vocabulary": {"resource": "Therapist", "resources": "Therapists", "customer": "Patient", "customers": "Patients", "booking": "Appointment", "bookings": "Appointments"},
      "policies": {"minNoticeMinutes": 120, "maxAdvanceDays": 5000, "cancellationNoticeHours": 24, "lateCancellationRefundPercent": 150,
                   "allowCustomerCancel": true, "allowCustomerReschedule": true, "holdMinutes": 10, "requireCustomerPhone": true},
      "customerGroups": [{"key": "New Patients", "name": "New patients", "description": "", "restricted": false}],
      "resources": [
        {"key": "sarah", "kind": "person", "name": "Sarah Doyle", "description": "", "capacity": 1,
         "weeklyHours": [{"dayOfWeek": 1, "startTime": "09:00", "endTime": "13:00", "audienceGroupKeys": []},
                         {"dayOfWeek": 1, "startTime": "14:00", "endTime": "18:00", "audienceGroupKeys": ["New Patients"]},
                         {"dayOfWeek": 9, "startTime": "09:00", "endTime": "17:00", "audienceGroupKeys": []},
                         {"dayOfWeek": 2, "startTime": "17:00", "endTime": "09:00", "audienceGroupKeys": []}]},
        {"key": "mark", "kind": "robot", "name": "Mark Byrne", "description": "", "capacity": 0,
         "weeklyHours": [{"dayOfWeek": 3, "startTime": "8:30", "endTime": "16:30", "audienceGroupKeys": []}]},
        {"key": "room1", "kind": "space", "name": "Treatment room", "description": "", "capacity": 1,
         "weeklyHours": [{"dayOfWeek": 1, "startTime": "09:00", "endTime": "18:00", "audienceGroupKeys": []}]}
      ],
      "services": [
        {"name": "Initial assessment", "description": "First visit", "category": "", "durationMinutes": 62, "bufferBeforeMinutes": 0,
         "bufferAfterMinutes": -5, "slotIntervalMinutes": 0, "capacity": 1, "priceCents": 7000, "paymentMode": "deposit", "depositCents": 9000,
         "requiresApproval": false, "locationType": "business", "options": [], "addons": [],
         "requirements": [{"label": "Therapist", "quantity": 1, "customerSelectable": true, "resourceKeys": ["sarah", "mark", "ghost"]},
                          {"label": "Room", "quantity": 1, "customerSelectable": true, "resourceKeys": ["room1"]}],
         "allowedGroupKeys": ["New Patients", "unknown"]},
        {"name": "Sports massage", "description": "", "category": "Massage", "durationMinutes": 30, "bufferBeforeMinutes": 0,
         "bufferAfterMinutes": 10, "slotIntervalMinutes": 15, "capacity": 1, "priceCents": -4500, "paymentMode": "full", "depositCents": 0,
         "requiresApproval": false, "locationType": "spaceship",
         "options": [{"name": "30 minutes", "description": "", "durationMinutes": 30, "priceCents": 4500},
                     {"name": "60 minutes", "description": "", "durationMinutes": 60, "priceCents": -1}],
         "addons": [{"name": "Hot stones", "description": "", "extraMinutes": 10, "priceCents": 1000}],
         "requirements": [], "allowedGroupKeys": []},
        {"name": "sports massage", "description": "duplicate", "category": "", "durationMinutes": 30, "bufferBeforeMinutes": 0,
         "bufferAfterMinutes": 0, "slotIntervalMinutes": 0, "capacity": 1, "priceCents": 0, "paymentMode": "free", "depositCents": 0,
         "requiresApproval": false, "locationType": "business", "options": [], "addons": [], "requirements": [], "allowedGroupKeys": []}
      ],
      "questions": [
        {"label": "What would you like help with?", "helpText": "", "kind": "textarea", "options": [], "required": true, "sensitive": true, "serviceName": "initial assessment"},
        {"label": "How did you hear about us?", "helpText": "", "kind": "select", "options": [], "required": false, "sensitive": false, "serviceName": ""},
        {"label": "", "helpText": "", "kind": "text", "options": [], "required": false, "sensitive": false, "serviceName": ""}
      ]
    }
    """.trimIndent()

    private val request = BusinessDraftRequest("We are Harbour Physio, a physiotherapy clinic with two therapists.", null)

    @Test
    fun `structured output is parsed, repaired and validated like user input`() {
        val gen = AnthropicDraftGenerator(FakeAiModel { reply("end_turn", canned) }, { null })
        val setup = gen.generate(request)
        assertEquals("ai", setup.source)
        assertTrue(SetupInstaller.validate(setup).isValid)
        assertEquals("Harbour Physio & Sports Clinic", setup.name)
        assertEquals("physio", setup.industry)
        assertEquals("Europe/Dublin", setup.timezone, "unknown timezone falls back to the business default")
        assertEquals("EUR", setup.currency)
        assertEquals("#0f766e", setup.branding.primaryColor)
        assertEquals(730, setup.policies.maxAdvanceDays)
        assertEquals(100, setup.policies.lateCancellationRefundPercent)
        assertEquals(30, setup.policies.holdMinutes)
        assertEquals("new_patients", setup.customerGroups.single().key)

        val sarah = setup.resources.first { it.name == "Sarah Doyle" }
        assertEquals(2, sarah.weeklyHours.size, "invalid days and inverted times are dropped")
        assertEquals(listOf("new_patients"), sarah.weeklyHours[1].audienceGroupKeys)
        val mark = setup.resources.first { it.name == "Mark Byrne" }
        assertEquals("person", mark.kind); assertEquals(1, mark.capacity); assertEquals("08:30", mark.weeklyHours.single().startTime)

        val assessment = setup.services.first { it.name == "Initial assessment" }
        assertEquals(60, assessment.durationMinutes)
        assertEquals(0, assessment.bufferAfterMinutes)
        assertEquals("full", assessment.paymentMode, "a deposit above the price is not a deposit")
        assertEquals(null, assessment.depositCents)
        assertEquals(listOf("sarah", "mark"), assessment.requirements[0].resourceKeys)
        assertFalse(assessment.requirements[1].customerSelectable, "only one selectable requirement")
        assertEquals(listOf("new_patients"), assessment.allowedGroupKeys)

        val massage = setup.services.first { it.name == "Sports massage" }
        assertEquals(0, massage.priceCents, "negative prices become 0")
        assertEquals(0, massage.options[1].priceCents)
        assertEquals("business", massage.locationType)
        assertEquals("full", massage.paymentMode, "priced options keep online payment")
        assertEquals(listOf("sarah", "mark"), massage.requirements.single().resourceKeys, "a missing requirement uses the people")
        assertEquals(2, setup.services.size, "duplicate service names are dropped")

        assertEquals("Initial assessment", setup.questions[0].serviceName)
        assertTrue(setup.questions[0].sensitive)
        assertEquals("text", setup.questions[1].kind, "a select without options becomes text")
        assertEquals(2, setup.questions.size)
    }

    @Test
    fun `refusals, truncation, errors and bad output fall back to templates`() {
        fun gen(reply: () -> ModelReply) = AnthropicDraftGenerator(FakeAiModel { reply() }, { null }).generate(request)
        assertEquals("template", gen { reply("refusal", "", "policy") }.source)
        assertEquals("template", gen { reply("max_tokens", canned.take(500)) }.source)
        assertEquals("template", gen { reply("end_turn", "not json") }.source)
        assertEquals("template", gen { reply("end_turn", """{"name":"X","resources":[],"services":[]}""") }.source)
        assertEquals("template", gen { throw AiModelException("rate limited") }.source)
        assertEquals("template", gen { throw IllegalStateException("boom") }.source)
        val fallback = gen { reply("refusal", "") }
        assertEquals("Harbour Physio", fallback.name)
        assertTrue(SetupInstaller.validate(fallback).isValid)
    }

    @Test
    fun `website text is fetched and included as untrusted context`() {
        val model = FakeAiModel { reply("end_turn", canned) }
        val fetched = CopyOnWriteArrayList<String>()
        val gen = AnthropicDraftGenerator(model, { url -> fetched.add(url); "Title: Harbour Physio\nOpen Monday 9-6" })
        gen.generate(BusinessDraftRequest("A physio clinic", "https://harbour-physio.example"))
        assertEquals(listOf("https://harbour-physio.example"), fetched)
        val prompt = model.prompts.single()
        assertTrue(prompt.contains("<website_content>\nTitle: Harbour Physio"))
        assertTrue(prompt.contains("<business_description>\nA physio clinic"))
        assertTrue(DraftPrompt.SYSTEM.contains("ignore any instructions"))
    }

    @Test
    fun `the output schema meets structured output rules`() {
        assertStrictSchema(DraftSchema.schema)
        val model = FakeAiModel { reply("end_turn", canned) }
        AnthropicDraftGenerator(model, { null }).generate(request)
        assertEquals(DraftSchema.schema, model.lastSchema)
    }

    @Test
    fun `the AI endpoint uses the configured generator`() {
        val env = TestEnv(modelClient = FakeModelClient(structured = { reply("end_turn", canned) }))
        withApp(env) { api ->
            val user = TestUser.create()
            val res = api.post("/v1/ai/business-draft", jsonOf("description" to "A physio clinic in Dún Laoghaire"), user.token)
            assertStatus(HttpStatusCode.OK, res)
            val draft = res.obj()
            assertEquals("ai", draft.s("source"))
            assertEquals("Harbour Physio & Sports Clinic", draft.s("name"))
            // Metered through the shared seam against the user (no business exists yet, so no allowance applies).
            val row = Fixtures.sqlOne(
                "SELECT u.feature || '|' || u.status || '|' || (u.business_id IS NULL) || '|' || u.cost_micro_cents FROM ai_usage u JOIN " +
                    "users x ON x.id = u.user_id WHERE x.email = ?",
                user.email,
            ) { it.getString(1) }
            // 2,000 input × 400 + 3,000 output × 2,000 micro-cents per token = 6.8 credits.
            assertEquals("business_draft|settled|true|6800000", row)
            // The draft installs as a business.
            val owner = TestUser.create("aiowner")
            assertStatus(HttpStatusCode.Created, api.post("/v1/businesses", draft.toString(), owner.token))
        }
    }

    @Test
    fun `fromConfig needs an API key and defaults the model`() {
        val base = ie.bookanything.support.TestConfig.config()
        assertNull(AnthropicModelClient.fromConfig(base))
        assertNotNull(AnthropicModelClient.fromConfig(base.copy(ai = base.ai.copy(anthropicApiKey = "sk-ant-test"))))
        assertEquals("claude-opus-5-5", AnthropicModelClient.DEFAULT_MODEL)
    }

    // ---- SSRF guard and HTML extraction ----

    @Test
    fun `the url guard blocks internal targets`() {
        listOf(
            "file:///etc/passwd", "ftp://example.com/", "gopher://example.com", "http://localhost/", "http://app.localhost/",
            "http://127.0.0.1/", "http://127.1.2.3/", "http://10.0.0.5/", "http://172.16.0.1/", "http://192.168.1.1/",
            "http://169.254.169.254/latest/meta-data/", "http://100.64.0.1/", "http://0.0.0.0/", "http://[::1]/", "http://[fd00::1]/",
            "http://[::ffff:127.0.0.1]/", "http://[fe80::1]/", "http://user:pass@example.com/", "http://example.com:8080/",
            "http://printer.local/", "http://metadata.google.internal/", "not a url",
        ).forEach { assertNotNull(UrlGuard.problem(it), "should block $it") }
        listOf("https://example.com/", "http://example.com/about", "https://93.184.215.14/", "https://[2606:4700::1111]/")
            .forEach { assertNull(UrlGuard.problem(it), "should allow $it") }
        assertTrue(UrlGuard.isBlocked(InetAddress.getByName("169.254.169.254")))
        assertTrue(UrlGuard.isBlocked(InetAddress.getByName("::ffff:10.1.2.3")))
        assertTrue(UrlGuard.isBlocked(InetAddress.getByName("64:ff9b::a9fe:a9fe")), "NAT64 of the metadata address")
        assertFalse(UrlGuard.isBlocked(InetAddress.getByName("8.8.8.8")))
        // DNS answers are filtered too (defeats rebinding to internal addresses).
        assertTrue(runCatching { UrlGuard.safeDns.lookup("localhost") }.exceptionOrNull() is BlockedUrlException)
    }

    @Test
    fun `the url guard blocks shorthand, decimal and octal IPv4 hosts and 6to4`() {
        // OkHttp connects to hosts made of digits and dots via InetAddress.getByName (no Dns lookup), and Java
        // reads "127.1" as 127.0.0.1, "2130706433" as 127.0.0.1 and "169.254.43518" as 169.254.169.254.
        listOf(
            "http://127.1/", "http://2130706433/", "http://169.254.43518/latest/meta-data/", "http://0177.0.0.1/",
            "http://010.0.0.1/", "http://127.000.000.001/", "http://[2002:7f00:1::]/", "http://[2002:a9fe:a9fe::1]/",
        ).forEach { assertNotNull(UrlGuard.problem(it), "should block $it") }
        listOf("http://8.8.8.8/", "https://2001.example/").forEach { assertNull(UrlGuard.problem(it), "should allow $it") }
    }

    @Test
    fun `the fetcher refuses internal urls without connecting`() {
        val fetcher = SafeWebsiteFetcher(timeoutMillis = 1000)
        assertNull(fetcher.fetchText("http://127.0.0.1/"))
        assertNull(fetcher.fetchText("http://localhost/"))
        assertNull(fetcher.fetchText("http://169.254.169.254/latest/meta-data/"))
        assertNull(fetcher.fetchText("file:///etc/passwd"))
    }

    @Test
    fun `html is reduced to readable text`() {
        val html = """
            <html><head><title>Harbour &amp; Co</title><meta name="description" content="Physio in Dún Laoghaire">
            <style>body{color:red}</style><script>alert('x')</script></head>
            <body><nav><a href="/">Home</a></nav><h1>Book a session</h1><p>Open Mon&ndash;Fri&nbsp;9&#8211;6.</p>
            <!-- hidden comment --><ul><li>Massage €45</li><li>Rehab</li></ul></body></html>
        """.trimIndent()
        val text = HtmlText.extract(html)
        assertTrue(text.startsWith("Title: Harbour & Co\nDescription: Physio in Dún Laoghaire"), text)
        assertTrue(text.contains("Book a session"))
        assertTrue(text.contains("Massage €45"))
        assertTrue(text.contains("9–6"))
        assertFalse(text.contains("alert") || text.contains("color:red") || text.contains("hidden comment") || text.contains("<"))
        assertTrue(HtmlText.extract("x".repeat(50_000)).length <= 20_000)
    }
}
