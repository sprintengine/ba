package ie.bookanything.payments

import ie.bookanything.db.UuidArray
import ie.bookanything.db.instant
import ie.bookanything.db.int
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

/** SQL of the payment ledger: the per-booking, append-only list of charges and refunds, and the booking totals it sets. */
object PaymentRepository {
    /** The provider of payments taken in person by staff: already settled, never sent back online. */
    const val IN_PERSON = "in_person"

    internal const val COLS = "id, business_id, booking_id, provider, kind::text AS kind, provider_ref, checkout_url, return_url, " +
        "amount_cents, currency, status::text AS status, created_at, provider_account"

    internal fun map(rs: ResultSet) = PaymentRow(
        id = rs.uuid("id"), businessId = rs.uuid("business_id"), bookingId = rs.uuid("booking_id"), provider = rs.str("provider"),
        kind = rs.str("kind"), providerRef = rs.strOrNull("provider_ref"), checkoutUrl = rs.strOrNull("checkout_url"),
        returnUrl = rs.strOrNull("return_url"), amountCents = rs.int("amount_cents"), currency = rs.str("currency").trim(),
        status = rs.str("status"), createdAt = rs.instant("created_at"), providerAccount = rs.strOrNull("provider_account"),
    )

    fun forBooking(conn: Connection, businessId: UUID, bookingId: UUID): List<PaymentRow> = conn.query(
        "SELECT $COLS FROM payments WHERE business_id = ? AND booking_id = ? ORDER BY created_at, id", businessId, bookingId, map = ::map,
    )

    fun get(conn: Connection, paymentId: UUID, forUpdate: Boolean = false): PaymentRow? =
        conn.queryOne("SELECT $COLS FROM payments WHERE id = ?${if (forUpdate) " FOR UPDATE" else ""}", paymentId, map = ::map)

    /** The latest charge still waiting for the customer to pay. */
    fun pendingCharge(conn: Connection, businessId: UUID, bookingId: UUID): PaymentRow? =
        latestCharge(conn, businessId, bookingId, "pending")

    /** The latest charge paid online (what refunds go back to: money taken in person can't be returned online). */
    fun succeededCharge(conn: Connection, businessId: UUID, bookingId: UUID): PaymentRow? =
        latestCharge(conn, businessId, bookingId, "succeeded")

    private fun latestCharge(conn: Connection, businessId: UUID, bookingId: UUID, status: String): PaymentRow? = conn.queryOne(
        "SELECT $COLS FROM payments WHERE business_id = ? AND booking_id = ? AND kind = 'charge' AND status = ?::payment_record_status " +
            "AND provider <> '$IN_PERSON' ORDER BY created_at DESC LIMIT 1",
        businessId, bookingId, status, map = ::map,
    )

    /** Records money staff took in person: a charge that has already succeeded, with no provider behind it. */
    fun insertInPersonCharge(conn: Connection, businessId: UUID, bookingId: UUID, amountCents: Int, currency: String) {
        conn.update(
            """
            INSERT INTO payments (business_id, booking_id, provider, kind, amount_cents, currency, status)
            VALUES (?, ?, '$IN_PERSON', 'charge', ?, ?, 'succeeded')
            """.trimIndent(),
            businessId, bookingId, amountCents, currency,
        )
    }

    /** The charge whose provider reference is [providerRef] (Stripe: the Checkout Session, then the PaymentIntent). */
    fun chargeByProviderRef(conn: Connection, provider: String, providerRef: String): PaymentRow? = conn.queryOne(
        "SELECT $COLS FROM payments WHERE provider = ? AND provider_ref = ? AND kind = 'charge' ORDER BY created_at DESC LIMIT 1",
        provider, providerRef, map = ::map,
    )

    /** Records a pending charge; its checkout is attached with [setCheckout]. */
    fun insertCharge(
        conn: Connection, businessId: UUID, bookingId: UUID, provider: String, amountCents: Int, currency: String, returnUrl: String?,
        providerAccount: String? = null,
    ): UUID = conn.queryOne(
        """
        INSERT INTO payments (business_id, booking_id, provider, kind, amount_cents, currency, status, return_url, provider_account)
        VALUES (?, ?, ?, 'charge', ?, ?, 'pending', ?, ?) RETURNING id
        """.trimIndent(),
        businessId, bookingId, provider, amountCents, currency, returnUrl, providerAccount,
    ) { it.uuid("id") }!!

    fun setCheckout(conn: Connection, paymentId: UUID, providerRef: String, checkoutUrl: String) {
        conn.update(
            "UPDATE payments SET provider_ref = ?, checkout_url = ?, updated_at = now() WHERE id = ?", providerRef, checkoutUrl, paymentId,
        )
    }

    fun setProviderRef(conn: Connection, paymentId: UUID, providerRef: String) {
        conn.update("UPDATE payments SET provider_ref = ?, updated_at = now() WHERE id = ?", providerRef, paymentId)
    }

    /** Sets a payment's status ("succeeded", "cancelled", "failed"). */
    fun setStatus(conn: Connection, paymentId: UUID, status: String) {
        conn.update("UPDATE payments SET status = ?::payment_record_status, updated_at = now() WHERE id = ?", status, paymentId)
    }

    /** Cancels the booking's charges still waiting for payment. Returns the ids of those that had a checkout. */
    fun cancelPendingCharges(conn: Connection, businessId: UUID, bookingId: UUID): List<UUID> = conn.query(
        "UPDATE payments SET status = 'cancelled', updated_at = now() WHERE business_id = ? AND booking_id = ? AND kind = 'charge' " +
            "AND status = 'pending' RETURNING id, provider_ref",
        businessId, bookingId,
    ) { it.uuid("id") to it.strOrNull("provider_ref") }.filter { it.second != null }.map { it.first }

    /** Cancels the pending charges of several bookings (expired holds, across businesses). */
    fun cancelPendingCharges(conn: Connection, bookingIds: Collection<UUID>) {
        conn.update(
            "UPDATE payments SET status = 'cancelled', updated_at = now() WHERE booking_id = ANY(?) AND kind = 'charge' AND status = " +
                "'pending'",
            UuidArray(bookingIds),
        )
    }

    /** Records a pending refund of [charge]; the provider's answer is stored with [setRefundOutcome]. */
    fun insertRefund(conn: Connection, charge: PaymentRow, amountCents: Int): UUID = conn.queryOne(
        """
        INSERT INTO payments (business_id, booking_id, provider, kind, amount_cents, currency, status, provider_account)
        VALUES (?, ?, ?, 'refund', ?, ?, 'pending', ?) RETURNING id
        """.trimIndent(),
        charge.businessId, charge.bookingId, charge.provider, amountCents, charge.currency, charge.providerAccount,
    ) { it.uuid("id") }!!

    fun setRefundOutcome(conn: Connection, refundId: UUID, result: RefundResult) {
        conn.update(
            "UPDATE payments SET provider_ref = ?, status = ?::payment_record_status, updated_at = now() WHERE id = ?",
            result.providerRef, if (result.succeeded) "succeeded" else "failed", refundId,
        )
    }

    /** Records a refund the provider made outside bookanything (e.g. in the Stripe dashboard). */
    fun insertExternalRefund(conn: Connection, charge: PaymentRow, amountCents: Int) {
        conn.update(
            """
            INSERT INTO payments (business_id, booking_id, provider, kind, provider_ref, amount_cents, currency, status, provider_account)
            VALUES (?, ?, ?, 'refund', ?, ?, ?, 'succeeded', ?)
            """.trimIndent(),
            charge.businessId, charge.bookingId, charge.provider, charge.providerRef?.let { "external:$it" }, amountCents, charge.currency,
            charge.providerAccount,
        )
    }

    /** Money taken since [since]: succeeded charges minus succeeded refunds. */
    fun netTakenSince(conn: Connection, businessId: UUID, since: Instant): Long = conn.queryOne(
        """
        SELECT COALESCE(sum(CASE WHEN kind = 'charge' THEN amount_cents ELSE -amount_cents END), 0)
        FROM payments WHERE business_id = ? AND status = 'succeeded' AND created_at >= ?
        """.trimIndent(),
        businessId, since,
    ) { it.getLong(1) } ?: 0L

    /** Sets the booking's refunded total and payment status from the ledger (idempotent). */
    fun recomputeRefunded(conn: Connection, businessId: UUID, bookingId: UUID) {
        conn.update(
            """
            UPDATE bookings b SET amount_refunded_cents = r.total,
                payment_status = CASE
                    WHEN r.total = 0 THEN b.payment_status
                    WHEN r.total >= b.amount_paid_cents THEN 'refunded'::payment_status
                    ELSE 'partially_refunded'::payment_status END,
                updated_at = now()
            FROM (SELECT COALESCE(SUM(amount_cents), 0)::int AS total FROM payments
                  WHERE business_id = ? AND booking_id = ? AND kind = 'refund' AND status = 'succeeded') r
            WHERE b.business_id = ? AND b.id = ? AND b.amount_refunded_cents IS DISTINCT FROM r.total
            """.trimIndent(),
            businessId, bookingId, businessId, bookingId,
        )
    }
}
