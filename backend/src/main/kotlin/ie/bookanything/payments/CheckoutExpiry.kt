package ie.bookanything.payments

import ie.bookanything.business.BusinessRepository
import ie.bookanything.db.Db
import ie.bookanything.jobs.Job
import ie.bookanything.jobs.JobQueue
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import java.sql.Connection
import java.util.UUID

/**
 * Closes the provider's checkout of a charge that was cancelled while it could still be paid (its held booking was
 * cancelled), so the customer can't pay for a booking that no longer exists. Queued in the cancelling transaction and
 * run by the job worker after the commit, outside any transaction; a payment that still gets through is refunded as a
 * late payment ([ie.bookanything.booking.BookingLifecycle.paymentSucceeded]).
 */
class CheckoutExpiry(private val db: Db, private val provider: PaymentProvider) {

    fun handle(job: Job) {
        val paymentId = UUID.fromString(job.payload["paymentId"]!!.jsonPrimitive.content)
        val businessId = UUID.fromString(job.payload["businessId"]!!.jsonPrimitive.content)
        val (business, payment) = db.txBlocking(businessId, readOnly = true) { conn ->
            val business = BusinessRepository.findById(conn, businessId)
            val payment = PaymentRepository.get(conn, paymentId)
            if (business == null || payment == null) null else business to payment
        } ?: return
        // A checkout made by another provider (development payments before Stripe was set up) has nothing to close.
        if (payment.kind != "charge" || payment.status != "cancelled" || payment.provider != provider.name) return
        // A session paid meanwhile is left alone: that payment is refunded as a late payment.
        provider.expireCheckout(business, payment.providerRef ?: return, payment.providerAccount)
    }

    companion object {
        const val JOB_KIND = "payment_checkout_expire"

        /** Queues closing [paymentId]'s checkout once the caller's transaction commits. */
        fun enqueue(conn: Connection, businessId: UUID, paymentId: UUID) {
            JobQueue.enqueue(
                conn, JOB_KIND,
                JsonObject(mapOf("paymentId" to JsonPrimitive(paymentId.toString()), "businessId" to JsonPrimitive(businessId.toString()))),
            )
        }
    }
}
