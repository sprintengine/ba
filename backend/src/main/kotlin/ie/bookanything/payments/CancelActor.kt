package ie.bookanything.payments

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Who cancelled a booking: decides the refund ([RefundPolicy]) and is stored as the booking's `cancelledBy`. */
@Serializable
enum class CancelActor {
    @SerialName("customer")
    CUSTOMER,

    @SerialName("business")
    BUSINESS,

    /** A late payment for a booking whose time was taken. */
    @SerialName("system")
    SYSTEM,
    ;

    /** The `cancelled_by` database value and the JSON value. */
    val wire: String get() = name.lowercase()

    companion object {
        fun parse(wire: String): CancelActor = entries.first { it.wire == wire }
    }
}
