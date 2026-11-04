package ie.bookanything.booking

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Where a booking is in its life (docs/architecture.md section 5.2). Serialised as its [wire] value. */
@Serializable
enum class BookingStatus {
    /** Waiting for online payment until its hold expires. */
    @SerialName("held")
    HELD,

    /** A customer's request for an approval-only service, waiting for the business. */
    @SerialName("pending_approval")
    PENDING_APPROVAL,

    @SerialName("confirmed")
    CONFIRMED,

    @SerialName("completed")
    COMPLETED,

    @SerialName("cancelled")
    CANCELLED,

    @SerialName("no_show")
    NO_SHOW,

    /** A hold that ran out unpaid (a late payment may still revive it). */
    @SerialName("expired")
    EXPIRED,
    ;

    /** The `booking_status` database value and the JSON value. */
    val wire: String get() = name.lowercase()

    /** For messages: "pending approval". */
    val label: String get() = wire.replace('_', ' ')

    /** Still holds its time: it can be cancelled and counts as upcoming. */
    val isBlocking: Boolean get() = this in BLOCKING

    /** A booking that has started may be marked with one of these. */
    val isOutcome: Boolean get() = this == COMPLETED || this == NO_SHOW

    companion object {
        /** Statuses that hold their time: held, pending approval, confirmed. */
        val BLOCKING: Set<BookingStatus> = setOf(HELD, PENDING_APPROVAL, CONFIRMED)

        /** Statuses a booking can be rescheduled from. */
        val MOVABLE: Set<BookingStatus> = setOf(PENDING_APPROVAL, CONFIRMED)

        /** Statuses of a booking that has happened: an outcome was recorded. */
        val HAPPENED: Set<BookingStatus> = setOf(COMPLETED, NO_SHOW)

        /** Statuses that use up an offer redemption: every booking that wasn't cancelled and didn't expire unpaid. */
        val REDEEMING: Set<BookingStatus> = BLOCKING + HAPPENED

        /** `column IN (...)` over [statuses], for SQL. */
        fun sqlIn(column: String, statuses: Set<BookingStatus>): String = ie.bookanything.db.sqlIn(column, statuses.map { it.wire })

        fun parse(wire: String): BookingStatus = entries.first { it.wire == wire }

        /** The status named by [wire], or null when it names none (client input). */
        fun parseOrNull(wire: String): BookingStatus? = entries.firstOrNull { it.wire == wire }
    }
}
