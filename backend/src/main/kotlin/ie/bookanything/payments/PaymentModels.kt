package ie.bookanything.payments

import ie.bookanything.business.BusinessRow
import ie.bookanything.http.formatInstant
import kotlinx.serialization.Serializable
import java.time.Instant
import java.util.UUID

@Serializable
data class PaymentDto(
    val id: String,
    val kind: String,
    val provider: String,
    val amountCents: Int,
    val currency: String,
    val status: String,
    val createdAt: String,
)

data class PaymentRow(
    val id: UUID,
    val businessId: UUID,
    val bookingId: UUID,
    val provider: String,
    val kind: String,
    val providerRef: String?,
    val checkoutUrl: String?,
    val returnUrl: String?,
    val amountCents: Int,
    val currency: String,
    val status: String,
    val createdAt: Instant,
) {
    fun toDto(business: BusinessRow) =
        PaymentDto(id.toString(), kind, provider, amountCents, currency, status, formatInstant(createdAt, business.zone))
}

/** The answer to a provider's webhook delivery (Stripe, Clerk). */
@Serializable
data class WebhookAck(val received: Boolean, val duplicate: Boolean = false)

/** An online charge for a booking: the amount and the hosted checkout's text and return links. */
data class ChargeRequest(
    val bookingId: UUID,
    val amountCents: Int,
    val description: String,
    val customerEmail: String?,
    /** The booking's hold expiry: the checkout closes then. */
    val expiresAt: Instant,
    /** The app origin to return to after a dev checkout (null: the default app), stored on the payment. */
    val returnUrl: String?,
    val successUrl: String,
    val cancelUrl: String,
)
