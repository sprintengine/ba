package ie.bookanything.payments

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** What a booking owes or has paid (the booking's `paymentStatus`, not a payment record's). Serialised as its [wire] value. */
@Serializable
enum class PaymentStatus {
    /** Nothing to pay (free, or staff chose no payment). */
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

    /** In the database type but never set today: a failed checkout cancels its payment record and the booking's hold expires. */
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
