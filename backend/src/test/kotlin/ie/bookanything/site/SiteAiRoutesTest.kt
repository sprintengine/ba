package ie.bookanything.site

import ie.bookanything.ai.ModelReply
import ie.bookanything.http.ApiJson
import ie.bookanything.site.PlanJson.with
import ie.bookanything.site.ai.AiFaqItem
import ie.bookanything.site.ai.AiSection
import ie.bookanything.site.ai.AiSiteGenerator
import ie.bookanything.site.ai.AiSiteOutput
import ie.bookanything.site.ai.AiTeamMember
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.FakeModelClient
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Fixtures.book
import ie.bookanything.support.MutableClock
import ie.bookanything.support.TestCredits
import ie.bookanything.support.TestCredits.grouped
import ie.bookanything.support.TestCredits.shown
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.parse
import ie.bookanything.support.reply
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.serializer
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SiteAiRoutesTest {
    /** A fake provider answering structured requests from the prompt text; calls go through the metered seam. */
    private class FakeModel(reply: (user: String) -> ModelReply) {
        val client = FakeModelClient(structured = { reply(it.user) })
        val prompts: List<String> get() = client.structuredRequests.map { it.user }
    }

    private fun aiEnv(model: FakeModel, clock: MutableClock = MutableClock(ie.bookanything.support.DEFAULT_NOW)) =
        TestEnv(clock = clock, modelClient = model.client)

    /** A model reply built from the clinic's real ids plus invented ones and a made-up testimonial. */
    private fun output(clinic: Clinic): String {
        val out = AiSiteOutput(
            theme = "bold", primaryColor = "#1d4ed8", seoTitle = "Test Clinic", seoDescription = "Physiotherapy you can book online.",
            sections = listOf(
                AiSection(
                    type = "hero", headline = "Move better", subheadline = "Book online. Guaranteed results.", ctaLabel = "Book now",
                    pattern = "rays",
                ),
                AiSection(
                    type = "services", heading = "Treatments",
                    serviceIds = listOf(clinic.service("Consult"), UUID.randomUUID().toString()),
                ),
                AiSection(
                    type = "team", heading = "Team",
                    team = listOf(AiTeamMember(clinic.resource("Alex"), "Alex bio"), AiTeamMember(clinic.resource("Room"), "A room")),
                ),
                AiSection(type = "testimonials", heading = "Reviews"),
                AiSection(type = "faq", heading = "FAQ", faq = listOf(AiFaqItem("How do I book?", "Choose a time online."))),
                AiSection(type = "cta", headline = "Ready?", ctaLabel = "Book"),
            ),
        )
        val json = ApiJson.encodeToJsonElement(serializer<AiSiteOutput>(), out)
        return json.with(
            "sections[3].items",
            JsonArray(listOf(JsonObject(mapOf("quote" to JsonPrimitive("Best physio in Ireland"), "author" to JsonPrimitive("Mary"))))),
        ).toString()
    }

    private suspend fun generate(api: Api, clinic: Clinic, body: String? = jsonOf("prompt" to "Make it bold")) =
        api.post("${clinic.base}/site/generate", body, clinic.owner.token)

    private suspend fun edit(api: Api, clinic: Clinic, instruction: String, baseVersion: Int? = null) =
        api.post("${clinic.base}/site/edit", jsonOf("instruction" to instruction, "baseVersion" to baseVersion), clinic.owner.token)

    private suspend fun ok(res: HttpResponse): JsonObject { assertStatus(HttpStatusCode.OK, res); return res.obj() }

    private fun strings(o: JsonObject, key: String) = o[key]!!.jsonArray.map { it.jsonPrimitive.content }

    /** Records [credits] of settled usage for the clinic, as if earlier calls had cost that much. */
    private val allowances = TestCredits.allowances
    private val freeLimit = TestCredits.micro(allowances.free)
    private val proLimit = TestCredits.micro(allowances.pro)
    private val businessLimit = TestCredits.micro(allowances.business)

    private fun seedCredits(clinic: Clinic, microCents: Long, at: Instant = ie.bookanything.support.DEFAULT_NOW) =
        Fixtures.sql(
            "INSERT INTO ai_usage (business_id, feature, model, status, cost_micro_cents, price_version, created_at) VALUES (?, " +
                "'assistant', 'claude-opus-5-5', 'settled', ?, '2026-09-01', ?)",
            UUID.fromString(clinic.id), microCents, java.time.OffsetDateTime.ofInstant(at, java.time.ZoneOffset.UTC),
        )

    private fun credits(state: JsonObject) = state["ai"]!!.o["credits"]!!.o

    private fun ledger(clinic: Clinic) = Fixtures.sqlOne(
        "SELECT string_agg(feature || '|' || status, ',' ORDER BY created_at, id) FROM ai_usage WHERE business_id = ?", clinic.id,
    ) { it.getString(1) }

    private fun errorMessage(body: String) = parse(body).o["error"]!!.o.s("message")

    @Test
    fun `generate saves the repaired AI plan as a metered, audited version`() {
        lateinit var clinic: Clinic
        val model = FakeModel { reply("end_turn", output(clinic)) }
        withApp(aiEnv(model)) { api ->
            clinic = Fixtures.clinic(api)
            val result = ok(generate(api, clinic))
            assertEquals("ai", result.s("source"))
            assertEquals(JsonNull, result["previousVersion"])
            assertEquals(JsonNull, result["message"])
            assertTrue(strings(result, "changes").contains("Theme: Calm → Bold"))
            val state = result["state"]!!.o
            assertEquals(1, SiteCalls.version(state))
            val draft = SiteCalls.draft(state)
            assertEquals(listOf(clinic.service("Consult")), strings(SiteCalls.section(draft, "services")["content"]!!.o, "serviceIds"))
            assertEquals(
                listOf(clinic.resource("Alex")),
                SiteCalls.section(draft, "team")["content"]!!.o["members"]!!.jsonArray.map { it.s("resourceId") },
            )
            val testimonials = SiteCalls.section(draft, "testimonials")
            assertFalse(testimonials.b("enabled"))
            assertEquals(0, testimonials["content"]!!.o["items"]!!.jsonArray.size, "made-up testimonials are dropped")
            assertEquals("Book online.", SiteCalls.section(draft, "hero")["content"]!!.o.s("subheadline"))
            // Metered through the shared seam: 2,000 input + 3,000 output tokens on Claude Opus 5.5 = 6.8 cents.
            assertEquals("true", state["ai"]!!.o["model"]!!.jsonPrimitive.content)
            assertEquals(listOf(shown(6_800_000), shown(freeLimit)), listOf(credits(state).s("used"), credits(state).s("limit")))

            val v = api.get("${clinic.base}/site/versions", clinic.owner.token).obj()["items"]!!.jsonArray.single().o
            assertEquals(
                listOf("ai_generate", "Make it bold", "ai", "Olive Owner"),
                listOf(v.s("source"), v.s("instruction"), v.s("actorType"), v.s("actorName")),
            )
            val audit = Fixtures.sqlOne(
                "SELECT actor_type::text || '|' || (summary->>'instruction') || '|' || (summary->>'source') FROM audit_events WHERE " +
                    "business_id = ? AND action = 'site.generated'",
                clinic.id,
            ) { it.getString(1) }
            assertEquals("ai|Make it bold|ai", audit)
            assertEquals("site_generate|settled", ledger(clinic))
        }
    }

    @Test
    fun `generate never overwrites a draft the owner saved while it ran`() {
        lateinit var clinic: Clinic
        val model = FakeModel {
            // The owner saves in the editor while the model is working.
            Fixtures.sql("UPDATE business_sites SET draft_version = draft_version + 1 WHERE business_id = ?", UUID.fromString(clinic.id))
            reply("end_turn", output(clinic))
        }
        withApp(aiEnv(model)) { api ->
            clinic = Fixtures.clinic(api)
            val draft = SiteCalls.draft(SiteCalls.state(api, clinic))
            SiteCalls.saveOk(api, clinic, draft.with("sections[${SiteCalls.index(draft, "faq")}].enabled", JsonPrimitive(false)), null)
            assertError(HttpStatusCode.Conflict, "CONFLICT", generate(api, clinic))
            assertEquals(2, SiteCalls.version(SiteCalls.state(api, clinic)), "the owner's version stays the draft")
        }
    }

    @Test
    fun `model failures fall back to the template generator`() {
        val model = FakeModel { reply("refusal", "") }
        withApp(aiEnv(model)) { api ->
            val clinic = Fixtures.clinic(api)
            val result = ok(generate(api, clinic))
            assertEquals("template", result.s("source"))
            assertEquals(AiSiteGenerator.GENERATE_FALLBACK, result.s("message"))
            assertEquals("bold", SiteCalls.draft(result["state"]!!.o).s("theme"), "style words still apply")
            assertEquals(
                "template", api.get("${clinic.base}/site/versions", clinic.owner.token).obj()["items"]!!.jsonArray.single().s("source"),
            )
            assertEquals("site_generate|settled", ledger(clinic), "a refused call is still metered")
            assertEquals(1, model.prompts.size)
        }
    }

    @Test
    fun `prompts never contain form questions, answers or customer data`() {
        val model = FakeModel { reply("refusal", "") }
        withApp(aiEnv(model)) { api ->
            val clinic = Fixtures.clinic(api)
            val email = "private.person@example.test"
            book(api, clinic, "Consult", "2026-10-07T10:00:00+01:00", email = email)
            ok(generate(api, clinic, jsonOf("prompt" to "Friendly and calm")))
            ok(edit(api, clinic, "hide the team"))
            assertEquals(2, model.prompts.size)
            for (prompt in model.prompts) {
                listOf("Reason for visit", "Referred by", "Sore shoulder", "Jordan Casey", email, "private.person").forEach {
                    assertFalse(prompt.contains(it), "the prompt must not contain '$it'")
                }
                assertTrue(prompt.contains("name=Consult") && prompt.contains("name=Alex"))
            }
        }
    }

    @Test
    fun `edits save the full revised plan, keep owner testimonials and can be undone`() {
        // The fake model reads the current plan from the prompt and moves testimonials to the top.
        val model = FakeModel { user ->
            val current = ApiJson.decodeFromString(
                serializer<AiSiteOutput>(), user.substringAfter("<current_plan>\n").substringBefore("\n</current_plan>"),
            )
            val list = current.sections.toMutableList()
            val t = list.removeAt(list.indexOfFirst { it.type == "testimonials" })
            list.add(1, t.copy(heading = "Kind words"))
            reply("end_turn", ApiJson.encodeToString(serializer<AiSiteOutput>(), current.copy(sections = list)))
        }
        withApp(aiEnv(model)) { api ->
            val clinic = Fixtures.clinic(api)
            val draft = SiteCalls.draft(SiteCalls.state(api, clinic))
            val t = SiteCalls.index(draft, "testimonials")
            val owner = JsonArray(
                listOf(
                    JsonObject(
                        mapOf(
                            "quote" to JsonPrimitive("Really helpful"), "author" to JsonPrimitive("Pat"),
                            "detail" to JsonNull,
                        ),
                    ),
                ),
            )
            val v1 = SiteCalls.saveOk(
                api, clinic, draft.with("sections[$t].content.items", owner).with("sections[$t].enabled", JsonPrimitive(true)), null,
            )
            val before = SiteCalls.draft(v1)

            val result = ok(edit(api, clinic, "move reviews higher", baseVersion = 1))
            assertEquals("ai", result.s("source"))
            assertEquals(1, result.i("previousVersion"))
            assertEquals(listOf("Moved Testimonials up", "Edited Testimonials"), strings(result, "changes"))
            val after = SiteCalls.draft(result["state"]!!.o)
            assertEquals("testimonials", after["sections"]!!.jsonArray[1].s("type"))
            val testimonials = after["sections"]!!.jsonArray[1].o
            assertTrue(testimonials.b("enabled"))
            assertEquals(owner, testimonials["content"]!!.o["items"], "the owner's testimonials are kept")
            assertFalse(model.prompts.single().contains("Really helpful"), "testimonials are not sent to the model")
            val v2 = api.get("${clinic.base}/site/versions/2", clinic.owner.token).obj()
            assertEquals(listOf("ai_edit", "move reviews higher", "ai"), listOf(v2.s("source"), v2.s("instruction"), v2.s("actorType")))

            // Undo = restore the previous version.
            val undone = ok(api.post("${clinic.base}/site/versions/${result.i("previousVersion")}/restore", null, clinic.owner.token))
            assertEquals(before, SiteCalls.draft(undone))
            // Stale base version: refused before the model is called.
            assertError(HttpStatusCode.Conflict, "CONFLICT", edit(api, clinic, "move reviews lower", baseVersion = 2))
            assertEquals(1, model.prompts.size)
        }
    }

    @Test
    fun `without a model, edits use the rule-based editor`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val moved = ok(edit(api, clinic, "move reviews higher"))
        assertEquals("template", moved.s("source"))
        assertEquals(listOf("Moved Testimonials up"), strings(moved, "changes"))
        assertEquals("Done: moved Testimonials up.", moved.s("message"))
        assertEquals(JsonNull, moved["previousVersion"])
        assertEquals("ai_edit", api.get("${clinic.base}/site/versions/1", clinic.owner.token).obj().s("source"))

        val bold = ok(edit(api, clinic, "use the bold theme", baseVersion = 1))
        assertEquals("bold", SiteCalls.draft(bold["state"]!!.o).s("theme"))
        assertEquals(1, bold.i("previousVersion"))

        val faq = ok(edit(api, clinic, "Add a FAQ about parking"))
        val items = SiteCalls.section(SiteCalls.draft(faq["state"]!!.o), "faq")["content"]!!.o["items"]!!.jsonArray
        assertEquals("Can you tell me about parking?", items.last().s("question"))

        assertEquals("0.0", credits(faq["state"]!!.o).s("used"), "the built-in editor makes no model calls")
        assertNull(ledger(clinic))
        val nothing = ok(edit(api, clinic, "sprinkle some magic on it", baseVersion = 3))
        assertEquals(emptyList(), strings(nothing, "changes"))
        assertEquals(3, nothing.i("previousVersion"))
        assertEquals(3, SiteCalls.version(nothing["state"]!!.o), "no version")
        assertTrue(nothing.s("message").contains(SiteRuleEditor.HELP))

        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.post("${clinic.base}/site/edit", jsonOf("baseVersion" to 3), clinic.owner.token),
        )
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", edit(api, clinic, "   "))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", edit(api, clinic, "x".repeat(501)))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", edit(api, clinic, "hide\u0000 the team"))
    }

    @Test
    fun `generate validates input and unchanged results are free`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val res = generate(api, clinic, jsonOf("prompt" to "x".repeat(2001), "websiteUrl" to "ftp://files.example"))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", res)
        assertEquals(setOf("prompt", "websiteUrl"), parse(res.bodyAsText()).o["error"]!!.o["fields"]!!.o.keys)
        // Without a model the template generator runs (never metered); the same result twice is saved once.
        val same = ok(generate(api, clinic, null))
        assertEquals(emptyList(), strings(same, "changes"), "the default plan is already the draft")
        assertNull(SiteCalls.version(same["state"]!!.o))
        val first = ok(generate(api, clinic, jsonOf("prompt" to "bold")))
        assertEquals(TemplateSiteGenerator.BUILT_FROM_DATA, first.s("message"))
        assertEquals(listOf("Theme: Calm → Bold", "Palette: accent colour changed", "Edited Hero"), strings(first, "changes"))
        val again = ok(generate(api, clinic, jsonOf("prompt" to "bold")))
        assertEquals(emptyList(), strings(again, "changes"))
        assertEquals(1, SiteCalls.version(again["state"]!!.o))
        assertNull(ledger(clinic))
    }

    @Test
    fun `AI credits are enforced before the model is called`() {
        val model = FakeModel { reply("max_tokens", "{") }
        withApp(aiEnv(model)) { api ->
            val clinic = Fixtures.clinic(api)
            // Five cents short of the allowance: a call may still start (less than the allowance is committed) ...
            seedCredits(clinic, freeLimit - 5_000_000)
            ok(generate(api, clinic, jsonOf("prompt" to "bold")))
            assertEquals(shown(freeLimit + 1_800_000), credits(SiteCalls.state(api, clinic)).s("used"), "settled on the actual usage")
            // ... but not once it is used up.
            val over = generate(api, clinic, jsonOf("prompt" to "minimal"))
            assertError(HttpStatusCode.Conflict, "AI_LIMIT_REACHED", over)
            assertEquals(
                "You've used all ${grouped(allowances.free)} AI credits on the Free plan this month. " +
                    "Upgrade to Pro for ${grouped(allowances.pro)} a month. They reset on 1 November.",
                errorMessage(over.bodyAsText()),
            )
            assertError(HttpStatusCode.Conflict, "AI_LIMIT_REACHED", edit(api, clinic, "show the team"))
            assertEquals(1, model.prompts.size, "the model is not called over the limit")
            val state = credits(SiteCalls.state(api, clinic))
            assertEquals(listOf("0.0", "true", "true"), listOf(state.s("remaining"), state.s("limitReached"), state.s("runningLow")))
            // Manual edits are never limited.
            val draft = SiteCalls.draft(SiteCalls.state(api, clinic))
            SiteCalls.saveOk(api, clinic, draft.with("theme", "minimal"), null)
        }
    }

    @Test
    fun `without a model the built-in designer is never limited`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        seedCredits(clinic, freeLimit)
        ok(generate(api, clinic, jsonOf("prompt" to "bold")))
        ok(edit(api, clinic, "hide the team"))
    }

    @Test
    fun `pro and business plans get more credits`() {
        val model = FakeModel { reply("refusal", "") }
        withApp(aiEnv(model)) { api ->
            val clinic = Fixtures.clinic(api)
            seedCredits(clinic, freeLimit)
            assertError(HttpStatusCode.Conflict, "AI_LIMIT_REACHED", generate(api, clinic, jsonOf("prompt" to "minimal")))
            Fixtures.sql("UPDATE businesses SET plan = 'pro' WHERE id = ?", UUID.fromString(clinic.id))
            ok(generate(api, clinic, jsonOf("prompt" to "minimal")))
            assertEquals(shown(proLimit), credits(SiteCalls.state(api, clinic)).s("limit"))
            seedCredits(clinic, proLimit - freeLimit)
            val pro = generate(api, clinic, jsonOf("prompt" to "calm"))
            assertTrue(
                errorMessage(pro.bodyAsText()).startsWith(
                    "You've used all ${grouped(allowances.pro)} AI credits on the Pro plan this month. " +
                        "Upgrade to Business for ${grouped(allowances.business)} a month.",
                ),
            )

            Fixtures.sql("UPDATE businesses SET plan = 'business' WHERE id = ?", UUID.fromString(clinic.id))
            ok(generate(api, clinic, jsonOf("prompt" to "calm")))
            seedCredits(clinic, businessLimit - proLimit)
            val full = generate(api, clinic, jsonOf("prompt" to "bold"))
            assertError(HttpStatusCode.Conflict, "AI_LIMIT_REACHED", full)
            assertEquals(
                "You've used all ${grouped(allowances.business)} AI credits on the Business plan this month. They reset on 1 November.",
                errorMessage(full.bodyAsText()),
            )
            assertEquals(shown(businessLimit), credits(SiteCalls.state(api, clinic)).s("limit"))
        }
    }

    @Test
    fun `credits reset with the calendar month in the business timezone`() {
        val clock = MutableClock(Instant.parse("2026-10-31T23:30:00Z"))
        val model = FakeModel { reply("refusal", "") }
        withApp(aiEnv(model, clock)) { api ->
            val dublin = Fixtures.clinic(api)
            val berlin = Fixtures.clinic(api, timezone = "Europe/Berlin")
            // 22:30 UTC on 31 October: still October in Dublin and in Berlin (23:30).
            val lastOctober = Instant.parse("2026-10-31T22:30:00Z")
            seedCredits(dublin, freeLimit, lastOctober)
            seedCredits(berlin, freeLimit, lastOctober)
            assertError(HttpStatusCode.Conflict, "AI_LIMIT_REACHED", generate(api, dublin, jsonOf("prompt" to "bold")))
            // In Berlin it is already 00:30 on 1 November.
            val berlinResult = ok(generate(api, berlin, jsonOf("prompt" to "bold")))
            assertEquals(
                listOf("2026-12-01", shown(6_800_000)),
                listOf(credits(berlinResult["state"]!!.o).s("resetsOn"), credits(berlinResult["state"]!!.o).s("used")),
            )
            assertEquals("2026-11-01", credits(SiteCalls.state(api, dublin)).s("resetsOn"))

            clock.instant = Instant.parse("2026-11-01T00:30:00Z")
            val dublinResult = ok(generate(api, dublin, jsonOf("prompt" to "bold")))
            assertEquals(
                listOf("2026-12-01", shown(6_800_000)),
                listOf(credits(dublinResult["state"]!!.o).s("resetsOn"), credits(dublinResult["state"]!!.o).s("used")),
            )
        }
    }
}
