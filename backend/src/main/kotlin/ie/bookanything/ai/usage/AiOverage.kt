package ie.bookanything.ai.usage

import com.stripe.param.billing.MeterEventCreateParams
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.Db
import ie.bookanything.jobs.Job
import ie.bookanything.payments.StripeGateway
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory
import java.time.Clock
import java.time.Instant
import java.util.UUID

/**
 * Optional metered billing of AI usage past the monthly allowance (Stripe Billing Meters). Off unless
 * `AI_OVERAGE_METER_EVENT` is set and Stripe is configured; then paid-plan businesses with a Stripe customer keep
 * working past their credits (up to [capCredits] extra a month) and the overage is reported as meter events. The
 * meter counts hundredths of a credit, so price the metered price per 100 units.
 */
class AiOverage(private val reporter: AiOverageReporter?, private val capCredits: Long, private val credit: CreditValue) {
    fun termsFor(business: BusinessRow): OverageTerms? =
        if (reporter != null && business.plan.isPaid && business.stripeCustomerId != null) {
            OverageTerms(credit.toMicroCents(capCredits))
        } else {
            null
        }

    companion object {
        const val JOB_KIND = "ai_overage_report"
    }
}

fun interface AiOverageReporter {
    /** Reports [units] for the Stripe customer; [identifier] makes retries idempotent. */
    fun report(customerId: String, units: Long, identifier: String, at: Instant)
}

class StripeAiOverageReporter(private val gateway: StripeGateway, private val eventName: String) : AiOverageReporter {
    override fun report(customerId: String, units: Long, identifier: String, at: Instant) {
        gateway.createMeterEvent(
            MeterEventCreateParams.builder()
                .setEventName(eventName)
                .putPayload("stripe_customer_id", customerId)
                .putPayload("value", units.toString())
                .setIdentifier(identifier)
                .setTimestamp(at.epochSecond)
                .build(),
        )
    }
}

/** The `ai_overage_report` job: sends one settled call's overage to the meter, once. */
class AiOverageJob(
    private val db: Db,
    private val clock: Clock,
    private val reporter: AiOverageReporter?,
    private val credit: CreditValue,
) {
    private val log = LoggerFactory.getLogger(AiOverageJob::class.java)

    fun handle(job: Job) {
        val usageId = UUID.fromString(job.payload["usageId"]!!.jsonPrimitive.content)
        val businessId = UUID.fromString(job.payload["businessId"]!!.jsonPrimitive.content)
        db.txBlocking(businessId) { conn ->
            val row = AiUsageRepository.get(conn, usageId) ?: return@txBlocking
            val business = BusinessRepository.findById(conn, businessId) ?: return@txBlocking
            val customer = business.stripeCustomerId
            if (reporter == null || customer == null || row.overageMicroCents <= 0) {
                log.warn("AI overage for usage {} not reported (overage billing is off or the business has no Stripe customer)", usageId)
                return@txBlocking
            }
            // One meter unit is a hundredth of a credit, rounded up.
            reporter.report(customer, credit.hundredthsUp(row.overageMicroCents), "ai-usage-$usageId", row.createdAt)
            AiUsageRepository.markOverageReported(conn, usageId, clock.instant())
        }
    }
}
