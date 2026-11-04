package ie.bookanything.booking

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.Db
import ie.bookanything.db.afterCommit
import ie.bookanything.db.queryOne
import ie.bookanything.jobs.Job
import ie.bookanything.jobs.JobHandler
import ie.bookanything.jobs.JobQueue
import ie.bookanything.jobs.JobRunner
import ie.bookanything.notifications.NotificationKind
import ie.bookanything.notifications.Notify
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.observability.Telemetry
import ie.bookanything.payments.Money
import ie.bookanything.payments.PaymentRepository
import ie.bookanything.payments.PaymentRow
import ie.bookanything.payments.PaymentService
import ie.bookanything.payments.RefundOutcome
import ie.bookanything.payments.RefundResult
import ie.bookanything.payments.RefundToSend
import ie.bookanything.payments.StripeRefusedException
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.time.Duration
import java.util.Locale
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
 * stopped first ([BACKSTOP] later), and retries it with backoff while the provider is unreachable (about a day). The
 * customer's email about the refund goes with the provider's answer, so it says what happened: "a refund of €X is on
 * its way"; "being processed" while the provider is unreachable, followed by a receipt once a retry makes it; or, when
 * the provider declined it, that the business will arrange it, as they are told ([failed]). A refund the provider
 * accepted and later reports failed ends the same way (`refund.updated`).
 */
class RefundSettlement(private val db: Db, private val payments: PaymentService, private val inbox: Inbox) {
    private val log = LoggerFactory.getLogger(RefundSettlement::class.java)

    /**
     * Records a refund of [amountCents] of the booking's online charge and queues it for the provider; [notice] is
     * queued once the provider has answered, or now when there is nothing to refund. Returns the amount being refunded
     * (0 when nothing was paid online).
     */
    fun request(conn: Connection, business: BusinessRow, bookingId: UUID, amountCents: Int, notice: RefundNotice?): Int {
        val refundId = payments.recordRefund(conn, business, bookingId, amountCents)
        if (refundId == null) {
            notice?.let { send(conn, business.id, bookingId, it, amountCents = 0, NoticeState.REFUNDED) }
            return 0
        }
        val payload = buildMap {
            put(REFUND_ID, JsonPrimitive(refundId.toString()))
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
     * The provider's answer about a refund. [certain]: a failure we know left the money with the business (the provider
     * declined it); else we can't tell (unreachable to the end, or it says the charge was refunded already), so the
     * owners are asked to check before refunding and the customer isn't told it failed.
     */
    private data class Answer(val result: RefundResult, val certain: Boolean = true)

    /** What sending a refund came to: an [answer] (null while the provider is unreachable, with its [error]). */
    private data class Sent(val answer: Answer?, val error: Exception? = null)

    /**
     * The `payment_refund_retry` job: sends the refund to the provider outside any transaction, then records the answer
     * and sends the notice in a short one. Throws while the provider is unreachable, so the job is retried, until the
     * last attempt.
     */
    fun handle(job: Job) {
        val refundId = UUID.fromString(job.payload[REFUND_ID]!!.jsonPrimitive.content)
        val businessId = UUID.fromString(job.payload["businessId"]!!.jsonPrimitive.content)
        val (business, toSend) = db.txBlocking(businessId) { conn ->
            BusinessRepository.findById(conn, businessId)?.let { it to payments.refundToSend(conn, it, refundId) }
        } ?: return
        val sent = when {
            toSend == null -> null
            // Nothing paid online to return it from any more.
            toSend.charge == null -> Sent(Answer(RefundResult(null, RefundOutcome.FAILED, "charge_missing")))
            // Past Stripe's day of idempotency, a retry could refund twice: stop without sending.
            toSend.tooOld && job.attempts > 1 -> Sent(Answer(RefundResult(null, RefundOutcome.FAILED, "out_of_time"), certain = false))
            else -> send(business, toSend, finalAttempt = job.attempts >= job.maxAttempts || toSend.tooOld)
        }
        if (sent?.answer?.result?.outcome == RefundOutcome.FAILED || sent?.error != null) Telemetry.metrics.refundFailed()
        // Given up while unreachable: the job ends done, so the error is reported here.
        if (sent?.answer != null && sent.error != null && sent.error !is StripeRefusedException) {
            Telemetry.errors.capture(sent.error, mapOf("job" to PaymentService.REFUND_RETRY_JOB, "refund" to refundId.toString()))
        }
        db.txBlocking(businessId) { conn -> settle(conn, business, job, refundId, sent?.answer) }
        // The job retries; the provider's error is the cause, for the report once retries run out.
        if (sent != null && sent.answer == null) throw IllegalStateException("refund $refundId failed at the provider", sent.error)
    }

    /** Provider boundary: no answer while it is unreachable (retried, unless this is the [finalAttempt]). */
    private fun send(business: BusinessRow, toSend: RefundToSend, finalAttempt: Boolean): Sent = try {
        Sent(Answer(payments.sendRefund(business, toSend)))
    } catch (e: StripeRefusedException) {
        log.warn("refund {} for booking {} refused by the provider ({})", toSend.refund.id, toSend.refund.bookingId, e.stripeCode)
        Sent(Answer(RefundResult(null, RefundOutcome.FAILED, e.stripeCode), certain = e.stripeCode !in ALREADY_REFUNDED), e)
    } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Unreachable: retried while attempts last.
        log.warn("refund {} for booking {} failed, will retry: {}", toSend.refund.id, toSend.refund.bookingId, e.message)
        val giveUp = Answer(RefundResult(null, RefundOutcome.FAILED, "provider_unreachable"), certain = false)
        Sent(if (finalAttempt) giveUp else null, e)
    }

    /**
     * Records the provider's [answer] (null: unreachable, to retry, or nothing to send) and tells the customer: the
     * notice on the first attempt, saying what happened, then a receipt when a later attempt makes the refund, or that
     * the business will arrange it when it was declined.
     */
    private fun settle(conn: Connection, business: BusinessRow, job: Job, refundId: UUID, answer: Answer?) {
        // Lock order: the booking, then its payments (as cancellations and payment events do).
        val bookingId = PaymentRepository.get(conn, refundId)?.bookingId ?: return
        BookingRepository.get(conn, business.id, bookingId, forUpdate = true)
        val before = PaymentRepository.get(conn, refundId) ?: return
        val added = answer?.let { payments.applyRefundResult(conn, business, refundId, it.result) } ?: 0
        val notice = (job.payload[NOTICE] as? JsonObject)?.let(::noticeOf)
        val now = PaymentRepository.get(conn, refundId) ?: return
        // This answer is the one that failed it (a `refund.updated` that did already handled it).
        if (answer?.result?.outcome == RefundOutcome.FAILED && before.status == "pending" && now.status == "failed") {
            failed(conn, business, now, answer.result.failureReason, answer.certain, tellCustomer = notice == null)
        }
        if (notice != null) {
            send(conn, business.id, bookingId, notice, now.amountCents, noticeState(now, certain = answer?.certain ?: true))
            // Sent once: a later attempt only sends a receipt, when it makes the refund.
            JobQueue.setPayload(conn, job.id, JsonObject(job.payload - NOTICE))
        } else if (added > 0) {
            Notify.booking(conn, NotificationKind.PAYMENT_REFUNDED, business.id, bookingId, mapOf("amountCents" to added.toString()))
        }
        if (added > 0) {
            Audit.record(
                conn, business.id, Actor.SYSTEM, "payment.refunded", "booking", bookingId,
                mapOf("amountCents" to added, "attempt" to job.attempts),
            )
        }
    }

    /**
     * The refund [refund] failed for good ([reason], when known): recorded, taken off the booking's refunded total,
     * audited, and the business's owners are told: to refund the customer another way when it is [certain], else to
     * check in their Stripe dashboard whether it went through first (if it did, its `charge.refunded` records it and the
     * customer gets a receipt). [tellCustomer]: they were already told the refund was coming, so they hear it didn't,
     * or that it is being checked (otherwise the notice going out with this answer says so).
     */
    fun failed(conn: Connection, business: BusinessRow, refund: PaymentRow, reason: String?, certain: Boolean, tellCustomer: Boolean) {
        if (refund.status != "failed") PaymentRepository.setStatus(conn, refund.id, "failed")
        PaymentRepository.recomputeRefunded(conn, business.id, refund.bookingId)
        Audit.record(
            conn, business.id, Actor.SYSTEM, "payment.refund_failed", "booking", refund.bookingId,
            mapOf("amountCents" to refund.amountCents, "reason" to reason, "refund" to refund.providerRef, "certain" to certain),
        )
        val booking = BookingRepository.get(conn, business.id, refund.bookingId)
        val amount = Money.format(refund.amountCents, refund.currency, Locale.forLanguageTag(business.locale))
        val whose = "${booking?.customer?.name ?: "a customer"}'s booking"
        val why = reason?.let { " (Stripe: ${it.replace('_', ' ')})" }.orEmpty()
        val (title, body) = if (certain) {
            "A refund couldn't be made" to "$amount for $whose couldn't be refunded automatically$why. Please refund them " +
                "another way, for example from your Stripe dashboard or by bank transfer."
        } else {
            "A refund needs checking" to "Stripe couldn't confirm the refund of $amount for $whose$why. Check the payment " +
                "in your Stripe dashboard: if it wasn't refunded, refund it there or another way."
        }
        inbox.paymentsAlert(
            conn, business, title, body, "refund-failed:${refund.id}:${if (certain) "certain" else "unsure"}",
            link = "/dashboard/${business.slug}/bookings?booking=${refund.bookingId}",
        )
        conn.afterCommit { Telemetry.metrics.refundGivenUp(certain) }
        if (tellCustomer) {
            Notify.booking(
                conn, NotificationKind.PAYMENT_REFUND_FAILED, business.id, refund.bookingId,
                mapOf("amountCents" to refund.amountCents.toString()) + (if (certain) emptyMap() else mapOf("refundChecking" to "true")),
            )
        }
    }

    /**
     * Whether the customer's notice about [refundId] is still to be sent (its job has not had the provider's answer).
     * Read under the booking's lock, which [settle] holds while it sends the notice.
     */
    fun noticePending(conn: Connection, refundId: UUID): Boolean = conn.queryOne(
        "SELECT EXISTS (SELECT 1 FROM jobs WHERE kind = ? AND payload->>'$REFUND_ID' = ? AND payload->'$NOTICE' IS NOT NULL " +
            "AND status IN ('pending', 'running'))",
        PaymentService.REFUND_RETRY_JOB, refundId.toString(),
    ) { it.getBoolean(1) } ?: false

    /**
     * What the customer is told about a refund in the notice: made, still on its way, failed (the business arranges
     * it), or being checked (we can't tell whether Stripe made it; the business looks into it).
     */
    private enum class NoticeState { REFUNDED, PENDING, FAILED, CHECKING }

    /** The notice's state for [refund] as it now is; a failure we can't be [certain] of is being checked. */
    private fun noticeState(refund: PaymentRow, certain: Boolean) = when {
        refund.status == "succeeded" -> NoticeState.REFUNDED
        refund.status == "failed" -> if (certain) NoticeState.FAILED else NoticeState.CHECKING
        else -> NoticeState.PENDING
    }

    /**
     * Sends [notice] about a refund of [amountCents] in [state] (0 and [NoticeState.REFUNDED]: there was nothing to
     * refund). The notice's `amountCents` is what was refunded, so 0 unless it was made.
     */
    private fun send(conn: Connection, businessId: UUID, bookingId: UUID, notice: RefundNotice, amountCents: Int, state: NoticeState) {
        val refunded = if (state == NoticeState.REFUNDED) amountCents else 0
        if (notice.kind == NotificationKind.PAYMENT_REFUNDED) {
            // A receipt says money was returned: none while the refund waits (a retry that makes it sends one then), and
            // a failed one gets the email saying the business will arrange it instead.
            if (state == NoticeState.FAILED || state == NoticeState.CHECKING) {
                val checking = if (state == NoticeState.CHECKING) mapOf("refundChecking" to "true") else emptyMap()
                Notify.booking(
                    conn, NotificationKind.PAYMENT_REFUND_FAILED, businessId, bookingId,
                    notice.extra + ("amountCents" to amountCents.toString()) + checking,
                )
            }
            if (refunded == 0) return
        }
        val fields = notice.extra + ("amountCents" to refunded.toString()) + when (state) {
            NoticeState.PENDING -> mapOf("refundPending" to "true")
            NoticeState.FAILED -> mapOf("refundFailed" to "true")
            NoticeState.CHECKING -> mapOf("refundChecking" to "true")
            NoticeState.REFUNDED -> emptyMap()
        }
        Notify.booking(conn, notice.kind, businessId, bookingId, fields)
    }

    private fun RefundNotice.toJson() = JsonObject(
        mapOf("kind" to JsonPrimitive(kind), "extra" to JsonObject(extra.mapValues { JsonPrimitive(it.value) })),
    )

    private fun noticeOf(json: JsonObject) = RefundNotice(
        json["kind"]!!.jsonPrimitive.content,
        json["extra"]?.jsonObject?.mapValues { it.value.jsonPrimitive.content }.orEmpty(),
    )

    companion object {
        private const val NOTICE = "notice"
        private const val REFUND_ID = "refundPaymentId"

        /**
         * About a day of attempts with the queue's backoff (10 s doubling, then hourly): inside Stripe's 24 hours of
         * idempotency, so a retry never refunds twice.
         */
        private const val MAX_ATTEMPTS = 30

        /** When the worker runs a refund job whose after-commit run never happened (the process stopped). */
        private val BACKSTOP: Duration = Duration.ofMinutes(1)

        /** Stripe refusing because the charge was refunded already (from its dashboard, say): not a refund that failed. */
        val ALREADY_REFUNDED = setOf("charge_already_refunded", "amount_too_large")
    }
}
