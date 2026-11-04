package ie.bookanything.payments

import ie.bookanything.business.BusinessRow
import ie.bookanything.business.Plan
import ie.bookanything.http.Errors
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
    /** The account the charge was taken on (null: the business's current one, for charges recorded before accounts were). */
    val account: String? = null,
)

data class RefundResult(val providerRef: String?, val succeeded: Boolean)

data class ConnectStatus(
    val connected: Boolean,
    val chargesEnabled: Boolean,
    val detailsSubmitted: Boolean,
    /** The account's name as Stripe shows it, when the provider could read it. */
    val accountName: String? = null,
)

/** An existing account the owner just connected (OAuth), as the provider reports it. */
data class LinkedAccount(
    val accountId: String,
    val chargesEnabled: Boolean,
    val detailsSubmitted: Boolean,
    /** Lowercase ISO currency the account settles in by default, when known. */
    val defaultCurrency: String?,
    val country: String?,
)

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

    /** The provider account a charge for [business] is taken on now (Stripe: its connected account), stored on the charge. */
    fun accountFor(business: BusinessRow): String? = null

    fun connectStatus(business: BusinessRow): ConnectStatus

    /** Returns an onboarding URL for the business's connected account, creating the account on first use. */
    fun createConnectLink(business: BusinessRow, returnUrl: String): ConnectLink

    /** Whether an owner can connect an account they already have (Stripe: Connect OAuth with a client id). */
    val canConnectExisting: Boolean get() = false

    /** The provider's page where the owner picks the account to connect; it sends them to [redirectUri] with [state]. */
    fun existingAccountUrl(business: BusinessRow, state: String, redirectUri: String): String = throw Errors.paymentsNotConfigured(
        "Connecting an existing account isn't available on this server.",
    )

    /** Completes the provider's side of connecting an existing account: its authorization [code] → the account id. */
    fun exchangeExistingAccountCode(code: String): String = throw Errors.paymentsNotConfigured()

    /** An account the owner connected, as the provider reports it. */
    fun existingAccount(accountId: String): LinkedAccount = throw Errors.paymentsNotConfigured()

    /**
     * Ends the platform's access to an account linked by OAuth ([accountId]); false when it had already ended. An
     * account the provider created for the business stays theirs: forgetting it is all there is to do.
     */
    fun disconnectExisting(accountId: String): Boolean = false

    fun createCheckout(request: CheckoutRequest): CheckoutSession

    /**
     * Closes the hosted checkout [providerRef] (from [createCheckout], taken on [account]) so it can no longer be paid;
     * nothing when it is already paid or closed. Returns whether the customer had paid it (its confirmation is on its
     * way). Used when its charge was cancelled ([CheckoutExpiry]) and before an account is disconnected.
     */
    fun expireCheckout(business: BusinessRow, providerRef: String, account: String? = null): Boolean

    fun refund(request: RefundRequest): RefundResult

    /** Subscription checkout for a platform plan; creates the business's billing customer when needed. */
    fun createBillingCheckout(business: BusinessRow, plan: Plan, returnUrl: String, ownerEmail: String?): BillingSession

    fun createBillingPortal(business: BusinessRow, returnUrl: String): String
}
