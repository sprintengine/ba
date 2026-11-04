package ie.bookanything.payments

import ie.bookanything.business.BusinessRow
import ie.bookanything.business.Plan
import ie.bookanything.http.Errors

/** Used when neither Stripe nor development mode applies: online payments are unavailable. */
class NoPaymentProvider : PaymentProvider {
    override val name = "none"
    override fun chargesEnabled(business: BusinessRow) = false
    override fun connectStatus(business: BusinessRow) = ConnectStatus(false, false, false)
    override fun createConnectLink(business: BusinessRow, returnUrl: String): ConnectLink = throw Errors.paymentsNotConfigured()
    override fun createCheckout(request: CheckoutRequest): CheckoutSession = throw Errors.paymentsNotConfigured()
    override fun expireCheckout(business: BusinessRow, providerRef: String, account: String?) = false // never created one
    override fun refund(request: RefundRequest): RefundResult = throw Errors.paymentsNotConfigured()
    override fun createBillingCheckout(business: BusinessRow, plan: Plan, returnUrl: String, ownerEmail: String?): BillingSession =
        throw Errors.paymentsNotConfigured("Billing is not configured on this server.")
    override fun createBillingPortal(business: BusinessRow, returnUrl: String): String =
        throw Errors.paymentsNotConfigured("Billing is not configured on this server.")
}
