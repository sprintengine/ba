package ie.bookanything.payments

import com.stripe.net.RequestOptions
import com.stripe.param.AccountCreateParams
import com.stripe.param.AccountLinkCreateParams
import com.stripe.param.CustomerCreateParams
import com.stripe.param.RefundCreateParams
import com.stripe.param.billing.MeterEventCreateParams
import com.stripe.param.checkout.SessionCreateParams
import com.stripe.param.billingportal.SessionCreateParams as PortalSessionCreateParams

data class StripeAccountState(val id: String, val chargesEnabled: Boolean, val detailsSubmitted: Boolean)

/** A Checkout Session: [status] is "open", "complete" or "expired" (when Stripe said). */
data class StripeSessionRef(val id: String, val url: String?, val paymentIntentId: String?, val status: String? = null)
data class StripeRefundRef(val id: String, val status: String?)

/**
 * The only place that talks to the Stripe API. Parameters are the SDK's own builders so tests can
 * assert exactly what would be sent (connected account, no application fee, expiry, metadata)
 * with a fake gateway and no network.
 */
interface StripeGateway {
    fun createAccount(params: AccountCreateParams, options: RequestOptions): String
    fun retrieveAccount(accountId: String): StripeAccountState
    fun createAccountLink(params: AccountLinkCreateParams): String
    fun createCheckoutSession(params: SessionCreateParams, options: RequestOptions): StripeSessionRef
    fun retrieveCheckoutSession(sessionId: String, options: RequestOptions): StripeSessionRef

    /** Closes an open Checkout Session so it can no longer be paid. */
    fun expireCheckoutSession(sessionId: String, options: RequestOptions): StripeSessionRef
    fun createRefund(params: RefundCreateParams, options: RequestOptions): StripeRefundRef
    fun createCustomer(params: CustomerCreateParams, options: RequestOptions): String
    fun createPortalSession(params: PortalSessionCreateParams): String

    /** Billing Meter event (AI overage, docs/architecture.md section 16). */
    fun createMeterEvent(params: MeterEventCreateParams)
}
