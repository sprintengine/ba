package ie.bookanything.payments

import ie.bookanything.booking.BookingLifecycle
import ie.bookanything.booking.BookingRepository
import ie.bookanything.business.BusinessRow
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.time.Instant

/** A Checkout Session the customer paid, as Stripe reports it (its webhook, or read back when they return to us). */
data class CompletedCheckout(val sessionId: String, val paymentIntent: String?, val amountTotal: Long?, val currency: String?)

/**
 * What a paid Checkout Session does to its charge: the one path both Stripe's `checkout.session.completed` and the
 * customer's return from Checkout ([CheckoutReturn]) take, so whichever comes first confirms the booking and the other
 * changes nothing. Only exactly the amount and currency we asked for pays for the booking; anything else pays for
 * nothing and is refunded in full ([UnmatchedPayments]).
 */
object CheckoutCompletion {
    private val log = LoggerFactory.getLogger(CheckoutCompletion::class.java)

    /** Applies [checkout] to [payment] (of [business], taken on [account]), in the caller's transaction. */
    fun apply(
        conn: Connection, lifecycle: BookingLifecycle, business: BusinessRow, payment: PaymentRow, checkout: CompletedCheckout,
        account: String, now: Instant,
    ) {
        // Lock order: the booking, then its payment (as cancellations do), so this cannot deadlock with one.
        BookingRepository.get(conn, business.id, payment.bookingId, forUpdate = true)
        val current = PaymentRepository.get(conn, payment.id, forUpdate = true) ?: return
        val amount = checkout.amountTotal
        val currency = checkout.currency
        if (amount != current.amountCents.toLong() || !current.currency.equals(currency, ignoreCase = true)) {
            unmatched(conn, business, current, checkout, account)
            return
        }
        // From now on the charge is identified by its PaymentIntent (refunds, charge.refunded).
        checkout.paymentIntent?.let { PaymentRepository.setProviderRef(conn, current.id, it) }
        lifecycle.paymentSucceeded(conn, business, PaymentRepository.get(conn, current.id)!!, now)
    }

    /**
     * Money taken for nothing. The booking's own charge is left as it is (still payable, or already paid); the money gets
     * a ledger row of its own (a failed charge known by its PaymentIntent, so that refund's own events are ours), is
     * refunded in full on the account it was paid to, once, and the owners are told.
     */
    private fun unmatched(conn: Connection, business: BusinessRow, payment: PaymentRow, checkout: CompletedCheckout, account: String) {
        val pi = checkout.paymentIntent ?: return
        val amount = checkout.amountTotal
        val currency = checkout.currency
        // Already handled: the webhook and the customer's return both report it, and Stripe redelivers.
        if (PaymentRepository.chargeByProviderRef(conn, "stripe", pi) != null) return
        log.error(
            "stripe session {} paid {} {} but payment {} is {} {}: not applied, refunding it", checkout.sessionId, amount, currency,
            payment.id, payment.amountCents, payment.currency,
        )
        if (amount == null || amount <= 0 || currency == null) return
        UnmatchedPayments.record(conn, payment, pi, amount, currency, account)
        UnmatchedPayments.enqueue(conn, business.id, payment.id, account, pi, amount, currency)
    }
}
