package ie.bookanything.ai.usage

import ie.bookanything.ai.AiCaller
import ie.bookanything.ai.StopReason
import ie.bookanything.ai.TokenUsage
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.business.Plan
import ie.bookanything.db.Db
import ie.bookanything.http.Errors
import ie.bookanything.jobs.JobQueue
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.sql.Connection
import java.time.Clock
import java.time.Duration
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

/** A reservation for one model call, settled with the actual usage when the call returns. */
data class Reservation(val id: UUID, val caller: AiCaller, val model: String)

/** A business's credits this period (micro-cents, converted with [credit]), for the API and prompts. */
data class CreditStatus(
    val plan: String,
    val period: AiPeriod,
    val limit: Long,
    val used: Long,
    val reserved: Long,
    val credit: CreditValue,
) {
    val remaining: Long get() = AllowancePolicy.remaining(limit, used)
    val runningLow: Boolean get() = AllowancePolicy.runningLow(limit, used)
    val limitReached: Boolean get() = AllowancePolicy.limitReached(limit, used)
}

/**
 * The usage ledger's service: reserves before every model call (enforcing the monthly credit allowance with
 * 409 AI_LIMIT_REACHED) and settles with the provider's token counts, costed from the versioned [prices].
 * Blocking (JDBC); callers run it off the event loop.
 */
class AiMeter(
    private val db: Db,
    private val clock: Clock,
    private val prices: PriceTable,
    /** What a credit is worth (`AI_CREDIT_MICRO_CENTS`). */
    val credit: CreditValue,
    private val allowances: AiAllowances,
    private val overage: AiOverage,
) {
    fun reserve(caller: AiCaller, model: String): Reservation {
        val now = clock.instant()
        val version = prices.versionAt(now).version
        val estimate = ReservationEstimates.of(caller.feature)
        val businessId = caller.businessId
            ?: return db.txBlocking { Reservation(AiUsageRepository.reserve(it, caller, model, version, estimate, now), caller, model) }
        return db.txBlocking(businessId) { conn ->
            AiUsageRepository.lock(conn, businessId)
            val business = BusinessRepository.findById(conn, businessId) ?: throw Errors.notFound("Business")
            requireAllowed(conn, business)
            Reservation(AiUsageRepository.reserve(conn, caller, model, version, estimate, now), caller, model)
        }
    }

    /** Records what the call actually used. Overage past the allowance is queued for metered billing. */
    fun settle(reservation: Reservation, usage: TokenUsage, stopReason: StopReason?, messageId: String?) {
        val now = clock.instant()
        val costed = prices.cost(reservation.model, usage, now)
        val businessId = reservation.caller.businessId
            ?: return db.txBlocking { AiUsageRepository.settle(it, reservation.id, usage, costed, 0, stopReason, messageId, now) }
        db.txBlocking(businessId) { conn ->
            AiUsageRepository.lock(conn, businessId)
            val business = BusinessRepository.findById(conn, businessId)
            val row = AiUsageRepository.get(conn, reservation.id)
            val overageMicro = if (business != null && row != null && overage.termsFor(business) != null) {
                val period = AiPeriod.of(row.createdAt, business.zone)
                val before = AiUsageRepository.settledExcept(conn, businessId, period.startInstant, period.endInstant, reservation.id)
                AllowancePolicy.overagePortion(limitOf(business), before, costed.microCents)
            } else {
                0L
            }
            AiUsageRepository.settle(conn, reservation.id, usage, costed, overageMicro, stopReason, messageId, now)
            if (overageMicro > 0) {
                JobQueue.enqueue(
                    conn, AiOverage.JOB_KIND,
                    JsonObject(
                        mapOf(
                            "usageId" to JsonPrimitive(reservation.id.toString()), "businessId" to JsonPrimitive(businessId.toString()),
                        ),
                    ),
                )
            }
        }
    }

    /** The call never reached the provider. */
    fun release(reservation: Reservation) {
        db.txBlocking(reservation.caller.businessId) { AiUsageRepository.release(it, reservation.id, clock.instant()) }
    }

    /** Throws 409 AI_LIMIT_REACHED when [business] may not start another model call (checked up front by features). */
    fun requireAllowed(conn: Connection, business: BusinessRow) {
        val status = status(conn, business)
        val decision = AllowancePolicy.decide(status.limit, Committed(status.used, status.reserved), overage.termsFor(business))
        if (decision == AllowanceDecision.Denied) {
            throw Errors.aiLimit(
                AiLimitMessages.limitReached(business.plan, allowances, status.period),
            )
        }
    }

    fun status(conn: Connection, business: BusinessRow): CreditStatus {
        val now = clock.instant()
        val period = AiPeriod.of(now, business.zone)
        val committed = AiUsageRepository.committed(conn, business.id, period.startInstant, period.endInstant, now.minus(STALE_RESERVATION))
        return CreditStatus(business.plan.wire, period, limitOf(business), committed.settled, committed.reserved, credit)
    }

    fun limitOf(business: BusinessRow): Long = credit.toMicroCents(allowances.creditsFor(business.plan))

    fun overageFor(business: BusinessRow): Boolean = overage.termsFor(business) != null

    companion object {
        /** Reservations older than this belong to requests that crashed; they stop counting and are released. */
        val STALE_RESERVATION: Duration = Duration.ofMinutes(15)
    }
}

/** Human copy for AI_LIMIT_REACHED, naming the plan, the allowance and the way out. */
object AiLimitMessages {
    fun limitReached(plan: Plan, allowances: AiAllowances, period: AiPeriod): String {
        val used = "You've used all ${"%,d".format(Locale.ROOT, allowances.creditsFor(plan))} AI credits on the ${plan.displayName} plan " +
            "this month."
        val resets = "They reset on ${period.resetsOn.format(DateTimeFormatter.ofPattern("d MMMM", Locale.ENGLISH))}."
        val next = plan.next
        return if (next == null) {
            "$used $resets"
        } else {
            "$used Upgrade to ${next.displayName} for ${"%,d".format(Locale.ROOT, allowances.creditsFor(next))} a month. $resets"
        }
    }
}
