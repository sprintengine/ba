package ie.bookanything.booking

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.afterCommit
import ie.bookanything.db.savepoint
import ie.bookanything.http.ApiException
import ie.bookanything.http.Errors
import ie.bookanything.notifications.NotificationKind
import ie.bookanything.notifications.Notify
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.observability.AppMetrics
import ie.bookanything.observability.Telemetry
import ie.bookanything.payments.CancelActor
import ie.bookanything.payments.CheckoutExpiry
import ie.bookanything.payments.PaymentRepository
import ie.bookanything.payments.PaymentRow
import ie.bookanything.payments.PaymentStatus
import ie.bookanything.payments.RefundOverride
import ie.bookanything.payments.RefundPolicy
import ie.bookanything.services.ServiceRepository
import java.sql.Connection
import java.sql.SQLException
import java.time.Instant
import java.util.UUID

/**
 * State transitions after creation. All methods run inside the caller's (tenant-scoped) transaction; refunds they
 * decide reach the provider after it commits ([RefundSettlement]).
 */
class BookingLifecycle(private val engine: BookingEngine, private val refunds: RefundSettlement, private val inbox: Inbox) {
    val payments get() = engine.payments

    /**
     * Cancels and refunds per policy. The cancellation email states the refund (or, when the customer is not emailed
     * about the cancellation, a receipt does); either is sent once the provider has answered. The booking returned is as
     * cancelled in this transaction: its refunded amount is updated after the commit.
     */
    fun cancel(conn: Connection, business: BusinessRow, bookingId: UUID, cancellation: Cancellation, now: Instant): BookingRow =
        cancelAndRefund(conn, business, bookingId, cancellation, now) { b ->
            val wasHeldUnpaid = b.status == BookingStatus.HELD && b.amountPaidCents == 0
            if (cancellation.notifyCustomer && !wasHeldUnpaid) {
                RefundNotice(NotificationKind.BOOKING_CANCELLED)
            } else {
                RefundNotice(NotificationKind.PAYMENT_REFUNDED)
            }
        }

    /** Cancels and refunds per policy; [notice] picks the email that tells the customer ([RefundSettlement.request]). */
    private fun cancelAndRefund(
        conn: Connection, business: BusinessRow, bookingId: UUID, cancellation: Cancellation, now: Instant,
        notice: (BookingRow) -> RefundNotice,
    ): BookingRow {
        val by = cancellation.by
        val b = BookingRepository.get(conn, business.id, bookingId, forUpdate = true) ?: throw Errors.notFound("Booking")
        BookingSupport.requireBlockingStatus(b, BookingStatus.BLOCKING, "cancelled")
        if (by == CancelActor.CUSTOMER && !BookingViews.canCancel(b, business, now)) {
            throw Errors.policy("This booking can no longer be cancelled online. Please contact ${business.name}.")
        }
        BookingRepository.markCancelled(conn, business.id, b.id, by, cancellation.reason, now)
        AllocationRepository.release(conn, business.id, b.id)
        // A held booking's checkout could still be paid: it is closed at the provider after the commit (a job).
        PaymentRepository.cancelPendingCharges(conn, business.id, b.id).forEach { CheckoutExpiry.enqueue(conn, business.id, it) }
        if (b.paymentStatus == PaymentStatus.PENDING) BookingRepository.dropUnpaidPayment(conn, business.id, b.id)
        val decision = RefundPolicy.decide(
            by, now, b.start, business.policies.cancellationNoticeHours,
            business.policies.lateCancellationRefundPercent, b.amountPaidOnlineCents, b.amountRefundedCents, cancellation.refund,
        )
        val due = refunds.request(conn, business, b.id, decision.amountCents, notice(b))
        // A customer's cancellation is news to the team (not a checkout they abandoned: the team never heard of that one).
        if (by == CancelActor.CUSTOMER && b.status != BookingStatus.HELD) inbox.team(conn, business, b, Inbox.TeamEvent.CANCELLED)
        // What was refunded is recorded when the provider has made it (`payment.refunded`), not here.
        Audit.record(
            conn, business.id, cancellation.actor, "booking.cancelled", "booking", b.id,
            mapOf("by" to by.wire, "reason" to cancellation.reason, "refundDueCents" to due, "refundReason" to decision.reason),
        )
        return BookingRepository.get(conn, business.id, b.id)!!
    }

    fun approve(conn: Connection, business: BusinessRow, bookingId: UUID, actor: Actor, now: Instant): BookingRow {
        val b = BookingRepository.get(conn, business.id, bookingId, forUpdate = true) ?: throw Errors.notFound("Booking")
        BookingSupport.requireBlockingStatus(b, setOf(BookingStatus.PENDING_APPROVAL), "approved")
        if (!b.start.isAfter(now)) throw Errors.policy("This request's time has passed, so it can't be approved. Decline it instead.")
        BookingRepository.setStatus(conn, business.id, b.id, BookingStatus.CONFIRMED, now)
        Notify.booking(conn, NotificationKind.BOOKING_APPROVED, business.id, b.id)
        Audit.record(conn, business.id, actor, "booking.approved", "booking", b.id)
        return BookingRepository.get(conn, business.id, b.id)!!
    }

    fun decline(conn: Connection, business: BusinessRow, bookingId: UUID, actor: Actor, reason: String?, now: Instant): BookingRow {
        val b = BookingRepository.get(conn, business.id, bookingId, forUpdate = true) ?: throw Errors.notFound("Booking")
        BookingSupport.requireBlockingStatus(b, setOf(BookingStatus.PENDING_APPROVAL), "declined")
        // A paid request is refunded in full; the decline email says so once the provider has made the refund.
        cancelAndRefund(
            conn, business, bookingId, Cancellation(CancelActor.BUSINESS, actor, reason, RefundOverride.FULL, notifyCustomer = false), now,
        ) { RefundNotice(NotificationKind.BOOKING_DECLINED) }
        Audit.record(conn, business.id, actor, "booking.declined", "booking", b.id, mapOf("reason" to reason))
        return BookingRepository.get(conn, business.id, b.id)!!
    }

    /** Marks a booking completed or no-show ([BookingStatus.isOutcome]) once it has started. */
    fun setOutcome(
        conn: Connection, business: BusinessRow, bookingId: UUID, status: BookingStatus, actor: Actor, now: Instant,
    ): BookingRow {
        require(status.isOutcome) { "Not an outcome: $status" }
        val b = BookingRepository.get(conn, business.id, bookingId, forUpdate = true) ?: throw Errors.notFound("Booking")
        BookingSupport.requireBlockingStatus(
            b, setOf(BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW), "marked ${status.wire}",
        )
        if (b.start.isAfter(now)) throw Errors.policy("You can only mark a booking as ${status.label} once it has started.")
        BookingRepository.setStatus(conn, business.id, b.id, status, now)
        AllocationRepository.release(conn, business.id, b.id)
        Audit.record(conn, business.id, actor, "booking.${status.wire}", "booking", b.id, mapOf("previous" to b.status.wire))
        return BookingRepository.get(conn, business.id, b.id)!!
    }

    /**
     * Records that what is due at the venue (the price, or a deposit booking's balance) was paid in person: a settled
     * `in_person` charge in the ledger, counted in the amount paid but never refunded online.
     */
    fun markPaidInPerson(conn: Connection, business: BusinessRow, bookingId: UUID, actor: Actor, now: Instant): BookingRow {
        val b = BookingRepository.get(conn, business.id, bookingId, forUpdate = true) ?: throw Errors.notFound("Booking")
        BookingSupport.requireBlockingStatus(b, setOf(BookingStatus.CONFIRMED, BookingStatus.COMPLETED), "marked as paid")
        val due = b.priceCents - b.amountPaidCents
        if (b.paymentStatus !in PAYABLE_IN_PERSON || due <= 0) throw Errors.policy("Nothing is due at the venue for this booking.")
        PaymentRepository.insertInPersonCharge(conn, business.id, b.id, due, b.currency)
        BookingRepository.recordInPersonPayment(conn, business.id, b.id, due, now)
        Audit.record(conn, business.id, actor, "payment.received_in_person", "booking", b.id, mapOf("amountCents" to due))
        return BookingRepository.get(conn, business.id, b.id)!!
    }

    /**
     * A charge succeeded (the dev checkout, or Stripe's checkout.session.completed webhook). Confirms the held booking.
     * If the hold already expired and the slot was taken meanwhile, refunds in full and cancels.
     */
    fun paymentSucceeded(conn: Connection, business: BusinessRow, payment: PaymentRow, now: Instant): BookingRow {
        if (payment.kind != "charge") throw Errors.invalid("Not a charge.")
        val b = BookingRepository.get(conn, business.id, payment.bookingId, forUpdate = true) ?: throw Errors.notFound("Booking")
        // Read the payment again under the booking's lock: the caller's copy may predate a completion committed meanwhile.
        val current = PaymentRepository.get(conn, payment.id, forUpdate = true) ?: throw Errors.notFound("Payment")
        if (current.status == "succeeded") return b
        // "cancelled" is accepted too: the provider may confirm a payment after we released the hold.
        if (current.status != "pending" && current.status != "cancelled") throw Errors.policy("This payment is no longer pending.")
        PaymentRepository.setStatus(conn, payment.id, "succeeded")
        BookingRepository.recordPayment(conn, business.id, b.id, payment.amountCents, now)
        Audit.record(
            conn, business.id, Actor.SYSTEM, "payment.succeeded", "booking", b.id,
            mapOf("amountCents" to payment.amountCents, "provider" to payment.provider),
        )

        val nextStatus = statusOncePaid(conn, business.id, b)
        val stillHeld = b.status == BookingStatus.HELD
        val revived = if (!stillHeld && b.status == BookingStatus.EXPIRED) tryRevive(conn, business, b, now) else false
        if (stillHeld || revived) {
            BookingRepository.setStatus(conn, business.id, b.id, nextStatus, now, clearHold = true)
            val kind =
                if (nextStatus == BookingStatus.CONFIRMED) NotificationKind.BOOKING_CONFIRMED else NotificationKind.BOOKING_PENDING_APPROVAL
            Notify.booking(conn, kind, business.id, b.id)
            // The business made its own bookings, so it only hears about the customer's.
            if (b.source.byCustomer) Notify.booking(conn, NotificationKind.NEW_BOOKING_FOR_BUSINESS, business.id, b.id)
            Audit.record(conn, business.id, Actor.SYSTEM, "booking.${nextStatus.wire}", "booking", b.id)
            val outcome = if (stillHeld) AppMetrics.HoldOutcome.PAID else AppMetrics.HoldOutcome.PAID_AFTER_EXPIRY
            conn.afterCommit { Telemetry.metrics.holds(outcome) }
        } else {
            // Paid too late: the slot is gone (or the booking was cancelled). Refund in full.
            if (b.status == BookingStatus.EXPIRED) {
                BookingRepository.markCancelled(
                    conn, business.id, b.id, CancelActor.SYSTEM,
                    "Payment arrived after the hold expired and the time was no longer available.", now, clearHold = false,
                )
                conn.afterCommit { Telemetry.metrics.holds(AppMetrics.HoldOutcome.PAID_TOO_LATE) }
            }
            // The apology goes with the refund, once the provider has made it.
            val due = refunds.request(
                conn, business, b.id, payment.amountCents, RefundNotice(NotificationKind.PAYMENT_REFUNDED, mapOf("apology" to "true")),
            )
            Audit.record(conn, business.id, Actor.SYSTEM, "payment.refunded_late", "booking", b.id, mapOf("refundDueCents" to due))
        }
        return BookingRepository.get(conn, business.id, b.id)!!
    }

    fun paymentCancelled(conn: Connection, business: BusinessRow, payment: PaymentRow, now: Instant): BookingRow {
        val b = BookingRepository.get(conn, business.id, payment.bookingId, forUpdate = true) ?: throw Errors.notFound("Booking")
        if (payment.status == "pending") {
            PaymentRepository.setStatus(conn, payment.id, "cancelled")
        }
        if (b.status == BookingStatus.HELD) {
            BookingRepository.setStatus(conn, business.id, b.id, BookingStatus.EXPIRED, now, clearHold = true)
            AllocationRepository.release(conn, business.id, b.id)
            Audit.record(conn, business.id, Actor.SYSTEM, "booking.expired", "booking", b.id, mapOf("reason" to "checkout_cancelled"))
            conn.afterCommit { Telemetry.metrics.holds(AppMetrics.HoldOutcome.ABANDONED) }
        }
        return BookingRepository.get(conn, business.id, b.id)!!
    }

    /** As when booking ([NewBookingRules.initialStatus]): only the customer's own requests for approval-only services wait for approval. */
    private fun statusOncePaid(conn: Connection, businessId: UUID, b: BookingRow): BookingStatus {
        val needsApproval = b.source.byCustomer && ServiceRepository.get(conn, businessId, b.serviceId)?.requiresApproval == true
        return if (needsApproval) BookingStatus.PENDING_APPROVAL else BookingStatus.CONFIRMED
    }

    /** Re-activates an expired booking's allocations if its exact slot is still free. */
    private fun tryRevive(conn: Connection, business: BusinessRow, b: BookingRow, now: Instant): Boolean {
        if (b.start.isBefore(now)) return false
        val service = engine.loadService(conn, business.id, b.serviceId)
        val resourceIds = b.resourceIds
        AllocationRepository.lockResources(conn, business.id, resourceIds)
        BookingSupport.expireStaleHolds(conn, now, business.id, resourceIds)
        val check = SlotCheck.move(b, service, b.start, AvailabilityMode.STAFF, forcedResourceIds = resourceIds)
        val slot = engine.findSlot(conn, business, check, now) ?: return false
        return try {
            conn.savepoint {
                AllocationRepository.delete(conn, business.id, b.id)
                engine.insertAllocations(conn, business.id, b.id, service, slot)
            }
            true
        } catch (e: ApiException) { // The slot was taken meanwhile (exclusion constraint): the booking stays expired.
            if (e.code != "SLOT_UNAVAILABLE") throw e
            false
        } catch (_: SQLException) {
            false
        }
    }

    // ---- Periodic maintenance (run by the job worker leader, unscoped) ----

    /** Marks confirmed bookings that ended before [now] as completed. */
    fun autoComplete(conn: Connection, now: Instant): Int {
        val ids = BookingRepository.completeEnded(conn, now)
        if (ids.isNotEmpty()) {
            AllocationRepository.release(conn, ids.map { it.first })
            ids.forEach { (id, businessId) ->
                Audit.record(conn, businessId, Actor.SYSTEM, "booking.completed", "booking", id, mapOf("auto" to true))
            }
        }
        return ids.size
    }

    /** Enqueues 24h reminders once per booking (reminder_sent_at guards against repeats). */
    fun enqueueReminders(conn: Connection, now: Instant): Int {
        val due = BookingRepository.claimReminders(conn, now, now.plus(NewBookingRules.REMINDER_LEAD))
        due.forEach { (id, businessId) -> Notify.booking(conn, NotificationKind.BOOKING_REMINDER, businessId, id) }
        return due.size
    }

    fun expireHolds(conn: Connection, now: Instant): Int {
        val expired = BookingSupport.expireStaleHolds(conn, now)
        expired.forEach {
                (id, businessId) ->
            Audit.record(
                conn, businessId, Actor.SYSTEM, "booking.expired", "booking", id, mapOf("reason" to "hold_expired"),
            )
        }
        return expired.size
    }
}

/** Due at the venue, or a deposit paid online with the balance due there. */
private val PAYABLE_IN_PERSON = setOf(PaymentStatus.PAY_AT_VENUE, PaymentStatus.PAID)
