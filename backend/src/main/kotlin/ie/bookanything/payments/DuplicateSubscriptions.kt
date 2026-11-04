package ie.bookanything.payments

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.config.StripeConfig
import ie.bookanything.db.Db
import ie.bookanything.db.queryOne
import ie.bookanything.jobs.Job
import ie.bookanything.jobs.JobQueue
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.observability.Telemetry
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.util.Locale
import java.util.UUID

/**
 * A business with two live plan subscriptions: two checkouts finished at once, for two plans ([Reason.DUPLICATE]), or a
 * paid one started while its plan's was past due ([Reason.REPLACED], which became the plan). The one the business bills
 * stays, and the other is cancelled at once and what its latest invoice charged refunded in full, so it is never billed
 * twice. Queued by the event processor; the provider is called by the job worker, outside any transaction, and
 * everything is read again first: the other may have become the business's own since, or the one it had may have ended
 * (then the other becomes the plan). One that wasn't started from here (no `businessId` in its metadata) is left to the
 * owners. A retry after a partial failure finishes the refunds of one already cancelled. The owners are told.
 */
class DuplicateSubscriptions(
    private val db: Db,
    private val provider: PlatformSubscriptions?,
    private val inbox: Inbox,
    private val stripe: StripeConfig,
) {
    private val log = LoggerFactory.getLogger(DuplicateSubscriptions::class.java)

    enum class Reason { DUPLICATE, REPLACED }

    /** What the job does, decided from the business and both subscriptions as Stripe has them now. */
    private sealed interface Decision {
        data object Nothing : Decision
        data class Adopt(val subscription: StripeSubscription) : Decision
        data object LeaveToOwners : Decision
        data class Cancel(val subscription: StripeSubscription) : Decision
        data object Unchecked : Decision
    }

    fun handle(job: Job) {
        val businessId = UUID.fromString(job.payload["businessId"]!!.jsonPrimitive.content)
        val subscriptionId = job.payload["subscriptionId"]!!.jsonPrimitive.content
        val reason = job.payload["reason"]?.jsonPrimitive?.content?.let { r -> Reason.entries.find { it.name == r } } ?: Reason.DUPLICATE
        val provider = provider ?: return
        val business = db.txBlocking(businessId, readOnly = true) { BusinessRepository.findById(it, businessId) } ?: return
        val lastAttempt = job.attempts >= job.maxAttempts
        val decision = try {
            decide(provider, business, subscriptionId)
        } catch (e: StripeRefusedException) {
            log.warn("duplicate subscription {} of business {} couldn't be checked: {}", subscriptionId, businessId, e.stripeCode)
            Decision.Unchecked
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Unreachable: retried, then the owners check.
            if (!lastAttempt) throw e
            log.warn("duplicate subscription {} of business {} couldn't be checked: {}", subscriptionId, businessId, e.message)
            Decision.Unchecked
        }
        when (decision) {
            Decision.Nothing -> log.info("subscription {} of business {} is no longer a second one", subscriptionId, businessId)
            is Decision.Adopt -> adopt(business, decision.subscription)
            Decision.LeaveToOwners -> tell(business, subscriptionId, reason, Told.NOT_OURS)
            Decision.Unchecked -> unchecked(job, business, subscriptionId, reason)
            is Decision.Cancel -> {
                val outcome = cancel(job, provider, decision.subscription, lastAttempt)
                if (outcome.notRefunded.isNotEmpty()) notRefunded(subscriptionId, outcome.notRefunded)
                tell(business, subscriptionId, reason, if (outcome.cancelled) Told.CANCELLED else Told.NOT_CANCELLED, outcome)
            }
        }
    }

    private fun decide(provider: PlatformSubscriptions, business: BusinessRow, subscriptionId: String): Decision {
        val kept = business.stripeSubscriptionId
        if (kept == subscriptionId) return Decision.Nothing
        val other = provider.currentSubscription(subscriptionId) ?: return Decision.Nothing
        val ours = other.metadata["businessId"] != null
        // Ended: cancelled by an earlier attempt (or by the owners) whose refunds or alert didn't finish, so they do now.
        if (other.status !in LIVE) return if (ours) Decision.Cancel(other) else Decision.Nothing
        val keptLive = kept != null && business.hasPaidSubscription && provider.currentSubscription(kept)?.status in LIVE
        return when {
            // The one the business had ended (or its end was applied already): the other is its plan now.
            !keptLive -> Decision.Adopt(other)
            !ours -> Decision.LeaveToOwners
            else -> Decision.Cancel(other)
        }
    }

    /**
     * Cancels [sub] unless it has ended (recording that it was, for a retry), then refunds what its latest invoice charged.
     * Stripe unreachable: retried; on the [lastAttempt] the owners cancel it, or what wasn't refunded is reported.
     */
    private fun cancel(job: Job, provider: PlatformSubscriptions, sub: StripeSubscription, lastAttempt: Boolean): DuplicateCancel {
        if (sub.status in LIVE) {
            val cancelled = try {
                provider.cancelDuplicateSubscription(sub.id)
            } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Unreachable: retried, then left to the owners.
                if (!lastAttempt) throw e
                Telemetry.errors.capture(e, mapOf("job" to JOB_KIND, "subscription" to sub.id))
                false
            }
            if (!cancelled) return DuplicateCancel(cancelled = false)
            val done = job.payload + mapOf(CANCELLED to JsonPrimitive(true), LATEST_INVOICE to JsonPrimitive(sub.latestInvoice))
            db.txBlocking { JobQueue.setPayload(it, job.id, JsonObject(done)) }
        }
        return try {
            provider.refundDuplicateSubscription(sub.id, sub.latestInvoice, lastAttempt)
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Unreachable: retried, then reported.
            if (!lastAttempt) throw e
            DuplicateCancel(cancelled = true, notRefunded = listOf(sub.latestInvoice ?: "latest invoice"))
        }
    }

    /** Stripe couldn't be read for good: a cancellation this job made is still said, with its refund outstanding. */
    private fun unchecked(job: Job, business: BusinessRow, subscriptionId: String, reason: Reason) {
        if (job.payload[CANCELLED]?.jsonPrimitive?.content == "true") {
            val invoice = job.payload[LATEST_INVOICE]?.jsonPrimitive?.takeIf { it.isString }?.content ?: "latest invoice"
            notRefunded(subscriptionId, listOf(invoice))
            tell(business, subscriptionId, reason, Told.CANCELLED, DuplicateCancel(cancelled = true, notRefunded = listOf(invoice)))
            return
        }
        Telemetry.errors.message("duplicate subscription unchecked", mapOf("subscription" to subscriptionId))
        tell(business, subscriptionId, reason, Told.UNCHECKED)
    }

    private fun notRefunded(subscriptionId: String, what: List<String>) = Telemetry.errors.message(
        "duplicate subscription payments not refunded",
        mapOf("subscription" to subscriptionId, "payments" to what.joinToString(",")),
    )

    /** The subscription the business had ended: [other] is its subscription now (unless that changed since it was read). */
    private fun adopt(business: BusinessRow, other: StripeSubscription) = db.txBlocking(business.id) { conn ->
        val locked = BusinessRepository.lockById(conn, business.id) ?: return@txBlocking
        val moved = locked.stripeSubscriptionId != business.stripeSubscriptionId && locked.stripeSubscriptionId != other.id
        if (moved || ProviderEventRepository.subscriptionDeleted(conn, other.id)) {
            log.info("subscription {} of business {} changed since it was read: not adopted", other.id, business.id)
            return@txBlocking
        }
        // As its own: the one it had has ended.
        val change = PlanMapping.fromSubscription(
            "customer.subscription.updated", other.id, other.status, other.priceIds, other.metadata["plan"], stripe, locked.plan, other.id,
        ) ?: return@txBlocking
        StripeAccountRepository.setPlan(conn, business.id, change, other.customer)
        Audit.record(
            conn, business.id, Actor.SYSTEM, "billing.plan_changed", "business", business.id,
            mapOf(
                "from" to locked.plan.wire, "to" to change.plan.wire, "status" to change.planStatus, "subscription" to other.id,
                "replaced" to locked.stripeSubscriptionId,
            ),
        )
    }

    private enum class Told { CANCELLED, NOT_CANCELLED, NOT_OURS, UNCHECKED }

    private fun tell(business: BusinessRow, subscriptionId: String, reason: Reason, told: Told, outcome: DuplicateCancel? = null) {
        val plan = business.stripeSubscriptionId ?: "none"
        db.txBlocking(business.id) { conn ->
            Audit.record(
                conn, business.id, Actor.SYSTEM, "billing.duplicate_cancelled", "business", business.id,
                mapOf(
                    "subscription" to subscriptionId, "kept" to plan, "reason" to reason.name.lowercase(),
                    "outcome" to told.name.lowercase(),
                    "refunded" to outcome?.refunded, "notRefunded" to outcome?.notRefunded,
                ),
            )
            val (title, body) = when (told) {
                Told.CANCELLED ->
                    "A second plan subscription was cancelled" to
                        cancelledText(business, subscriptionId, plan, reason, outcome!!)
                Told.NOT_CANCELLED ->
                    "You have two plan subscriptions" to "Your billing account has two plan subscriptions: " +
                        "$plan, your plan, and $subscriptionId, and we couldn't cancel $subscriptionId. Please cancel it " +
                        "from the billing portal so you aren't charged twice."
                Told.UNCHECKED -> if (business.stripeSubscriptionId == null) {
                    "A plan subscription needs checking" to "We couldn't check plan subscription $subscriptionId with Stripe. " +
                        "Your plan is updated when Stripe next reports on it; if you are charged for two plans, cancel the one " +
                        "you don't need from the billing portal."
                } else {
                    "You may have two plan subscriptions" to "Your billing account may have two plan subscriptions " +
                        "($plan, your plan, and $subscriptionId), and we couldn't check them with Stripe. Please look in the " +
                        "billing portal and cancel the one you don't need, so you aren't charged twice."
                }
                Told.NOT_OURS ->
                    "You have two plan subscriptions" to "Besides your plan subscription ($plan), your billing account " +
                        "has another ($subscriptionId) that wasn't started here, so we left it alone. If you don't need it, cancel it " +
                        "from the billing portal so you aren't charged twice."
            }
            inbox.paymentsAlert(
                conn, business, title, body, "duplicate-subscription:$subscriptionId:${told.name.lowercase()}",
                link = "/dashboard/${business.slug}/settings/billing",
            )
        }
    }

    private fun cancelledText(
        business: BusinessRow, subscriptionId: String, plan: String, reason: Reason, outcome: DuplicateCancel,
    ): String {
        val locale = Locale.forLanguageTag(business.locale)
        val money = outcome.refunded.entries.joinToString(" and ") { (currency, cents) -> Money.format(cents.toInt(), currency, locale) }
        val what = when (reason) {
            Reason.DUPLICATE ->
                "Two plan checkouts finished at the same time, so you had two subscriptions. We kept one ($plan) " +
                    "and cancelled the other ($subscriptionId) at once"
            Reason.REPLACED ->
                "Your plan subscription ($subscriptionId) was past due when another one ($plan) was paid, so $plan " +
                    "is your plan now and we cancelled $subscriptionId at once"
        }
        return what + (if (outcome.refunded.isEmpty()) "." else ", refunding the $money it charged.") +
            (if (outcome.notRefunded.isEmpty()) "" else " Part of what it charged couldn't be refunded yet: our team will.")
    }

    companion object {
        const val JOB_KIND = "stripe_duplicate_subscription"

        /** About a day of attempts, as for refunds. */
        private const val MAX_ATTEMPTS = 30

        /** In the job's payload once the subscription is cancelled: what a retry that can't read Stripe still says. */
        private const val CANCELLED = "cancelled"
        private const val LATEST_INVOICE = "latestInvoice"

        /** Statuses of a subscription that bills (or will, while Stripe retries its payment). */
        val LIVE = setOf("active", "trialing", "past_due")

        /** Whether [subscriptionId] was found to be [businessId]'s duplicate already (its audit record). */
        fun flagged(conn: Connection, businessId: UUID, subscriptionId: String): Boolean = conn.queryOne(
            "SELECT EXISTS (SELECT 1 FROM audit_events WHERE business_id = ? AND action = 'billing.duplicate_subscription' " +
                "AND summary->>'subscription' = ?)",
            businessId, subscriptionId,
        ) { it.getBoolean(1) } ?: false

        fun enqueue(conn: Connection, businessId: UUID, subscriptionId: String, reason: Reason) {
            JobQueue.enqueue(
                conn, JOB_KIND,
                JsonObject(
                    mapOf(
                        "businessId" to JsonPrimitive(businessId.toString()), "subscriptionId" to JsonPrimitive(subscriptionId),
                        "reason" to JsonPrimitive(reason.name),
                    ),
                ),
                maxAttempts = MAX_ATTEMPTS,
            )
        }
    }
}
