package ie.bookanything.ai.usage

import ie.bookanything.ai.AiFeature
import ie.bookanything.ai.AiModel
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.Db
import kotlinx.serialization.Serializable
import java.sql.Connection
import java.time.Clock
import java.time.LocalDate

/** A business's credits this month; embedded in the site and assistant states. Credits have two decimals. */
@Serializable
data class AiCreditsDto(
    val limit: Double,
    val used: Double,
    val remaining: Double,
    val runningLow: Boolean,
    val limitReached: Boolean,
    val resetsOn: String,
    /** Usage past the allowance is billed (metered) instead of refused. */
    val overage: Boolean,
)

@Serializable
data class AiModelStatusDto(val configured: Boolean, val name: String?)

@Serializable
data class FeatureUsageDto(val feature: String, val label: String, val credits: Double, val requests: Int)

@Serializable
data class DailyUsageDto(val date: String, val credits: Double)

/** `GET /v1/businesses/{id}/ai/usage`. */
@Serializable
data class AiUsageDto(
    val plan: String,
    val timezone: String,
    val periodStart: String,
    /** Last day of the period (inclusive). */
    val periodEnd: String,
    val credits: AiCreditsDto,
    val model: AiModelStatusDto,
    val byFeature: List<FeatureUsageDto>,
    /** Every day from the start of the period to today. */
    val daily: List<DailyUsageDto>,
)

/** Read models over the ledger for the API and the other AI surfaces. */
class AiUsageService(private val db: Db, private val clock: Clock, private val meter: AiMeter, private val model: AiModel?) {
    fun credits(conn: Connection, business: BusinessRow): AiCreditsDto = toDto(meter.status(conn, business), meter.overageFor(business))

    suspend fun usage(access: BusinessAccess): AiUsageDto = db.read(access.businessId) { conn ->
        val b = access.business
        val status = meter.status(conn, b)
        val period = status.period
        val totals = AiUsageRepository.byFeature(conn, b.id, period.startInstant, period.endInstant).associateBy { it.feature }
        val daily = AiUsageRepository.daily(conn, b.id, b.timezone, period.startInstant, period.endInstant)
        val today = LocalDate.ofInstant(clock.instant(), b.zone)
        AiUsageDto(
            plan = b.plan.wire,
            timezone = b.timezone,
            periodStart = period.start.toString(),
            periodEnd = period.end.minusDays(1).toString(),
            credits = toDto(status, meter.overageFor(b)),
            model = AiModelStatusDto(model != null, model?.modelId),
            byFeature = AiFeature.entries.map { f ->
                val t = totals[f.key]
                FeatureUsageDto(f.key, f.label, meter.credit.of(t?.microCents ?: 0), t?.requests ?: 0)
            },
            daily = generateSequence(period.start) { it.plusDays(1) }
                .takeWhile { it.isBefore(period.end) && !it.isAfter(today) }
                .map { DailyUsageDto(it.toString(), meter.credit.of(daily[it] ?: 0)) }
                .toList(),
        )
    }

    private fun toDto(s: CreditStatus, overage: Boolean) = AiCreditsDto(
        limit = s.credit.of(s.limit), used = s.credit.of(s.used), remaining = s.credit.of(s.remaining),
        runningLow = s.runningLow, limitReached = s.limitReached && !overage, resetsOn = s.period.resetsOn.toString(), overage = overage,
    )
}
