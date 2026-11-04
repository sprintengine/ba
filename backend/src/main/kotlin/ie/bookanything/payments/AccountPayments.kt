package ie.bookanything.payments

import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/**
 * The payment ledger by provider account (`payments.provider_account`): what still needs an account reachable before it
 * is disconnected or deauthorized (ConnectExisting).
 */
object AccountPayments {
    /** The business's charges on [account] still waiting for payment at a hosted checkout. */
    fun openCheckouts(conn: Connection, businessId: UUID, provider: String, account: String): List<PaymentRow> = conn.query(
        "SELECT ${PaymentRepository.COLS} FROM payments " +
            "WHERE business_id = ? AND provider = ? AND provider_account = ? AND kind = 'charge' " +
            "AND status = 'pending' AND provider_ref IS NOT NULL",
        businessId, provider, account, map = PaymentRepository::map,
    )

    /**
     * Whether money on [account] may still need it reachable, for any business but [exceptBusiness]: a refund waiting
     * to be sent or settled, a checkout a customer may still pay, or an upcoming booking paid there that a cancellation
     * would refund. Read without a business scope (all businesses).
     */
    fun accountHasOpenPayments(conn: Connection, account: String, now: Instant, exceptBusiness: UUID?): Boolean = conn.queryOne(
        """
        SELECT EXISTS (
            SELECT 1 FROM payments p
            WHERE p.provider_account = ? AND p.business_id IS DISTINCT FROM ?
              AND p.status = 'pending' AND (p.kind = 'refund' OR p.provider_ref IS NOT NULL)
        ) OR EXISTS (
            SELECT 1 FROM payments p JOIN bookings b ON b.business_id = p.business_id AND b.id = p.booking_id
            WHERE p.provider_account = ? AND p.business_id IS DISTINCT FROM ? AND p.kind = 'charge' AND p.status = 'succeeded'
              AND b.status IN ('held', 'pending_approval', 'confirmed') AND b.start_at > ?
              AND b.amount_refunded_cents < b.amount_paid_cents
        )
        """.trimIndent(),
        account, exceptBusiness, account, exceptBusiness, now,
    ) { it.getBoolean(1) } ?: false

    /** The business's refunds on [account] not yet sent or settled. */
    fun pendingRefunds(conn: Connection, businessId: UUID, account: String): Int = conn.queryOne(
        "SELECT count(*)::int FROM payments WHERE business_id = ? AND provider_account = ? AND kind = 'refund' AND status = 'pending'",
        businessId, account,
    ) { it.getInt(1) } ?: 0

    /**
     * Upcoming bookings (held, waiting for approval or confirmed) paid online on [account] and not fully refunded: a
     * cancellation would refund them there.
     */
    fun refundableUpcoming(conn: Connection, businessId: UUID, account: String, now: Instant): Int = conn.queryOne(
        """
        SELECT count(DISTINCT b.id)::int FROM bookings b JOIN payments p ON p.business_id = b.business_id AND p.booking_id = b.id
        WHERE b.business_id = ? AND b.status IN ('held', 'pending_approval', 'confirmed') AND b.start_at > ?
          AND b.amount_refunded_cents < b.amount_paid_cents
          AND p.kind = 'charge' AND p.status = 'succeeded' AND p.provider_account = ?
        """.trimIndent(),
        businessId, now, account,
    ) { it.getInt(1) } ?: 0
}
