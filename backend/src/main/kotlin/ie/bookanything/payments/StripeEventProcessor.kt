package ie.bookanything.payments

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.booking.BookingLifecycle
import ie.bookanything.booking.BookingRepository
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.config.StripeConfig
import ie.bookanything.db.Db
import ie.bookanything.jobs.Job
import ie.bookanything.jobs.JobQueue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.time.Clock
import java.util.UUID

/** Stripe event types bookanything acts on. Everything else is stored and marked processed. */
object StripeEvents {
    const val JOB_KIND = "stripe_event"
    val HANDLED = setOf(
        "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
        "checkout.session.expired", "charge.refunded", "account.updated",
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
) {
    private val log = LoggerFactory.getLogger(StripeEventProcessor::class.java)
    private val json = Json { ignoreUnknownKeys = true }

    fun handle(job: Job) {
        val eventId = job.payload["eventId"]?.jsonPrimitive?.content ?: return
        try {
            db.txBlocking { conn ->
                val stored = ProviderEventRepository.lock(conn, eventId) ?: return@txBlocking
                if (stored.processed) return@txBlocking
                process(conn, stored.type, json.parseToJsonElement(stored.payload) as JsonObject)
                ProviderEventRepository.markProcessed(conn, eventId)
            }
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
            "charge.refunded" -> chargeRefunded(conn, obj, account)
            // A connected account only reports on itself.
            "account.updated" -> if (account != null && account == obj.string("id")) {
                accountUpdated(conn, obj)
            } else {
                ignoredConnect(
                    type,
                    account,
                )
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
        if (account == null || account != business.stripeAccountId) {
            log.warn(
                "stripe event for payment {} came from account {} but the business uses {}: ignored",
                payment.id, account, business.stripeAccountId,
            )
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
            log.warn(
                "stripe session {} paid {} {} but payment {} is {} {}: not applied", session.string("id"), amount, currency,
                payment.id, payment.amountCents, payment.currency,
            )
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
    private fun chargeRefunded(conn: Connection, charge: JsonObject, account: String?) {
        val pi = charge.string("payment_intent") ?: return
        val payment = PaymentRepository.chargeByProviderRef(conn, "stripe", pi)
            ?: charge.obj("metadata")?.string("paymentId")?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?.let { PaymentRepository.get(conn, it) }?.takeIf { it.kind == "charge" && it.provider == "stripe" }
            ?: run { log.info("charge.refunded for unknown payment intent {}", pi); return }
        val business = BusinessRepository.findById(conn, payment.businessId) ?: return
        if (account != business.stripeAccountId) {
            log.warn(
                "charge.refunded for payment {} from account {} ignored (business uses {})", payment.id, account, business.stripeAccountId,
            )
            return
        }
        // Thrown, not dropped: the job retries this event once the checkout's own event has recorded the payment.
        check(payment.status == "succeeded") { "charge.refunded for payment ${payment.id} before its checkout completed: retrying" }
        val total = charge.long("amount_refunded")?.toInt() ?: return
        // Lock order: the booking, then its payments. Our own refund's answer is recorded the same way, often at the
        // moment Stripe sends this event (RefundSettlement), and the two would otherwise deadlock.
        BookingRepository.get(conn, business.id, payment.bookingId, forUpdate = true)
        val added = lifecycle.payments.reconcileRefunds(conn, payment, total)
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
