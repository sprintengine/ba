package ie.bookanything.payments

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.booking.BookingLifecycle
import ie.bookanything.booking.BookingRepository
import ie.bookanything.booking.RefundSettlement
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.config.StripeConfig
import ie.bookanything.db.Db
import ie.bookanything.db.afterCommit
import ie.bookanything.http.parseUuidOrNull
import ie.bookanything.jobs.Job
import ie.bookanything.jobs.JobQueue
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.observability.Telemetry
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.time.Clock
import java.time.Instant
import java.util.UUID

/** Stripe event types bookanything acts on. Everything else is stored and marked processed. */
object StripeEvents {
    const val JOB_KIND = "stripe_event"
    val HANDLED = setOf(
        "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
        "checkout.session.expired", "charge.refunded", "account.updated", "account.application.deauthorized",
        "refund.updated", "refund.failed", "charge.refund.updated",
        "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
        "invoice.payment_failed",
    )
}

/**
 * Processes stored Stripe events from the job queue. Each event is handled in one transaction
 * that locks its `provider_events` row and sets `processed_at`, so effects apply exactly once even
 * with duplicate deliveries, retries or several workers.
 */
class StripeEventProcessor(
    private val db: Db,
    private val clock: Clock,
    private val stripe: StripeConfig,
    private val lifecycle: BookingLifecycle,
    private val inbox: Inbox,
    private val refunds: RefundSettlement,
) {
    private val log = LoggerFactory.getLogger(StripeEventProcessor::class.java)
    private val json = Json { ignoreUnknownKeys = true }

    fun handle(job: Job) {
        val eventId = job.payload["eventId"]?.jsonPrimitive?.content ?: return
        try {
            val lag = db.txBlocking { conn ->
                val stored = ProviderEventRepository.lock(conn, eventId) ?: return@txBlocking null
                if (stored.processed) return@txBlocking null
                process(conn, stored.type, json.parseToJsonElement(stored.payload) as JsonObject)
                ProviderEventRepository.markProcessed(conn, eventId)
            }
            lag?.let(Telemetry.metrics::stripeWebhookLag)
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Records the error on the event and rethrows.
            runCatching {
                val error = (e.message ?: e.javaClass.simpleName).take(MAX_ERROR_LENGTH)
                db.txBlocking { ProviderEventRepository.recordError(it, eventId, error) }
            }
            throw e
        }
    }

    fun process(conn: Connection, type: String, event: JsonObject) {
        val obj = event.obj("data")?.obj("object") ?: return
        val account = event.string("account")
        // Billing (plans) lives on the platform account only. Connect events carry `account`, and a business with a
        // Standard account can create subscriptions/checkouts with any metadata there, so those must never set plans.
        val platform = account == null
        when (type) {
            "checkout.session.completed", "checkout.session.async_payment_succeeded" -> {
                if (obj.string("mode") == "subscription") {
                    if (platform) billingCheckoutCompleted(conn, obj) else ignoredConnect(type, account)
                } else if (obj.string("payment_status") == "paid") {
                    paymentCompleted(conn, obj, account)
                } else {
                    log.info(
                        "checkout session {} completed with payment_status={}, waiting for async payment",
                        obj.string("id"), obj.string("payment_status"),
                    )
                }
            }
            "checkout.session.expired", "checkout.session.async_payment_failed" ->
                if (obj.string("mode") != "subscription") paymentAbandoned(conn, obj, account)
            "charge.refunded" -> chargeRefunded(conn, obj, account, event.long("created"))
            // A refund's later news (Stripe has used all three names): only a failure changes anything, as an accepted
            // refund already counts as made.
            "refund.updated", "refund.failed", "charge.refund.updated" -> refundUpdated(conn, obj, account)
            // A connected account only reports on itself.
            "account.updated" -> if (account != null && account == obj.string("id")) {
                accountUpdated(conn, obj)
            } else {
                ignoredConnect(
                    type,
                    account,
                )
            }
            // The account (connected either way) disconnected from the platform, or the platform from it.
            "account.application.deauthorized" -> if (account != null) {
                accountDeauthorized(conn, account, event.string("id"), event.long("created"))
            } else {
                ignoredConnect(type, account)
            }
            "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted" ->
                if (platform) subscriptionChanged(conn, type, obj) else ignoredConnect(type, account)
            "invoice.payment_failed" -> if (platform) invoicePaymentFailed(conn, obj) else ignoredConnect(type, account)
        }
    }

    private fun ignoredConnect(type: String, account: String?) =
        log.warn("stripe {} event from account {} ignored: not applicable to that account", type, account)

    /** Finds the charge for a Checkout Session on a connected account; the account must own the business. */
    private fun paymentFor(conn: Connection, session: JsonObject, account: String?): Pair<BusinessRow, PaymentRow>? {
        val payment = session.obj("metadata")?.string("paymentId")?.let { runCatching { UUID.fromString(it) }.getOrNull() }
            ?.let { PaymentRepository.get(conn, it) }
            ?: session.string("id")?.let { PaymentRepository.chargeByProviderRef(conn, "stripe", it) }
            ?: run { log.warn("stripe checkout session {} does not match a payment", session.string("id")); return null }
        val business = BusinessRepository.findById(conn, payment.businessId) ?: return null
        // The account the charge was taken on, even if the business has connected another since.
        val owner = payment.providerAccount ?: business.stripeAccountId
        if (account == null || account != owner) {
            log.warn("stripe event for payment {} came from account {} but it was taken on {}: ignored", payment.id, account, owner)
            return null
        }
        return business to payment
    }

    private fun paymentCompleted(conn: Connection, session: JsonObject, account: String?) {
        val (business, payment) = paymentFor(conn, session, account) ?: return
        // Only a session for exactly the amount and currency we asked for pays for the booking.
        val amount = session.long("amount_total")
        val currency = session.string("currency")
        if (amount != payment.amountCents.toLong() || !payment.currency.equals(currency, ignoreCase = true)) {
            log.error(
                "stripe session {} paid {} {} but payment {} is {} {}: not applied, refunding it", session.string("id"), amount, currency,
                payment.id, payment.amountCents, payment.currency,
            )
            // Money taken for nothing. The booking's own charge is left as it is (still payable, or already paid); the money
            // gets a ledger row of its own (a failed charge known by its PaymentIntent, so that refund's own events are
            // ours), is refunded in full on the account it was paid to, once, and the owners are told.
            val pi = session.string("payment_intent") ?: return
            if (amount == null || amount <= 0 || currency == null) return
            BookingRepository.get(conn, business.id, payment.bookingId, forUpdate = true)
            // Already handled: Stripe redelivers.
            if (PaymentRepository.chargeByProviderRef(conn, "stripe", pi) != null) return
            UnmatchedPayments.record(conn, payment, pi, amount, currency, account!!)
            UnmatchedPayments.enqueue(conn, business.id, payment.id, account, pi, amount, currency)
            return
        }
        // Lock order: the booking, then its payment (as cancellations do), so this cannot deadlock with one.
        BookingRepository.get(conn, business.id, payment.bookingId, forUpdate = true)
        // From now on the charge is identified by its PaymentIntent (refunds, charge.refunded).
        session.string("payment_intent")?.let { PaymentRepository.setProviderRef(conn, payment.id, it) }
        lifecycle.paymentSucceeded(conn, business, PaymentRepository.get(conn, payment.id)!!, clock.instant())
    }

    private fun paymentAbandoned(conn: Connection, session: JsonObject, account: String?) {
        val (business, payment) = paymentFor(conn, session, account) ?: return
        if (payment.status != "pending") return
        lifecycle.paymentCancelled(conn, business, payment, clock.instant())
    }

    /**
     * A refund made on Stripe (or the result of ours). The charge is found by its PaymentIntent, or by the `paymentId`
     * our checkout put in its metadata when the refund is reported before the checkout's completion was processed (the
     * charge is still known by its Checkout Session then): that event waits, retried, until the payment has succeeded.
     */
    private fun chargeRefunded(conn: Connection, charge: JsonObject, account: String?, created: Long?) {
        val pi = charge.string("payment_intent") ?: return
        val payment = PaymentRepository.chargeByProviderRef(conn, "stripe", pi)
            ?: charge.obj("metadata")?.string("paymentId")?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?.let { PaymentRepository.get(conn, it) }?.takeIf { it.kind == "charge" && it.provider == "stripe" }
            ?: run { log.info("charge.refunded for unknown payment intent {}", pi); return }
        val business = BusinessRepository.findById(conn, payment.businessId) ?: return
        val owner = payment.providerAccount ?: business.stripeAccountId
        if (account != owner) {
            log.warn("charge.refunded for payment {} from account {} ignored (taken on {})", payment.id, account, owner)
            return
        }
        // A payment that matched no booking: this is the refund we made of it (UnmatchedPayments), nothing to record.
        if (payment.status == "failed") {
            log.info("charge.refunded for unmatched payment {}: its own refund", payment.id)
            return
        }
        // Thrown, not dropped: the job retries this event once the checkout's own event has recorded the payment.
        check(payment.status == "succeeded") { "charge.refunded for payment ${payment.id} before its checkout completed: retrying" }
        val total = charge.long("amount_refunded")?.toInt() ?: return
        // Lock order: the booking, then its payments. Our own refund's answer is recorded the same way, often at the
        // moment Stripe sends this event (RefundSettlement), and the two would otherwise deadlock.
        BookingRepository.get(conn, business.id, payment.bookingId, forUpdate = true)
        val added = lifecycle.payments.reconcileRefunds(conn, payment, total, created?.let(Instant::ofEpochSecond))
        if (added > 0) {
            ie.bookanything.notifications.Notify.booking(
                conn, ie.bookanything.notifications.NotificationKind.PAYMENT_REFUNDED,
                business.id, payment.bookingId, mapOf("amountCents" to added.toString()),
            )
            Audit.record(
                conn, business.id, Actor.SYSTEM, "payment.refund_reconciled", "booking", payment.bookingId, mapOf("amountCents" to added),
            )
        }
    }

    /**
     * A refund Stripe accepted and now reports failed (or cancelled): taken off the booking, its owners told to refund
     * the customer another way, and the customer told (in the notice still to go out, or by email). Ours is found by the
     * refund's id, or the `refundPaymentId` we put in its metadata; one made in the Stripe dashboard by its charge. Each
     * failure arrives as several events: the first one handles it.
     */
    private fun refundUpdated(conn: Connection, refund: JsonObject, account: String?) {
        val id = refund.string("id") ?: return
        val failed = StripePaymentProvider.refundOutcome(refund.string("status")) == RefundOutcome.FAILED
        if (refund.obj("metadata")?.string("reason") == UnmatchedPayments.REASON) {
            if (failed) unmatchedRefundFailed(conn, refund, account)
            return
        }
        val (business, found) = refundSubject(conn, refund, id, account) ?: return
        // Lock order: the booking, then its payments. Looked up again under the lock: Stripe sends each failure as
        // several events, which other workers may be handling at the same moment.
        BookingRepository.get(conn, business.id, found.bookingId, forUpdate = true)
        val ours = ourRefund(conn, refund, id)?.let { PaymentRepository.get(conn, it.id, forUpdate = true) }
        // Only failures change anything: an accepted refund already counts, and one we gave up on that Stripe made
        // after all is recorded by its own charge.refunded.
        if (!failed) return
        // A refund we gave up on (unsure, no answer from Stripe) that Stripe had made: its charge.refunded recorded the
        // money as a refund made elsewhere, and that record is what fails now.
        val givenUp = ours?.status == "failed" && ours.providerRef == null
        val row = if (ours == null || givenUp) dashboardRefund(conn, chargeOf(conn, refund, found), refund, id) ?: return else ours
        if (row.status == "failed") return
        if (row.providerRef == null) PaymentRepository.setProviderRef(conn, row.id, id)
        // The job's notice still to go out says it failed; otherwise the customer was told it was coming.
        val tell = ours == null || !refunds.noticePending(conn, row.id)
        Telemetry.metrics.refundFailed()
        refunds.failed(conn, business, row.copy(providerRef = id), refund.string("failure_reason"), certain = true, tellCustomer = tell)
    }

    /** The business and the payment (our refund, else the charge refunded) a Stripe refund [id] is about, from [account]. */
    private fun refundSubject(conn: Connection, refund: JsonObject, id: String, account: String?): Pair<BusinessRow, PaymentRow>? {
        val found = ourRefund(conn, refund, id)
            ?: refund.string("payment_intent")?.let { PaymentRepository.chargeByProviderRef(conn, "stripe", it) }
            ?: run { log.info("refund {} updated: not one of ours", id); return null }
        return businessTakenOn(conn, found, account, "refund $id")?.let { it to found }
    }

    /**
     * The refund recorded for one made in the Stripe dashboard that failed ([refund], of [charge]), by amount (split off
     * one that covered several). Thrown, not dropped, when none is recorded yet: the event is retried once the refund's
     * own `charge.refunded` has recorded it.
     */
    private fun dashboardRefund(conn: Connection, charge: PaymentRow, refund: JsonObject, id: String): PaymentRow? {
        // A refund of money that paid for nothing (UnmatchedPayments) is the owners' to make: tell them it failed.
        if (charge.kind == "charge" && charge.status == "failed") {
            unmatchedRefundFailed(conn, refund, charge.providerAccount)
            return null
        }
        if (charge.kind != "charge" || charge.status != "succeeded") return null
        val amount = refund.long("amount")?.toInt() ?: return null
        RefundRows.claimExternal(conn, charge, amount, id)?.let { return it }
        // Stripe reports a dashboard refund's failure days later: one this young is just ahead of its charge.refunded.
        val young = refund.long("created")?.let { Instant.ofEpochSecond(it).isAfter(Instant.now().minus(DASHBOARD_RACE)) } ?: false
        check(!young) { "refund $id of payment ${charge.id} failed before it was recorded: retrying" }
        log.warn("refund {} of payment {} failed but matches no refund recorded for it", id, charge.id)
        return null
    }

    /** The business of [payment] when [account] is the one it was taken on; null (logged) for any other account. */
    private fun businessTakenOn(conn: Connection, payment: PaymentRow, account: String?, what: String): BusinessRow? {
        val business = BusinessRepository.findById(conn, payment.businessId) ?: return null
        val owner = payment.providerAccount ?: business.stripeAccountId
        if (account == owner) return business
        log.warn("{} for payment {} from account {} ignored (taken on {})", what, payment.id, account, owner)
        return null
    }

    /** The charge a Stripe refund returns money from: by its PaymentIntent, else the charge [found] itself. */
    private fun chargeOf(conn: Connection, refund: JsonObject, found: PaymentRow): PaymentRow =
        refund.string("payment_intent")?.let { PaymentRepository.chargeByProviderRef(conn, "stripe", it) } ?: found

    /** Our refund Stripe reports on: by its id, or the `refundPaymentId` we put in its metadata (a timed-out call). */
    private fun ourRefund(conn: Connection, refund: JsonObject, id: String): PaymentRow? =
        RefundRows.byProviderRef(conn, "stripe", id)
            ?: refund.obj("metadata")?.string("refundPaymentId")?.let(::parseUuidOrNull)?.let { PaymentRepository.get(conn, it) }
                ?.takeIf { it.kind == "refund" && it.provider == "stripe" }

    /** The refund we made of a payment that matched no booking failed: the owners refund it themselves. */
    private fun unmatchedRefundFailed(conn: Connection, refund: JsonObject, account: String?) {
        val pi = refund.string("payment_intent") ?: return
        val payment = PaymentRepository.chargeByProviderRef(conn, "stripe", pi) ?: return
        val business = BusinessRepository.findById(conn, payment.businessId) ?: return
        if (account != (payment.providerAccount ?: business.stripeAccountId)) return
        conn.afterCommit { Telemetry.metrics.refundGivenUp(certain = true) }
        inbox.paymentsAlert(
            conn, business, "A payment needs refunding",
            "A payment that didn't match its booking couldn't be refunded automatically (Stripe: " +
                "${refund.string("failure_reason")?.replace('_', ' ') ?: "failed"}). Please refund Stripe payment $pi another way.",
            "unmatched:$pi:failed-later",
        )
    }

    private fun accountUpdated(conn: Connection, account: JsonObject) {
        val id = account.string("id") ?: return
        val charges = account.bool("charges_enabled") ?: false
        val details = account.bool("details_submitted") ?: false
        val businessId = StripeAccountRepository.updateConnectStatus(conn, id, charges, details) ?: return
        Audit.record(
            conn, businessId, Actor.SYSTEM, "payments.account_updated", "business", businessId,
            mapOf(
                "chargesEnabled" to charges, "detailsSubmitted" to details,
            ),
        )
    }

    /**
     * The platform lost access to [account]: the business stops taking online payments (its services that need them are
     * hidden, as before it connected), the change is audited and its owners are told. A deauthorization from before the
     * account was (re)linked is about the earlier link and changes nothing.
     */
    private fun accountDeauthorized(conn: Connection, account: String, eventId: String?, created: Long?) {
        val businessId = StripeAccountRepository.businessIdByAccount(conn, account)
            ?: run { log.info("account.application.deauthorized for {}: no business uses it", account); return }
        val linkedAt = StripeAccountRepository.connectedAt(conn, businessId)
        // Stripe's `created` is in whole seconds: one from the second of the link counts as older.
        if (created != null && linkedAt != null && created <= linkedAt.epochSecond) {
            log.info("account.application.deauthorized for {} predates its link to business {}: ignored", account, businessId)
            return
        }
        val business = BusinessRepository.findById(conn, businessId) ?: return
        if (!StripeAccountRepository.unlink(conn, businessId, account)) return
        Audit.record(
            conn, businessId, Actor.SYSTEM, "payments.disconnected", "business", businessId,
            mapOf("account" to account, "method" to business.stripeConnectMethod, "reason" to "deauthorized"),
        )
        inbox.paymentsAlert(
            conn, business, "Stripe was disconnected",
            "${business.name} can't take online payments until you connect a Stripe account again. Services that need " +
                "payment are hidden from your booking page meanwhile.",
            "stripe-deauthorized:${eventId ?: account}",
        )
    }

    private fun businessForBilling(conn: Connection, metadataBusinessId: String?, customerId: String?): BusinessRow? {
        metadataBusinessId?.let {
            runCatching { UUID.fromString(it) }.getOrNull()
        }?.let { BusinessRepository.findById(conn, it) }?.let { return it }
        val id = customerId?.let { StripeAccountRepository.businessIdByCustomer(conn, it) } ?: return null
        return BusinessRepository.findById(conn, id)
    }

    private fun billingCheckoutCompleted(conn: Connection, session: JsonObject) {
        val business = businessForBilling(
            conn, session.obj("metadata")?.string("businessId") ?: session.string("client_reference_id"), session.string("customer"),
        )
            ?: run { log.warn("billing checkout {} does not match a business", session.string("id")); return }
        StripeAccountRepository.checkoutCompleted(conn, business.id, session.string("customer"))
        Audit.record(
            conn, business.id, Actor.SYSTEM, "billing.checkout_completed", "business", business.id,
            mapOf(
                "plan" to session.obj("metadata")?.string("plan"), "subscription" to session.string("subscription"),
            ),
        )
    }

    private fun subscriptionChanged(conn: Connection, type: String, sub: JsonObject) {
        val subId = sub.string("id") ?: return
        // Events can arrive late or be retried: one about a subscription already deleted must not bring its plan back.
        if (type != "customer.subscription.deleted" && ProviderEventRepository.subscriptionDeleted(conn, subId)) {
            log.info("subscription {} {} ignored: the subscription was deleted", subId, type)
            return
        }
        val business = businessForBilling(conn, sub.obj("metadata")?.string("businessId"), sub.string("customer"))
            ?: run { log.warn("subscription {} does not match a business", subId); return }
        val priceIds = (sub.obj("items")?.get("data") as? JsonArray).orEmpty()
            .mapNotNull { (it as? JsonObject)?.obj("price")?.string("id") }
        val change = PlanMapping.fromSubscription(
            type, subId, sub.string("status").orEmpty(), priceIds, sub.obj("metadata")?.string("plan"),
            stripe, business.plan, business.stripeSubscriptionId,
        )
            ?: run { log.info("subscription {} {} ignored for business {}", subId, type, business.id); return }
        StripeAccountRepository.setPlan(conn, business.id, change, sub.string("customer"))
        Audit.record(
            conn, business.id, Actor.SYSTEM, "billing.plan_changed", "business", business.id,
            mapOf(
                "from" to business.plan.wire, "to" to change.plan.wire, "status" to change.planStatus, "subscription" to subId,
                "event" to type,
            ),
        )
    }

    private fun invoicePaymentFailed(conn: Connection, invoice: JsonObject) {
        val business = businessForBilling(conn, null, invoice.string("customer")) ?: return
        if (!business.plan.isPaid) return
        StripeAccountRepository.markPastDue(conn, business.id)
        Audit.record(
            conn, business.id, Actor.SYSTEM, "billing.payment_failed", "business", business.id,
            mapOf(
                "invoice" to invoice.string("id"), "amountDue" to invoice.long("amount_due"),
            ),
        )
    }
}

internal fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject
internal fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
internal fun JsonObject.long(key: String): Long? = (this[key] as? JsonPrimitive)?.longOrNull
internal fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.content?.toBooleanStrictOrNull()

/** Enqueues processing for a newly stored Stripe event (same transaction as the insert). */
fun enqueueStripeEvent(conn: Connection, eventId: String) {
    JobQueue.enqueue(conn, StripeEvents.JOB_KIND, JsonObject(mapOf("eventId" to JsonPrimitive(eventId))), maxAttempts = 10)
}

private const val MAX_ERROR_LENGTH = 2000

/** How long a dashboard refund's failure may wait for its charge.refunded (retried meanwhile). */
private val DASHBOARD_RACE: java.time.Duration = java.time.Duration.ofHours(1)
