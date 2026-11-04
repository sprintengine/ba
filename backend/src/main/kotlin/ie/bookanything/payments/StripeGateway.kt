package ie.bookanything.payments

import com.stripe.net.RequestOptions
import com.stripe.param.AccountCreateParams
import com.stripe.param.AccountLinkCreateParams
import com.stripe.param.CustomerCreateParams
import com.stripe.param.RefundCreateParams
import com.stripe.param.billing.MeterEventCreateParams
import com.stripe.param.checkout.SessionCreateParams
import ie.bookanything.http.ApiException
import io.ktor.http.HttpStatusCode
import com.stripe.param.billingportal.SessionCreateParams as PortalSessionCreateParams

/** A connected account as Stripe reports it; [country], [defaultCurrency] (lowercase) and [displayName] when known. */
data class StripeAccountState(
    val id: String,
    val chargesEnabled: Boolean,
    val detailsSubmitted: Boolean,
    val country: String? = null,
    val defaultCurrency: String? = null,
    val displayName: String? = null,
)

/**
 * The result of a Connect OAuth code exchange: the account only. Stripe also returns access and refresh tokens; they are
 * deprecated and never read or kept (we act on the account with the platform key and the `Stripe-Account` header).
 */
data class StripeOAuthConnection(val accountId: String, val livemode: Boolean)

/** Stripe refused an OAuth request ([code]: `invalid_grant` for an expired or used code, `invalid_client`, ...). */
class StripeOAuthError(val code: String?, cause: Throwable? = null) : RuntimeException("Stripe OAuth error: ${code ?: "unknown"}", cause)

/**
 * A Checkout Session: [status] is "open", "complete" or "expired" and [paymentStatus] "paid", "unpaid" or
 * "no_payment_required" (when Stripe said), with what it charged.
 */
data class StripeSessionRef(
    val id: String,
    val url: String?,
    val paymentIntentId: String?,
    val status: String? = null,
    val paymentStatus: String? = null,
    val amountTotal: Long? = null,
    val currency: String? = null,
    /** When Stripe closes the session (epoch seconds). */
    val expiresAt: Long? = null,
)

/** A platform subscription as Stripe has it now (not as an event described it): what billing is applied from. */
data class StripeSubscription(
    val id: String,
    val status: String,
    val customer: String?,
    val priceIds: List<String>,
    val metadata: Map<String, String>,
    val latestInvoice: String?,
)

/** A payment of an invoice: its PaymentIntent and how much it paid. */
data class StripeInvoicePayment(val paymentIntent: String, val amountPaid: Long, val currency: String)

/** A refund as Stripe reports it: [status] "succeeded", "pending", "requires_action", "failed" or "canceled". */
data class StripeRefundRef(val id: String, val status: String?, val failureReason: String? = null)

/**
 * Stripe refused a request it will refuse again (a 4xx other than a rate limit, or no access to the account): the
 * caller gives up instead of retrying. Answered to clients like any provider error.
 */
class StripeRefusedException(val stripeCode: String?) :
    ApiException(HttpStatusCode.BadGateway, "PAYMENT_PROVIDER_ERROR", "The payment provider refused the request.")

/**
 * The only place that talks to the Stripe API. Parameters are the SDK's own builders so tests can
 * assert exactly what would be sent (connected account, no application fee, expiry, metadata)
 * with a fake gateway and no network.
 */
interface StripeGateway {
    fun createAccount(params: AccountCreateParams, options: RequestOptions): String
    fun retrieveAccount(accountId: String): StripeAccountState
    fun createAccountLink(params: AccountLinkCreateParams): String

    /**
     * Completes a Connect OAuth connection: exchanges the authorization [code] for the account id. Not idempotent (Stripe
     * revokes a connection whose code is used twice), so it is never retried. Throws [StripeOAuthError] when refused.
     */
    fun exchangeOAuthCode(code: String): StripeOAuthConnection

    /** Disconnects [accountId] from the platform's Connect application [clientId]; false when it was not connected. */
    fun deauthorizeAccount(clientId: String, accountId: String): Boolean
    fun createCheckoutSession(params: SessionCreateParams, options: RequestOptions): StripeSessionRef
    fun retrieveCheckoutSession(sessionId: String, options: RequestOptions): StripeSessionRef

    /** Closes an open Checkout Session so it can no longer be paid. */
    fun expireCheckoutSession(sessionId: String, options: RequestOptions): StripeSessionRef
    fun createRefund(params: RefundCreateParams, options: RequestOptions): StripeRefundRef
    fun createCustomer(params: CustomerCreateParams, options: RequestOptions): String
    fun createPortalSession(params: PortalSessionCreateParams): String

    /** A platform subscription as it is now; null when Stripe has none by that id. */
    fun retrieveSubscription(subscriptionId: String): StripeSubscription?

    /** Cancels a platform subscription at once (no proration, no final invoice); [idempotencyKey] makes it once. */
    fun cancelSubscription(subscriptionId: String, idempotencyKey: String)

    /** The paid payments of a platform invoice. */
    fun invoicePayments(invoiceId: String): List<StripeInvoicePayment>

    /** Billing Meter event (AI overage, docs/architecture.md section 16). */
    fun createMeterEvent(params: MeterEventCreateParams)
}
