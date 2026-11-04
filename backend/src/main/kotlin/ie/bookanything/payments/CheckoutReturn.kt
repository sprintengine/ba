package ie.bookanything.payments

import ie.bookanything.booking.BookingLifecycle
import ie.bookanything.booking.BookingRow
import ie.bookanything.booking.BookingStatus
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.Db
import ie.bookanything.http.ApiException
import org.slf4j.LoggerFactory
import java.time.Clock

/**
 * The customer back from Checkout (`?payment=succeeded&session_id=…`): their page asks us to confirm the payment
 * rather than wait for Stripe's webhook. The session is read from Stripe (outside any transaction) and, if paid, applied
 * exactly as the webhook would ([CheckoutCompletion]); whichever comes first confirms the booking.
 */
class CheckoutReturn(
    private val db: Db,
    private val clock: Clock,
    private val provider: PaymentProvider,
    private val lifecycle: BookingLifecycle,
) {
    private val log = LoggerFactory.getLogger(CheckoutReturn::class.java)

    /**
     * Confirms [booking]'s payment by its checkout [sessionId] if it was paid; nothing for anyone else's session, or for a
     * booking no longer waiting for one (a late payment still arrives by webhook). Best effort: when Stripe can't be
     * asked, nothing changes and the webhook confirms it.
     */
    fun confirm(business: BusinessRow, booking: BookingRow, sessionId: String) {
        if (booking.status != BookingStatus.HELD) return
        val payment = db.txBlocking(business.id, readOnly = true) {
            PaymentRepository.chargeByProviderRef(it, provider.name, sessionId)
        }
        // Not this booking's checkout, or already confirmed (the charge is known by its PaymentIntent then).
        if (payment == null || payment.bookingId != booking.id || payment.status != "pending") return
        val account = payment.providerAccount ?: business.stripeAccountId ?: return
        try {
            val paid = provider.paidCheckout(business, sessionId, account) ?: return
            db.txBlocking(business.id) { conn ->
                CheckoutCompletion.apply(conn, lifecycle, business, payment, paid, account, clock.instant())
            }
        } catch (e: ApiException) {
            log.warn("confirming checkout {} of booking {} on return failed: {} {}", sessionId, booking.id, e.code, e.message)
        }
    }
}
