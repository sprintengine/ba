package ie.bookanything.payments

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.booking.RefundSettlement
import ie.bookanything.business.BusinessRepository
import ie.bookanything.db.Db
import ie.bookanything.db.update
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
 * A payment that doesn't match the booking it names (another amount or currency than the checkout we created): it pays
 * for nothing, so it is refunded in full on the account it was taken on, and the business's owners are told. Queued by
 * the event processor in the event's transaction; the provider is called by the job worker, outside any transaction.
 */
class UnmatchedPayments(private val db: Db, private val provider: PaymentProvider, private val inbox: Inbox) {
    private val log = LoggerFactory.getLogger(UnmatchedPayments::class.java)

    fun handle(job: Job) {
        val p = job.payload
        val businessId = UUID.fromString(p.str("businessId"))
        val paymentIntent = p.str("paymentIntent")
        val amount = p.str("amountCents").toInt()
        // Stripe writes currencies in lowercase.
        val currency = p.str("currency").uppercase()
        val business = db.txBlocking(businessId, readOnly = true) { BusinessRepository.findById(it, businessId) } ?: return
        val result = try {
            provider.refundUnmatched(business, p.str("account"), paymentIntent)
        } catch (e: StripeRefusedException) {
            // Refunded already (from the Stripe dashboard, say): the money is back.
            if (e.stripeCode in RefundSettlement.ALREADY_REFUNDED) {
                RefundResult(null, RefundOutcome.SUCCEEDED)
            } else {
                RefundResult(null, RefundOutcome.FAILED, e.stripeCode)
            }
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Unreachable: retried, then given up as failed.
            log.warn("refunding unmatched payment {} failed: {}", paymentIntent, e.message)
            if (job.attempts < job.maxAttempts) throw e
            Telemetry.errors.capture(e, mapOf("job" to JOB_KIND, "paymentIntent" to paymentIntent))
            RefundResult(null, RefundOutcome.FAILED, UNREACHABLE)
        }
        val money = Money.format(amount, currency, Locale.forLanguageTag(business.locale))
        db.txBlocking(businessId) { conn ->
            Audit.record(
                conn, businessId, Actor.SYSTEM, "payment.unmatched_refund", "business", businessId,
                mapOf(
                    "paymentIntent" to paymentIntent, "amountCents" to amount, "currency" to currency, "refund" to result.providerRef,
                    "outcome" to result.outcome.name.lowercase(), "payment" to p["paymentId"]?.jsonPrimitive?.content,
                ),
            )
            val (title, body) = if (result.succeeded) {
                "A payment was refunded" to "A customer paid $money, which didn't match what the booking asked for, so it " +
                    "paid for nothing and was refunded in full. Stripe payment $paymentIntent."
            } else {
                val ask = if (result.failureReason == UNREACHABLE) {
                    "Stripe didn't answer, so check Stripe payment $paymentIntent in your Stripe dashboard and refund it if it wasn't."
                } else {
                    "Please refund Stripe payment $paymentIntent from your Stripe dashboard."
                }
                "A payment needs refunding" to "A customer paid $money, which didn't match the booking it was for, and it " +
                    "couldn't be refunded automatically. $ask"
            }
            inbox.paymentsAlert(conn, business, title, body, "unmatched:$paymentIntent:${result.outcome}")
        }
        if (!result.succeeded) {
            Telemetry.metrics.refundFailed()
            // Unreachable to the end: Stripe may have made it, so the owners check first.
            Telemetry.metrics.refundGivenUp(certain = result.failureReason != UNREACHABLE)
        }
    }

    private fun JsonObject.str(key: String) = this[key]!!.jsonPrimitive.content

    companion object {
        const val JOB_KIND = "stripe_unmatched_refund"

        /** The refund's `metadata.reason`: how its later events are told apart from a booking's refunds. */
        const val REASON = "unmatched_payment"

        /**
         * Records the money taken by [paymentIntent] against [payment]'s booking: a charge that paid for nothing (failed),
         * in its own currency, so the booking's ledger shows it and the refund's events find it.
         */
        fun record(conn: Connection, payment: PaymentRow, paymentIntent: String, amountCents: Long, currency: String, account: String) {
            conn.update(
                """
                INSERT INTO payments (business_id, booking_id, provider, kind, provider_ref, amount_cents, currency, status, provider_account)
                VALUES (?, ?, 'stripe', 'charge', ?, ?, ?, 'failed', ?)
                """.trimIndent(),
                payment.businessId, payment.bookingId, paymentIntent, amountCents.toInt(), currency.uppercase(), account,
            )
        }

        /** Queues refunding [paymentIntent] ([amountCents] in [currency], on [account]) once the caller's transaction commits. */
        fun enqueue(
            conn: Connection, businessId: UUID, paymentId: UUID, account: String, paymentIntent: String, amountCents: Long,
            currency: String,
        ) {
            JobQueue.enqueue(
                conn, JOB_KIND,
                JsonObject(
                    mapOf(
                        "businessId" to JsonPrimitive(businessId.toString()), "paymentId" to JsonPrimitive(paymentId.toString()),
                        "account" to JsonPrimitive(account), "paymentIntent" to JsonPrimitive(paymentIntent),
                        "amountCents" to JsonPrimitive(amountCents.toString()), "currency" to JsonPrimitive(currency),
                    ),
                ),
                maxAttempts = MAX_ATTEMPTS,
            )
        }

        private const val UNREACHABLE = "provider_unreachable"

        /** About a day of attempts, as for refunds (inside Stripe's 24 hours of idempotency). */
        private const val MAX_ATTEMPTS = 30
    }
}
