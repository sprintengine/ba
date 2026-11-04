package ie.bookanything.booking

import ie.bookanything.db.update
import ie.bookanything.payments.PaymentStatus
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/** A booking held for online payment: how long it is held, and what it shows once it ended unpaid. */
object BookingHolds {
    /** Keeps a held booking until at least [until] (its checkout closes then). */
    fun extendHold(conn: Connection, businessId: UUID, id: UUID, until: Instant) {
        conn.update(
            "UPDATE bookings SET hold_expires_at = ?, updated_at = now() WHERE business_id = ? AND id = ? AND status = 'held' " +
                "AND hold_expires_at < ?",
            until, businessId, id, until,
        )
    }

    /** Sets what an unpaid booking (nothing paid at all) shows about its payment: nothing owed, or one that failed. */
    fun setUnpaidStatus(conn: Connection, businessId: UUID, id: UUID, status: PaymentStatus) {
        conn.update(
            "UPDATE bookings SET payment_status = ?::payment_status, updated_at = now() WHERE business_id = ? AND id = ? " +
                "AND amount_paid_cents = 0",
            status.wire, businessId, id,
        )
    }
}
