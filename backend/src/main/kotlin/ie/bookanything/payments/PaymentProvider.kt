package ie.bookanything.payments

import ie.bookanything.business.BusinessRow
import ie.bookanything.business.Plan
import java.time.Instant
import java.util.UUID

data class CheckoutRequest(
    val paymentId: UUID,
    val bookingId: UUID,
    val business: BusinessRow,
    val amountCents: Int,
    val currency: String,
    val description: String,
    val customerEmail: String?,
    /** Hold expiry; Stripe requires at least 30 minutes in the future. */
    val expiresAt: Instant,
    val successUrl: String,
    val cancelUrl: String,
)

data class CheckoutSession(val providerRef: String, val url: String)

data class RefundRequest(
    val refundPaymentId: UUID,
    val business: BusinessRow,
    /** Provider reference of the original successful charge. */
    val chargeProviderRef: String?,
    val amountCents: Int,
    val currency: String,
)

data class RefundResult(val providerRef: String?, val succeeded: Boolean)

data class ConnectStatus(val connected: Boolean, val chargesEnabled: Boolean, val detailsSubmitted: Boolean)

/** An onboarding link; [accountId] is set when the provider created a new connected account (the caller stores it). */
data class ConnectLink(val url: String, val accountId: String?)

/** A billing checkout; [customerId] is set when the provider created a new billing customer (the caller stores it). */
data class BillingSession(val url: String, val customerId: String?)

/**
 * Payment integration boundary (docs/architecture.md section 7). Implementations perform
 * provider calls only; all database state is handled by [PaymentService] ([PaymentRepository]) and the
 * booking engine. Implemented by `StripePaymentProvider`, [DevPaymentProvider] and [NoPaymentProvider].
 */
interface PaymentProvider {
    /** "stripe" | "dev" | "none" */
    val name: String

    /** Minimum hold for bookings awaiting online payment (Stripe Checkout needs ≥ 30 minutes). */
    val minHoldMinutes: Int get() = 0

    /** Whether this business can take online payments right now. */
    fun chargesEnabled(business: BusinessRow): Boolean

    fun connectStatus(business: BusinessRow): ConnectStatus

    /** Returns an onboarding URL for the business's connected account, creating the account on first use. */
    fun createConnectLink(business: BusinessRow, returnUrl: String): ConnectLink

    fun createCheckout(request: CheckoutRequest): CheckoutSession

    /**
     * Closes the hosted checkout [providerRef] (from [createCheckout]) so it can no longer be paid; nothing when it is
     * already paid or closed. Its charge was cancelled (the held booking was cancelled), see [CheckoutExpiry].
     */
    fun expireCheckout(business: BusinessRow, providerRef: String)

    fun refund(request: RefundRequest): RefundResult

    /** Subscription checkout for a platform plan; creates the business's billing customer when needed. */
    fun createBillingCheckout(business: BusinessRow, plan: Plan, returnUrl: String, ownerEmail: String?): BillingSession

    fun createBillingPortal(business: BusinessRow, returnUrl: String): String
}
