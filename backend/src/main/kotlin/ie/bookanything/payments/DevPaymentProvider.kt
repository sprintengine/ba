package ie.bookanything.payments

import ie.bookanything.business.BusinessRow
import ie.bookanything.business.Plan
import ie.bookanything.http.Errors

/**
 * Development-only provider: checkout happens on the frontend page `/dev/checkout/{paymentId}`
 * which calls the dev-payments endpoints. Refunds succeed immediately. Never selected in production.
 */
class DevPaymentProvider(private val appBaseUrl: String) : PaymentProvider {
    override val name = "dev"
    override fun chargesEnabled(business: BusinessRow) = true
    override fun connectStatus(business: BusinessRow) = ConnectStatus(true, true, true)
    override fun createConnectLink(business: BusinessRow, returnUrl: String) = ConnectLink(returnUrl, null)
    override fun createCheckout(request: CheckoutRequest) =
        CheckoutSession("dev_cs_${request.paymentId}", "$appBaseUrl/dev/checkout/${request.paymentId}")

    // The dev checkout page reads the payment, which is already cancelled: nothing to close.
    override fun expireCheckout(business: BusinessRow, providerRef: String, account: String?) = false
    override fun refund(request: RefundRequest) = RefundResult("dev_re_${request.refundPaymentId}", RefundOutcome.SUCCEEDED)
    override fun createBillingCheckout(business: BusinessRow, plan: Plan, returnUrl: String, ownerEmail: String?): BillingSession =
        throw Errors.paymentsNotConfigured("Billing needs Stripe (STRIPE_SECRET_KEY).")
    override fun createBillingPortal(business: BusinessRow, returnUrl: String): String =
        throw Errors.paymentsNotConfigured("Billing needs Stripe (STRIPE_SECRET_KEY).")
}
