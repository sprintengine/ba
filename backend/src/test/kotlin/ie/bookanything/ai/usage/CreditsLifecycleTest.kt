package ie.bookanything.ai.usage

import ie.bookanything.ai.AiCaller
import ie.bookanything.ai.AiFeature
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
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.FakeStripeGateway
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestCredits
import ie.bookanything.support.TestCredits.estimate
import ie.bookanything.support.TestCredits.shown
import ie.bookanything.support.TestEnv
import ie.bookanything.support.inParallel
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * AI credits over a call's and a month's life (docs/architecture.md section 16): reserved before the provider is
 * called, settled with the real cost after, refused at the limit, never overspent by concurrent calls, extended by
 * overage only up to its cap, and reset at the start of the business's month.
 */
class CreditsLifecycleTest {
    /** A provider that records, while it runs, what the ledger holds for the call, then reports [usage]. */
    private class Provider : ModelClient {
        override val modelId = "claude-opus-5-5"
        @Volatile var usage = TokenUsage(input = 1_000, output = 500)
        @Volatile var businessId: String? = null
        val seenDuringCall = CopyOnWriteArrayList<String>()

        override fun structured(request: StructuredRequest): ModelReply {
            businessId?.let { id ->
                seenDuringCall += Fixtures.sqlAll(
                    "SELECT status || ' ' || reserved_micro_cents FROM ai_usage WHERE business_id = ? AND status = 'reserved'", id,
                )
            }
            return ModelReply(StopReason.END_TURN, "{}", usage = usage, messageId = "msg_credits")
        }

        override fun converse(request: ConverseRequest, sink: StreamSink) =
            ConverseReply(StopReason.END_TURN, listOf(ChatBlock.Text("hi")), usage, "msg_chat")
    }

    private val provider = Provider()
    private val chat =
        ConverseRequest("system", emptyList(), listOf(ChatMessage(ChatRole.USER, listOf(ChatBlock.Text("hi")))), 100, Effort.LOW)

    private fun env(clock: MutableClock = MutableClock(DEFAULT_NOW), config: AiConfig = AiConfig(), gateway: FakeStripeGateway? = null) =
        TestEnv(
            clock = clock, config = TestConfig.config().copy(ai = config), modelClient = provider,
            overageReporter = gateway?.let { StripeAiOverageReporter(it, "ai_credits") },
        )

    private fun caller(clinic: Clinic, feature: AiFeature = AiFeature.ASSISTANT) =
        AiCaller(feature, UUID.fromString(clinic.id), null, "req-credits")

    /** The Free plan's allowance in micro-cents. */
    private val freeLimit = TestCredits.micro(TestCredits.allowances.free)

    private fun seedSettled(clinic: Clinic, microCents: Long, at: Instant = DEFAULT_NOW) = Fixtures.sql(
        "INSERT INTO ai_usage (business_id, feature, model, status, cost_micro_cents, reserved_micro_cents, price_version, created_at) " +
            "VALUES (?, 'assistant', 'claude-opus-5-5', 'settled', ?, 0, 'v', ?)",
        UUID.fromString(clinic.id), microCents, OffsetDateTime.ofInstant(at, ZoneOffset.UTC),
    )

    private fun ledger(clinic: Clinic): List<String> = Fixtures.sqlAll(
        "SELECT status || ' ' || reserved_micro_cents || ' ' || cost_micro_cents FROM ai_usage " +
            "WHERE business_id = ? AND request_id = 'req-credits' ORDER BY created_at, cost_micro_cents",
        clinic.id,
    )

    private suspend fun credits(api: Api, clinic: Clinic) = api.get("${clinic.base}/ai/usage", clinic.owner.token).obj()["credits"]!!.o

    @Test
    fun `a call is reserved before the provider runs and settled at its real cost, below or above the reservation`() = env().let { e ->
        withApp(e) { api ->
            val clinic = Fixtures.clinic(api)
            provider.businessId = clinic.id
            val ai = e.ctx.ai.model!!
            val request = StructuredRequest("s", "u", kotlinx.serialization.json.JsonObject(emptyMap()))
            // A site generation reserves 30 cents of model cost; this one costs 1.4.
            ai.complete(caller(clinic, AiFeature.SITE_GENERATE), request)
            assertEquals(listOf("reserved ${estimate(AiFeature.SITE_GENERATE)}"), provider.seenDuringCall)
            // 100,000 input and 5,000 output tokens: 40 + 10 = 50 cents, more than the 30 reserved.
            provider.usage = TokenUsage(input = 100_000, output = 5_000)
            ai.complete(caller(clinic, AiFeature.SITE_GENERATE), request)
            assertEquals(listOf("settled 30000000 1400000", "settled 30000000 50000000"), ledger(clinic))
            assertEquals(shown(51_400_000), credits(api, clinic).s("used"))
        }
    }

    @Test
    fun `the call that crosses the allowance may finish, the next one is refused until the month resets`() {
        // New York: the month turns at 04:00 UTC on 1 November, not at midnight UTC.
        val clock = MutableClock(Instant.parse("2026-10-20T15:00:00Z"))
        val e = env(clock)
        withApp(e) { api ->
            val clinic = Fixtures.clinic(api, timezone = "America/New_York")
            val ai = e.ctx.ai.model!!
            seedSettled(clinic, freeLimit - 5_000_000)
            provider.usage = TokenUsage(input = 100_000, output = 5_000) // 50 cents
            ai.converse(caller(clinic), chat) // less than the allowance committed: allowed, overshoots by 45 cents
            val status = credits(api, clinic)
            assertEquals(listOf(shown(freeLimit + 45_000_000), "0.0", "true"), listOf("used", "remaining", "limitReached").map(status::s))
            val refused = assertFailsWith<ApiException> { ai.converse(caller(clinic), chat) }
            assertEquals("AI_LIMIT_REACHED", refused.code)
            assertTrue(refused.message.contains("1 November"), refused.message)

            clock.instant = Instant.parse("2026-11-01T03:59:00Z") // 23:59 on 31 October in New York
            assertEquals("AI_LIMIT_REACHED", assertFailsWith<ApiException> { ai.converse(caller(clinic), chat) }.code)
            clock.instant = Instant.parse("2026-11-01T04:00:00Z")
            provider.usage = TokenUsage(input = 1_000, output = 500)
            ai.converse(caller(clinic), chat)
            val november = credits(api, clinic)
            assertEquals(
                listOf(shown(1_400_000), shown(freeLimit - 1_400_000), "false", "2026-12-01"),
                listOf("used", "remaining", "limitReached", "resetsOn").map(november::s),
            )
        }
    }

    @Test
    fun `concurrent calls cannot reserve past the allowance`() = env().let { e ->
        withApp(e) { api ->
            val clinic = Fixtures.clinic(api)
            // Room for five Bo turns' reservations: a call may start while less than the allowance is committed.
            seedSettled(clinic, freeLimit - 5 * estimate())
            val outcomes = inParallel(12) {
                try {
                    e.ctx.ai.meter.reserve(caller(clinic), "claude-opus-5-5"); "reserved"
                } catch (refused: ApiException) {
                    refused.code
                }
            }
            assertEquals(mapOf("reserved" to 5, "AI_LIMIT_REACHED" to 7), outcomes.groupingBy { it }.eachCount())
            assertEquals(5, ledger(clinic).count { it.startsWith("reserved") })
            // Reservations hold credits back but are not usage.
            assertEquals(shown(freeLimit - 5 * estimate()), credits(api, clinic).s("used"))
        }
    }

    @Test
    fun `with overage a paid plan keeps going past its credits, but concurrent calls stop at the cap`() {
        val gateway = FakeStripeGateway()
        // Overage capped at two Bo turns' reservations.
        val cap = TestCredits.value.of(2 * estimate()).toLong()
        val e = env(config = AiConfig(overageMeterEvent = "ai_credits", overageMaxCredits = cap), gateway = gateway)
        withApp(e) { api ->
            val clinic = Fixtures.clinic(api)
            Fixtures.sql("UPDATE businesses SET plan = 'pro', stripe_customer_id = 'cus_overage' WHERE id = ?", UUID.fromString(clinic.id))
            seedSettled(clinic, TestCredits.micro(TestCredits.allowances.pro)) // Pro's credits are used up; the cap may be billed.
            val outcomes = inParallel(8) {
                try {
                    e.ctx.ai.meter.reserve(caller(clinic), "claude-opus-5-5"); "reserved"
                } catch (refused: ApiException) {
                    refused.code
                }
            }
            assertEquals(mapOf("reserved" to 2, "AI_LIMIT_REACHED" to 6), outcomes.groupingBy { it }.eachCount())
            assertEquals("true", credits(api, clinic).s("overage"))
        }
    }
}
