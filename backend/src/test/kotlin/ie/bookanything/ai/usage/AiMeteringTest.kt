package ie.bookanything.ai.usage

import ie.bookanything.ai.AiCaller
import ie.bookanything.ai.AiFeature
import ie.bookanything.ai.AiModelException
import ie.bookanything.ai.ChatBlock
import ie.bookanything.ai.ChatMessage
import ie.bookanything.ai.ChatRole
import ie.bookanything.ai.ConverseReply
import ie.bookanything.ai.ConverseRequest
import ie.bookanything.ai.Effort
import ie.bookanything.ai.ModelClient
import ie.bookanything.ai.ModelReply
import ie.bookanything.ai.StopReason
import ie.bookanything.ai.StreamSink
import ie.bookanything.ai.StructuredRequest
import ie.bookanything.ai.TokenUsage
import ie.bookanything.config.AiConfig
import ie.bookanything.http.ApiException
import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Clinic
import ie.bookanything.support.FakeStripeGateway
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.Roles
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestCredits
import ie.bookanything.support.TestCredits.estimate
import ie.bookanything.support.TestCredits.shown
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** The metering decorator, reservations, settlement, overage and the usage API against Postgres. */
class AiMeteringTest {
    /** A provider whose next behaviour each test sets. */
    private class Provider : ModelClient {
        override val modelId = "claude-opus-5-5"
        val next = AtomicReference<() -> TokenUsage> { TokenUsage(input = 1_000, output = 500) }
        override fun structured(request: StructuredRequest) = ModelReply(
            StopReason.END_TURN, "{}", usage = next.get()(), messageId = "msg_1",
        )
        override fun converse(request: ConverseRequest, sink: StreamSink) =
            ConverseReply(StopReason.END_TURN, listOf(ChatBlock.Text("hi")), next.get()(), "msg_2")
    }

    private val provider = Provider()
    private fun env(
        clock: MutableClock = MutableClock(ie.bookanything.support.DEFAULT_NOW), config: AiConfig = AiConfig(),
        gateway: FakeStripeGateway? = null,
    ) =
        TestEnv(
            clock = clock, config = TestConfig.config().copy(ai = config), modelClient = provider,
            overageReporter = gateway?.let { StripeAiOverageReporter(it, "ai_credits") },
        )

    private fun caller(
        clinic: Clinic, feature: AiFeature = AiFeature.ASSISTANT,
    ) = AiCaller(feature, UUID.fromString(clinic.id), null, "req-test")
    private val chat = ConverseRequest(
        "system", emptyList(), listOf(ChatMessage(ChatRole.USER, listOf(ChatBlock.Text("hello")))), 1_000, Effort.LOW,
    )

    private fun rows(clinic: Clinic) = Fixtures.sqlOne(
        """
        SELECT string_agg(feature || '|' || status || '|' || input_tokens || '|' || output_tokens || '|' || cost_micro_cents || '|' ||
               price_version || '|' || coalesce(provider_message_id, '-') || '|' || coalesce(request_id, '-'), ',' ORDER BY created_at, id)
        FROM ai_usage WHERE business_id = ?
        """.trimIndent(),
        clinic.id,
    ) { it.getString(1) }?.split(",")?.sorted()?.joinToString(",") // rows share the test clock's timestamp

    private val freeLimit = TestCredits.micro(TestCredits.allowances.free)
    private val proLimit = TestCredits.micro(TestCredits.allowances.pro)

    private fun seed(
        clinic: Clinic, microCents: Long, status: String = "settled", at: Instant = ie.bookanything.support.DEFAULT_NOW,
    ) = Fixtures.sql(
        "INSERT INTO ai_usage (business_id, feature, model, status, cost_micro_cents, reserved_micro_cents, price_version, created_at) " +
            "VALUES (?, 'assistant', 'claude-opus-5-5', ?, ?, ?, 'v', ?)",
        UUID.fromString(clinic.id), status, if (status == "settled") microCents else 0,
        if (status == "reserved") microCents else 0,
        java.time.OffsetDateTime.ofInstant(at, java.time.ZoneOffset.UTC),
    )

    @Test
    fun `every call through the seam is reserved and settled with the actual usage`() = env().let { e ->
        withApp(e) { api ->
            val clinic = Fixtures.clinic(api)
            val ai = e.ctx.ai.model!!
            ai.complete(caller(clinic, AiFeature.SITE_GENERATE), StructuredRequest("s", "u", JsonObject(emptyMap())))
            provider.next.set { TokenUsage(input = 500, cacheRead = 3_000, output = 150) }
            ai.converse(caller(clinic), chat)
            // 1,000 × 400 + 500 × 2,000 = 1.4 cents; 500 × 400 + 3,000 × 20 + 150 × 2,000 = 0.56 cents.
            assertEquals(
                "assistant|settled|500|150|560000|2026-09-01|msg_2|req-test,site_generate|settled|1000|500|1400000|2026-09-01|msg_1|req-test",
                rows(clinic),
            )
        }
    }

    @Test
    fun `failed calls release the reservation, or settle what the provider already counted`() = env().let { e ->
        withApp(e) { api ->
            val clinic = Fixtures.clinic(api)
            val ai = e.ctx.ai.model!!
            provider.next.set { throw AiModelException("could not reach the Anthropic API") }
            assertFailsWith<AiModelException> { ai.converse(caller(clinic), chat) }
            provider.next.set { throw AiModelException("stream broke", usage = TokenUsage(input = 2_000, output = 10)) }
            assertFailsWith<AiModelException> { ai.converse(caller(clinic), chat) }
            provider.next.set { throw IllegalStateException("bug") }
            assertFailsWith<IllegalStateException> { ai.converse(caller(clinic), chat) }
            assertEquals(
                "assistant|released|0|0|0|2026-09-01|-|req-test,assistant|released|0|0|0|2026-09-01|-|req-test,assistant|settled|2000|10|820000|2026-09-01|-|req-test",
                rows(clinic),
            )
        }
    }

    @Test
    fun `calls are refused with AI_LIMIT_REACHED once the allowance is committed`() = env().let { e ->
        withApp(e) { api ->
            val clinic = Fixtures.clinic(api)
            val ai = e.ctx.ai.model!!
            seed(clinic, freeLimit - 3 * estimate() / 2)
            seed(clinic, estimate(), status = "reserved") // a call in flight
            ai.converse(caller(clinic), chat) // less than the allowance committed: allowed
            seed(clinic, estimate(), status = "reserved")
            val refused = assertFailsWith<ApiException> { ai.converse(caller(clinic), chat) }
            assertEquals("AI_LIMIT_REACHED", refused.code)
            // Reservations of crashed requests stop counting after 15 minutes.
            Fixtures.sql(
                "UPDATE ai_usage SET created_at = created_at - interval '20 minutes' WHERE business_id = ? AND status = 'reserved'",
                UUID.fromString(clinic.id),
            )
            ai.converse(caller(clinic), chat)
            // The onboarding draft has no business, so it is recorded but never limited.
            val draft = AiCaller(AiFeature.BUSINESS_DRAFT, null, null)
            ai.complete(draft, StructuredRequest("s", "u", JsonObject(emptyMap())))
        }
    }

    @Test
    fun `overage past the allowance is billed through a Stripe meter when enabled`() {
        val gateway = FakeStripeGateway()
        val testEnv = env(config = AiConfig(overageMeterEvent = "ai_credits", overageMaxCredits = 100), gateway = gateway)
        withApp(testEnv) { api ->
            val clinic = Fixtures.clinic(api)
            val ai = testEnv.ctx.ai.model!!
            seed(clinic, freeLimit)
            // Free plan: no overage, the limit is hard.
            assertEquals("AI_LIMIT_REACHED", assertFailsWith<ApiException> { ai.converse(caller(clinic), chat) }.code)
            Fixtures.sql("UPDATE businesses SET plan = 'pro', stripe_customer_id = 'cus_ai' WHERE id = ?", UUID.fromString(clinic.id))
            seed(clinic, proLimit - freeLimit - 1_000_000) // a cent short of Pro's allowance
            provider.next.set { TokenUsage(input = 10_000, output = 1_000) } // 6 cents, 5 of them past the allowance
            ai.converse(caller(clinic), chat)
            val usage = api.get("${clinic.base}/ai/usage", clinic.owner.token).obj()
            assertEquals(
                listOf("true", "false", shown(proLimit + 5_000_000)),
                listOf("overage", "limitReached", "used").map { usage["credits"]!!.o.s(it) },
            )
            JobWorker(testEnv.ctx).drain()
            val event = gateway.meterEvents.single()
            assertEquals("ai_credits", event.eventName)
            // The meter counts hundredths of a credit.
            val units = TestCredits.value.hundredthsUp(5_000_000).toString()
            assertEquals(mapOf("stripe_customer_id" to "cus_ai", "value" to units), event.payload)
            assertTrue(event.identifier.startsWith("ai-usage-"))
            // The cap: 100 credits of overage at most.
            seed(clinic, TestCredits.micro(100))
            assertEquals("AI_LIMIT_REACHED", assertFailsWith<ApiException> { ai.converse(caller(clinic), chat) }.code)
        }
    }

    @Test
    fun `usage API reports the period, credits, features and a daily series`() {
        val clock = MutableClock(Instant.parse("2026-10-05T08:00:00Z"))
        val e = env(clock)
        withApp(e) { api ->
            val clinic = Fixtures.clinic(api)
            val ai = e.ctx.ai.model!!
            seed(clinic, 40_000_000, at = Instant.parse("2026-10-02T09:00:00Z"))
            seed(clinic, 99_000_000, at = Instant.parse("2026-09-30T22:59:00Z")) // 23:59 on 30 September in Dublin: last month
            ai.complete(caller(clinic, AiFeature.SITE_EDIT), StructuredRequest("s", "u", JsonObject(emptyMap())))
            val usage = api.get("${clinic.base}/ai/usage", clinic.owner.token).obj()
            assertEquals(
                listOf("free", "Europe/Dublin", "2026-10-01", "2026-10-31"),
                listOf("plan", "timezone", "periodStart", "periodEnd").map(usage::s),
            )
            val credits = usage["credits"]!!.o
            assertEquals(
                listOf(shown(freeLimit), shown(41_400_000), shown(freeLimit - 41_400_000), "false", "2026-11-01"),
                listOf("limit", "used", "remaining", "runningLow", "resetsOn").map(credits::s),
            )
            assertEquals(listOf("true", "claude-opus-5-5"), listOf(usage["model"]!!.o.s("configured"), usage["model"]!!.o.s("name")))
            assertEquals(
                listOf(
                    "business_draft|0.0|0", "site_generate|0.0|0", "site_edit|${shown(1_400_000)}|1", "assistant|${shown(40_000_000)}|1",
                ),
                usage["byFeature"]!!.a.map { "${it.s("feature")}|${it.s("credits")}|${it.s("requests")}" },
            )
            assertEquals(
                listOf(
                    "2026-10-01|0.0", "2026-10-02|${shown(40_000_000)}", "2026-10-03|0.0", "2026-10-04|0.0",
                    "2026-10-05|${shown(1_400_000)}",
                ),
                usage["daily"]!!.a.map { "${it.s("date")}|${it.s("credits")}" },
            )
        }
    }

    @Test
    fun `usage API is for owners and admins of the business`() = withApp(env()) { api ->
        val clinic = Fixtures.clinic(api)
        val roles = Roles.of(api, clinic)
        Roles.check(roles, "GET /ai/usage", "admin", HttpStatusCode.OK) { t -> api.get("${clinic.base}/ai/usage", t) }
    }
}
