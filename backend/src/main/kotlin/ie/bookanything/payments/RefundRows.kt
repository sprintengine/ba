package ie.bookanything.payments

import ie.bookanything.db.queryOne
import ie.bookanything.db.update
import java.sql.Connection
import java.time.Instant

/** The ledger's refunds as the provider reports on them (`refund.updated`, `charge.refunded`). */
object RefundRows {
    /** Our refund the provider knows as [providerRef]. */
    fun byProviderRef(conn: Connection, provider: String, providerRef: String): PaymentRow? = conn.queryOne(
        "SELECT ${PaymentRepository.COLS} FROM payments WHERE provider = ? AND provider_ref = ? AND kind = 'refund' " +
            "ORDER BY created_at DESC LIMIT 1",
        provider, providerRef, map = PaymentRepository::map,
    )

    /** Whether refund [refundId] was recorded more than 23 hours ago (by the database's clock), inside Stripe's day. */
    fun outlivedIdempotency(conn: Connection, refundId: java.util.UUID): Boolean = conn.queryOne(
        "SELECT created_at < now() - interval '23 hours' FROM payments WHERE id = ?", refundId,
    ) { it.getBoolean(1) } ?: false

    /**
     * How much of [charge]'s booking was refunded at Stripe (the refund has Stripe's id) and failed at or after [since]:
     * a total Stripe reported before then still counts it.
     */
    fun failedAmountSince(conn: Connection, charge: PaymentRow, since: Instant): Int = conn.queryOne(
        "SELECT COALESCE(sum(amount_cents), 0)::int FROM payments WHERE business_id = ? AND booking_id = ? AND kind = 'refund' " +
            // Stripe's `created` is whole seconds, and its clock isn't ours: a refund recorded up to a minute later counts.
            "AND status = 'failed' AND provider_ref IS NOT NULL AND updated_at >= ? AND created_at <= ? + interval '1 minute'",
        charge.businessId, charge.bookingId, since, since,
    ) { it.getInt(1) } ?: 0

    /**
     * The refund recorded for one of [amountCents] made outside bookanything (the Stripe dashboard), now known as
     * [providerRef] so later reports about it find it. `charge.refunded` records such refunds by the difference in
     * Stripe's total, so one row may stand for several: the latest of exactly that amount, else one larger, from which
     * [amountCents] is split off into its own row. Null when none covers it. Call under the booking's lock.
     */
    fun claimExternal(conn: Connection, charge: PaymentRow, amountCents: Int, providerRef: String): PaymentRow? {
        val row = conn.queryOne(
            "SELECT ${PaymentRepository.COLS} FROM payments WHERE business_id = ? AND booking_id = ? AND kind = 'refund' " +
                "AND status = 'succeeded' AND provider_ref LIKE 'external:%' AND amount_cents >= ? " +
                "ORDER BY amount_cents = ? DESC, created_at DESC LIMIT 1 FOR UPDATE",
            charge.businessId, charge.bookingId, amountCents, amountCents, map = PaymentRepository::map,
        ) ?: return null
        if (row.amountCents == amountCents) {
            conn.update("UPDATE payments SET provider_ref = ?, updated_at = now() WHERE id = ?", providerRef, row.id)
            return row.copy(providerRef = providerRef)
        }
        conn.update("UPDATE payments SET amount_cents = amount_cents - ?, updated_at = now() WHERE id = ?", amountCents, row.id)
        return conn.queryOne(
            """
            INSERT INTO payments (business_id, booking_id, provider, kind, provider_ref, amount_cents, currency, status, provider_account)
            VALUES (?, ?, ?, 'refund', ?, ?, ?, 'succeeded', ?) RETURNING ${PaymentRepository.COLS}
            """.trimIndent(),
            row.businessId, row.bookingId, row.provider, providerRef, amountCents, row.currency, row.providerAccount,
            map = PaymentRepository::map,
        )
    }
}
