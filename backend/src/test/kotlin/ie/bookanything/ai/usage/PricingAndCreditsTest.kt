package ie.bookanything.ai.usage

import ie.bookanything.ai.AiFeature
import ie.bookanything.ai.TokenUsage
import ie.bookanything.business.Plan
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PricingAndCreditsTest {
    private val table = PriceTable(
        listOf(
            PriceVersion(
                "2026-01-01", "2026-01-01T00:00:00Z", "big",
                mapOf(
                    "big" to ModelPrice("5.00", "6.25", "0.50", "25.00"),
                    "small" to ModelPrice("1.00", "1.25", "0.10", "5.00"),
                ),
            ),
            PriceVersion(
                "2026-09-01", "2026-09-01T00:00:00Z", "big",
                mapOf(
                    "big" to ModelPrice("4.00", "5.00", "0.20", "20.00"),
                    "small" to ModelPrice("0.80", "1.00", "0.08", "4.00"),
                ),
            ),
        ),
    )
    private val march = Instant.parse("2026-03-15T12:00:00Z")
    private val october = Instant.parse("2026-10-05T08:00:00Z")

    @Test
    fun `the bundled table prices Claude Opus 5_5 at list price`() {
        val bundled = PriceTable.load()
        val usage = TokenUsage(input = 1_000_000, cacheWrite = 1_000_000, cacheRead = 1_000_000, output = 1_000_000)
        // $4 + $5 + $0.20 + $20 = $29.20 = 2,920 cents = 2,920,000,000 micro-cents.
        assertEquals(Costed("2026-09-01", 2_920_000_000), bundled.cost("claude-opus-5-5", usage, october))
    }

    @Test
    fun `each token type has its own rate`() {
        val price = table.versionAt(october).priceOf("big")
        assertEquals(400, Cost.microCents(TokenUsage(input = 1), price))
        assertEquals(500, Cost.microCents(TokenUsage(cacheWrite = 1), price))
        assertEquals(20, Cost.microCents(TokenUsage(cacheRead = 1), price))
        assertEquals(2_000, Cost.microCents(TokenUsage(output = 1), price))
        // A typical assistant call: 500 fresh input, 3,000 cached, 150 output = 0.56 cents.
        assertEquals(560_000, Cost.microCents(TokenUsage(input = 500, cacheRead = 3_000, output = 150), price))
    }

    @Test
    fun `the version in force at the time of the call is used`() {
        val usage = TokenUsage(input = 10_000, output = 1_000)
        assertEquals(Costed("2026-01-01", 10_000 * 500L + 1_000 * 2_500L), table.cost("big", usage, march))
        assertEquals(Costed("2026-09-01", 10_000 * 400L + 1_000 * 2_000L), table.cost("big", usage, october))
        assertEquals(Costed("2026-09-01", 10_000 * 80L + 1_000 * 400L), table.cost("small", usage, october))
        // Before the first version: the earliest one applies; exactly at a boundary: the new one.
        assertEquals("2026-01-01", table.versionAt(Instant.parse("2025-06-01T00:00:00Z")).version)
        assertEquals("2026-09-01", table.versionAt(Instant.parse("2026-09-01T00:00:00Z")).version)
    }

    @Test
    fun `unknown models are costed at the fallback (never undercharged) and fractions round half up`() {
        assertEquals(
            table.cost("big", TokenUsage(input = 7), october).microCents, table.cost("mystery", TokenUsage(input = 7), october).microCents,
        )
        val fractional = PriceTable(
            listOf(PriceVersion("v", "2026-01-01T00:00:00Z", "m", mapOf("m" to ModelPrice("0.075", "0", "0", "0.005")))),
        )
        assertEquals(8, fractional.cost("m", TokenUsage(input = 1), october).microCents, "7.5 rounds up")
        assertEquals(1, fractional.cost("m", TokenUsage(output = 1), october).microCents, "0.5 rounds up")
        assertEquals(0, fractional.cost("m", TokenUsage.NONE, october).microCents)
    }

    @Test
    fun `a table must price its fallback model`() {
        assertFailsWith<IllegalArgumentException> { PriceTable(listOf(PriceVersion("v", "2026-01-01T00:00:00Z", "gone", emptyMap()))) }
        assertFailsWith<IllegalArgumentException> { PriceTable(emptyList()) }
    }

    @Test
    fun `credits convert micro-cents at the configured value`() {
        val credit = CreditValue(250_000) // any value: the code only converts
        assertEquals(750_000, credit.toMicroCents(3))
        assertEquals(2.24, credit.of(560_000))
        assertEquals(0.01, credit.of(1_250), "half a hundredth rounds up")
        assertEquals(0.0, credit.of(1_249))
        assertEquals(listOf(1L, 1L, 2L, 0L), listOf(1L, 2_500L, 2_501L, 0L).map(credit::hundredthsUp), "hundredths of a credit, rounded up")
        assertFailsWith<IllegalArgumentException> { CreditValue(0) }
        // Reservations are model cost, whatever a credit is worth.
        assertEquals(10_000_000, ReservationEstimates.of(AiFeature.ASSISTANT))
        assertEquals(30_000_000, ReservationEstimates.of(AiFeature.SITE_GENERATE))
        val allowances = AiAllowances(free = 3, pro = 30, business = 300)
        assertEquals(listOf(3L, 30L, 300L), Plan.entries.map(allowances::creditsFor))
    }

    @Test
    fun `a call may start while less than the allowance is committed`() {
        val limit = 100L
        fun decide(settled: Long, reserved: Long = 0, overage: OverageTerms? = null) =
            AllowancePolicy.decide(limit, Committed(settled, reserved), overage)
        assertEquals(AllowanceDecision.Allowed, decide(0))
        assertEquals(AllowanceDecision.Allowed, decide(99))
        assertEquals(AllowanceDecision.Denied, decide(100))
        assertEquals(AllowanceDecision.Denied, decide(95, reserved = 5), "in-flight reservations count")
        assertEquals(AllowanceDecision.Allowed, decide(90, reserved = 5))
        val terms = OverageTerms(50)
        assertEquals(AllowanceDecision.Overage, decide(125, overage = terms))
        assertEquals(AllowanceDecision.Denied, decide(150, overage = terms), "overage has a monthly cap")
    }

    @Test
    fun `only the part of a call past the allowance is overage`() {
        assertEquals(0, AllowancePolicy.overagePortion(limit = 100, settledBefore = 50, cost = 40))
        assertEquals(10, AllowancePolicy.overagePortion(limit = 100, settledBefore = 70, cost = 40))
        assertEquals(40, AllowancePolicy.overagePortion(limit = 100, settledBefore = 120, cost = 40))
        assertEquals(0, AllowancePolicy.overagePortion(limit = 100, settledBefore = 100, cost = 0))
    }

    @Test
    fun `running low below a fifth of the allowance`() {
        assertFalse(AllowancePolicy.runningLow(limit = 100, used = 79))
        assertTrue(AllowancePolicy.runningLow(limit = 100, used = 80))
        assertTrue(AllowancePolicy.limitReached(limit = 100, used = 100))
        assertEquals(0, AllowancePolicy.remaining(limit = 100, used = 130))
    }

    @Test
    fun `periods are calendar months in the business timezone`() {
        val dublin = ZoneId.of("Europe/Dublin")
        // 23:30 UTC on 31 October is still October in Dublin (GMT) but November in Berlin (CET).
        val lateOctober = Instant.parse("2026-10-31T23:30:00Z")
        assertEquals(LocalDate.parse("2026-10-01"), AiPeriod.of(lateOctober, dublin).start)
        assertEquals(LocalDate.parse("2026-11-01"), AiPeriod.of(lateOctober, dublin).resetsOn)
        assertEquals(LocalDate.parse("2026-11-01"), AiPeriod.of(lateOctober, ZoneId.of("Europe/Berlin")).start)
        // Summer time: the period starts at local midnight (23:00 UTC the day before).
        val august = AiPeriod.of(Instant.parse("2026-08-10T10:00:00Z"), dublin)
        assertEquals(Instant.parse("2026-07-31T23:00:00Z"), august.startInstant)
        assertEquals(Instant.parse("2026-08-31T23:00:00Z"), august.endInstant)
        // Year boundary and the far side of the date line.
        val newYear = AiPeriod.of(Instant.parse("2026-12-31T12:00:00Z"), ZoneId.of("Pacific/Auckland"))
        assertEquals(LocalDate.parse("2027-01-01"), newYear.start)
        assertEquals(LocalDate.parse("2027-02-01"), newYear.resetsOn)
        assertEquals(LocalDate.parse("2027-03-01"), AiPeriod.of(Instant.parse("2027-02-28T12:00:00Z"), dublin).resetsOn)
    }

    @Test
    fun `limit messages name the plan, the allowance, the upgrade and the reset date`() {
        val allowances = AiAllowances(free = 3, pro = 30, business = 3_000)
        val period = AiPeriod.of(october, ZoneId.of("Europe/Dublin"))
        assertEquals(
            "You've used all 3 AI credits on the Free plan this month. Upgrade to Pro for 30 a month. They reset on 1 November.",
            AiLimitMessages.limitReached(Plan.FREE, allowances, period),
        )
        assertEquals(
            "You've used all 3,000 AI credits on the Business plan this month. They reset on 1 November.",
            AiLimitMessages.limitReached(Plan.BUSINESS, allowances, period),
        )
    }
}
