package ie.bookanything.booking

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.Db
import ie.bookanything.db.afterCommit
import ie.bookanything.jobs.Job
import ie.bookanything.jobs.JobHandler
import ie.bookanything.jobs.JobQueue
import ie.bookanything.jobs.JobRunner
import ie.bookanything.notifications.NotificationKind
import ie.bookanything.notifications.Notify
import ie.bookanything.observability.Telemetry
import ie.bookanything.payments.PaymentRepository
import ie.bookanything.payments.PaymentService
import ie.bookanything.payments.RefundResult
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.time.Duration
import java.util.UUID

/**
 * The email that tells the customer about a refund (a cancellation, a decline or a receipt): [kind] with [extra] fields.
 * The amount refunded, and whether the refund is still being processed, are added once the provider has answered.
 */
data class RefundNotice(val kind: String, val extra: Map<String, String> = emptyMap())

/**
 * Refunds reach the payment provider after the transaction that decided them has committed, so a slow provider never
 * holds a booking's locks (docs/architecture.md section 7).
 *
 * [request] records the refund and queues its job (`payment_refund_retry`) in the caller's transaction, as an outbox:
 * the job exists exactly when the cancellation committed. Once it commits, the job runs straight away in the same
 * request ([JobRunner.runNow]), so the response already shows the refund; the worker runs it instead if the process
 * stopped first ([BACKSTOP] later), and retries it with backoff while the provider fails. The customer's email about the
 * refund goes with the provider's answer, so it says what happened: "a refund of €X is on its way", or, when the
 * provider failed, "being processed" followed by a receipt once a retry succeeds.
 */
class RefundSettlement(private val db: Db, private val payments: PaymentService) {
    private val log = LoggerFactory.getLogger(RefundSettlement::class.java)

    /**
     * Records a refund of [amountCents] of the booking's online charge and queues it for the provider; [notice] is
     * queued once the provider has answered, or now when there is nothing to refund. Returns the amount being refunded
     * (0 when nothing was paid online).
     */
    fun request(conn: Connection, business: BusinessRow, bookingId: UUID, amountCents: Int, notice: RefundNotice?): Int {
        val refundId = payments.recordRefund(conn, business, bookingId, amountCents)
        if (refundId == null) {
            notice?.let { send(conn, business.id, bookingId, it, refunded = 0, pending = false) }
            return 0
        }
        val payload = buildMap {
            put("refundPaymentId", JsonPrimitive(refundId.toString()))
            put("businessId", JsonPrimitive(business.id.toString()))
            notice?.let { put(NOTICE, it.toJson()) }
        }
        val jobId = JobQueue.enqueue(
            conn, PaymentService.REFUND_RETRY_JOB, JsonObject(payload), maxAttempts = MAX_ATTEMPTS, delay = BACKSTOP,
        )
        conn.afterCommit { JobRunner.runNow(db, jobId, JobHandler(::handle)) }
        return amountCents
    }

    /**
     * The `payment_refund_retry` job: sends the refund to the provider outside any transaction, then records the answer
     * and sends the notice in a short one. Throws while the provider fails, so the job is retried.
     */
    fun handle(job: Job) {
        val refundId = UUID.fromString(job.payload["refundPaymentId"]!!.jsonPrimitive.content)
        val businessId = UUID.fromString(job.payload["businessId"]!!.jsonPrimitive.content)
        val (business, toSend) = db.txBlocking(businessId) { conn ->
            BusinessRepository.findById(conn, businessId)?.let { it to payments.refundToSend(conn, it, refundId) }
        } ?: return
        val sent = toSend?.let { runCatching { payments.sendRefund(business, it) } }
        val result = sent?.getOrNull()
        db.txBlocking(businessId) { conn -> settle(conn, business, job, refundId, result) }
        sent?.exceptionOrNull()?.let { e ->
            // Provider boundary: the job retries; the provider's error is the cause, for the report once retries run out.
            log.warn("refund {} for booking {} failed, will retry: {}", toSend.refund.id, toSend.refund.bookingId, e.message)
            Telemetry.metrics.refundFailed()
            throw IllegalStateException("refund $refundId failed at the provider", e)
        }
    }

    /**
     * Records the provider's [result] (null: it failed or there was nothing to send) and tells the customer: the notice
     * on the first attempt, whatever happened, and a receipt when a later attempt makes the refund.
     */
    private fun settle(conn: Connection, business: BusinessRow, job: Job, refundId: UUID, result: RefundResult?) {
        val refund = PaymentRepository.get(conn, refundId) ?: return
        // Lock order: the booking, then its payments (as cancellations and payment events do).
        BookingRepository.get(conn, business.id, refund.bookingId, forUpdate = true)
        val added = result?.let { payments.applyRefundResult(conn, business, refundId, it) } ?: 0
        val notice = (job.payload[NOTICE] as? JsonObject)?.let(::noticeOf)
        if (notice != null) {
            val refunded = PaymentRepository.get(conn, refundId)?.takeIf { it.status == "succeeded" }?.amountCents ?: 0
            send(conn, business.id, refund.bookingId, notice, refunded, pending = refunded == 0)
            // Sent once: a later attempt only sends a receipt, when it makes the refund.
            JobQueue.setPayload(conn, job.id, JsonObject(job.payload - NOTICE))
        } else if (added > 0) {
            Notify.booking(
                conn, NotificationKind.PAYMENT_REFUNDED, business.id, refund.bookingId, mapOf("amountCents" to added.toString()),
            )
        }
        if (added > 0) {
            Audit.record(
                conn, business.id, Actor.SYSTEM, "payment.refunded", "booking", refund.bookingId,
                mapOf("amountCents" to added, "attempt" to job.attempts),
            )
        }
    }

    private fun send(conn: Connection, businessId: UUID, bookingId: UUID, notice: RefundNotice, refunded: Int, pending: Boolean) {
        // A receipt says money was returned: none while the refund waits (a retry that makes it sends one then).
        if (notice.kind == NotificationKind.PAYMENT_REFUNDED && refunded == 0) return
        val fields = notice.extra + ("amountCents" to refunded.toString()) + (if (pending) mapOf("refundPending" to "true") else emptyMap())
        Notify.booking(conn, notice.kind, businessId, bookingId, fields)
    }

    private fun RefundNotice.toJson() = JsonObject(
        mapOf("kind" to JsonPrimitive(kind), "extra" to JsonObject(extra.mapValues { JsonPrimitive(it.value) })),
    )

    private fun noticeOf(json: JsonObject) = RefundNotice(
        json["kind"]!!.jsonPrimitive.content,
        json["extra"]?.jsonObject?.mapValues { it.value.jsonPrimitive.content }.orEmpty(),
    )

    private companion object {
        const val NOTICE = "notice"

        /** As many attempts as the retry job always had (about a day of backoff). */
        const val MAX_ATTEMPTS = 12

        /** When the worker runs a refund job whose after-commit run never happened (the process stopped). */
        val BACKSTOP: Duration = Duration.ofMinutes(1)
    }
}
