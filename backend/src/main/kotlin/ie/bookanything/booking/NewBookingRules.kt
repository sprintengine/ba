package ie.bookanything.booking

import ie.bookanything.notifications.NotificationKind
import ie.bookanything.payments.PaymentStatus
import java.time.Duration
import java.time.Instant

/** The pure decisions of creating a booking (docs/architecture.md section 5.2): payment, first status, hold, emails. */
object NewBookingRules {
    /** Reminders go out this long before a booking starts ([BookingLifecycle.enqueueReminders]). */
    val REMINDER_LEAD: Duration = Duration.ofHours(24)

    /**
     * What is charged online now, or null when nothing is: [PaymentChoice.AUTO] follows the service (online payment
     * services), [PaymentChoice.ONLINE] is the staff "collect online" choice; free bookings are never charged.
     */
    fun onlineAmount(choice: PaymentChoice, serviceNeedsOnlinePayment: Boolean, quote: BookingQuote): Int? = when (choice) {
        PaymentChoice.AUTO -> quote.dueNowCents.takeIf { serviceNeedsOnlinePayment && quote.priceCents > 0 }
        PaymentChoice.ONLINE -> quote.dueNowCents.takeIf { quote.priceCents > 0 }
        PaymentChoice.AT_VENUE, PaymentChoice.NONE -> null
    }

    /** The booking's payment status: pending online, pay at the venue, or nothing to pay. */
    fun paymentStatus(choice: PaymentChoice, onlineAmount: Int?, quote: BookingQuote): PaymentStatus = when {
        onlineAmount != null -> PaymentStatus.PENDING
        quote.priceCents > 0 && (choice == PaymentChoice.AT_VENUE || (choice == PaymentChoice.AUTO && quote.paymentMode == "at_venue")) ->
            PaymentStatus.PAY_AT_VENUE
        else -> PaymentStatus.NOT_REQUIRED
    }

    /** The deposit stored on the booking: the online amount of a deposit service, else none. */
    fun depositCents(quote: BookingQuote, onlineAmount: Int?): Int? = onlineAmount.takeIf { quote.paymentMode == "deposit" }

    /** Held until paid when paying online; public requests for approval-only services wait for approval; else confirmed. */
    fun initialStatus(paysOnline: Boolean, public: Boolean, requiresApproval: Boolean): BookingStatus = when {
        paysOnline -> BookingStatus.HELD
        public && requiresApproval -> BookingStatus.PENDING_APPROVAL
        else -> BookingStatus.CONFIRMED
    }

    /** When a held booking's hold ends: after [holdMinutes] (null for other statuses). */
    fun holdExpiry(status: BookingStatus, now: Instant, holdMinutes: Int): Instant? =
        if (status == BookingStatus.HELD) now.plus(Duration.ofMinutes(holdMinutes.toLong())) else null

    /**
     * The reminder time stored on a booking starting at [start] when it is booked or moved at [now]: when the customer
     * was just emailed about it ([customerEmailed]) and it starts within [REMINDER_LEAD], that email does the reminder's
     * job, so the reminder counts as sent; otherwise null, and the reminder goes out [REMINDER_LEAD] ahead.
     */
    fun reminderSentAt(start: Instant, now: Instant, customerEmailed: Boolean): Instant? =
        now.takeIf { customerEmailed && start.isBefore(now.plus(REMINDER_LEAD)) }

    /**
     * What the client does next (`NextStep.type`): pay, wait for approval, or nothing. A replayed request (same
     * Idempotency-Key) whose booking has since expired unpaid or been cancelled says so: there is nothing to pay or
     * wait for, and booking again needs a new request.
     */
    fun nextStep(status: BookingStatus): String = when (status) {
        BookingStatus.HELD -> "payment_required"
        BookingStatus.PENDING_APPROVAL -> "pending_approval"
        BookingStatus.EXPIRED -> "expired"
        BookingStatus.CANCELLED -> "cancelled"
        BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW -> "confirmed"
    }

    /**
     * The emails a new booking sends, in order: the customer's (when [notifyCustomer]) and, for bookings the customer
     * made themselves ([public]) or that wait for approval, the business's. A held public booking emails nothing until
     * it is paid; a held staff booking emails the payment link.
     */
    fun notifications(status: BookingStatus, public: Boolean, notifyCustomer: Boolean): List<String> = when (status) {
        BookingStatus.HELD -> listOfNotNull(NotificationKind.PAYMENT_REQUESTED.takeIf { !public && notifyCustomer })
        BookingStatus.CONFIRMED -> listOfNotNull(
            NotificationKind.BOOKING_CONFIRMED.takeIf { notifyCustomer },
            NotificationKind.NEW_BOOKING_FOR_BUSINESS.takeIf { public },
        )
        BookingStatus.PENDING_APPROVAL -> listOf(NotificationKind.BOOKING_PENDING_APPROVAL, NotificationKind.NEW_BOOKING_FOR_BUSINESS)
        else -> emptyList()
    }
}
