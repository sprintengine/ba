package ie.bookanything.ai.usage

import ie.bookanything.ai.AiFeature
import ie.bookanything.business.Plan
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * What one AI credit is worth: [microCents] of model list-price cost (micro-cents are 10⁻⁶ of the price table's cent).
 * Set by `AI_CREDIT_MICRO_CENTS`; the code only converts. Costs are stored in micro-cents and credits are derived.
 */
data class CreditValue(val microCents: Long) {
    init {
        require(microCents > 0) { "A credit must be worth at least one micro-cent." }
    }

    fun toMicroCents(credits: Long): Long = Math.multiplyExact(credits, microCents)

    /** Credits with two decimals, for display and the API. */
    fun of(microCents: Long): Double =
        BigDecimal(microCents).divide(BigDecimal(this.microCents), 2, RoundingMode.HALF_UP).toDouble()

    /** Hundredths of a credit in [microCents], rounded up (the overage meter's unit). */
    fun hundredthsUp(microCents: Long): Long = Math.ceilDiv(Math.multiplyExact(microCents, HUNDREDTHS), this.microCents)

    private companion object {
        const val HUNDREDTHS = 100L
    }
}

/** The reservation taken before a model call (micro-cents of model cost), settled with the actual cost afterwards. */
object ReservationEstimates {
    /** Typical model cost of a Bo turn and of a site/draft generation, in micro-cents. */
    private const val ESTIMATE_ASSISTANT_TURN = 10_000_000L
    private const val ESTIMATE_GENERATION = 30_000_000L

    /** What a call is expected to cost (micro-cents), reserved before it starts; settlement replaces it with the actual cost. */
    fun of(feature: AiFeature): Long = when (feature) {
        AiFeature.ASSISTANT -> ESTIMATE_ASSISTANT_TURN
        AiFeature.SITE_GENERATE, AiFeature.SITE_EDIT, AiFeature.BUSINESS_DRAFT -> ESTIMATE_GENERATION
    }
}

/**
 * Monthly credits per plan (`AI_CREDITS_FREE`, `AI_CREDITS_PRO`, `AI_CREDITS_BUSINESS`). Deployment configuration;
 * the defaults are placeholders for development and tests, and production refuses to start without the real values.
 */
data class AiAllowances(val free: Long = 1_000, val pro: Long = 10_000, val business: Long = 100_000) {
    fun creditsFor(plan: Plan): Long = when (plan) {
        Plan.BUSINESS -> business
        Plan.PRO -> pro
        Plan.FREE -> free
    }
}

/** A calendar month in the business timezone: allowances reset at local midnight on the 1st. */
data class AiPeriod(val start: LocalDate, val end: LocalDate, val zone: ZoneId) {
    val startInstant: Instant get() = start.atStartOfDay(zone).toInstant()
    val endInstant: Instant get() = end.atStartOfDay(zone).toInstant()

    /** The first day of the next period. */
    val resetsOn: LocalDate get() = end

    companion object {
        fun of(now: Instant, zone: ZoneId): AiPeriod {
            val start = LocalDate.ofInstant(now, zone).withDayOfMonth(1)
            return AiPeriod(start, start.plusMonths(1), zone)
        }
    }
}

/** This period's settled cost plus the reservations of calls still in flight (micro-cents). */
data class Committed(val settled: Long, val reserved: Long) {
    val total: Long get() = settled + reserved
}

/** Overage terms for a business whose plan allows paying for usage past the allowance. */
data class OverageTerms(val capMicroCents: Long)

sealed interface AllowanceDecision {
    /** Within the allowance. */
    data object Allowed : AllowanceDecision

    /** Past the allowance, billed as metered overage. */
    data object Overage : AllowanceDecision

    /** Refused: 409 AI_LIMIT_REACHED. */
    data object Denied : AllowanceDecision
}

/**
 * The allowance rules, pure. A call may start while less than the allowance is committed (settled cost plus
 * in-flight reservations), so concurrent calls cannot all slip through and a month overshoots by at most one call.
 */
object AllowancePolicy {
    /** Remaining below this share of the allowance counts as "running low". */
    const val LOW_SHARE = 0.2

    fun decide(limit: Long, committed: Committed, overage: OverageTerms?): AllowanceDecision = when {
        committed.total < limit -> AllowanceDecision.Allowed
        overage != null && committed.total < limit + overage.capMicroCents -> AllowanceDecision.Overage
        else -> AllowanceDecision.Denied
    }

    /** The part of a call's [cost] that falls past the allowance, given what was settled before it. */
    fun overagePortion(limit: Long, settledBefore: Long, cost: Long): Long =
        maxOf(0, settledBefore + cost - limit) - maxOf(0, settledBefore - limit)

    fun remaining(limit: Long, used: Long): Long = maxOf(0, limit - used)

    fun runningLow(limit: Long, used: Long): Boolean = remaining(limit, used) <= limit * LOW_SHARE

    fun limitReached(limit: Long, used: Long): Boolean = used >= limit
}
