package ie.bookanything.payments

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** What a booking owes or has paid (the booking's `paymentStatus`, not a payment record's). Serialised as its [wire] value. */
@Serializable
enum class PaymentStatus {
    /** Nothing to pay (free, staff chose no payment, or a hold that ended unpaid and owes nothing any more). */
    @SerialName("not_required")
    NOT_REQUIRED,

    /** Waiting for online payment. */
    @SerialName("pending")
    PENDING,

    @SerialName("paid")
    PAID,

    @SerialName("partially_refunded")
    PARTIALLY_REFUNDED,

    @SerialName("refunded")
    REFUNDED,

    /** The online payment failed (a delayed payment such as a bank debit was declined); the hold was released. */
    @SerialName("failed")
    FAILED,

    /** Paid in person at the appointment. */
    @SerialName("pay_at_venue")
    PAY_AT_VENUE,
    ;

    /** The `payment_status` database value and the JSON value. */
    val wire: String get() = name.lowercase()

    companion object {
        fun parse(wire: String): PaymentStatus = entries.first { it.wire == wire }
    }
}
