package ie.bookanything.payments

import com.stripe.StripeClient
import com.stripe.exception.StripeException
import com.stripe.net.RequestOptions
import com.stripe.param.AccountCreateParams
import com.stripe.param.AccountLinkCreateParams
import com.stripe.param.CustomerCreateParams
import com.stripe.param.RefundCreateParams
import com.stripe.param.billing.MeterEventCreateParams
import com.stripe.param.checkout.SessionCreateParams
import ie.bookanything.http.Errors
import org.slf4j.LoggerFactory
import com.stripe.param.billingportal.SessionCreateParams as PortalSessionCreateParams

/** [StripeGateway] backed by the official stripe-java SDK (`StripeClient`, API v1 services). */
class SdkStripeGateway(secretKey: String) : StripeGateway {
    private val log = LoggerFactory.getLogger(SdkStripeGateway::class.java)

    // Stripe calls are made outside database transactions (docs/architecture.md section 7), but a request still waits on
    // them, and so does a replay of it (BookingEngine's checkout wait), so they get short, explicit timeouts (the SDK's
    // defaults are 30 s to connect and 80 s to read, with retries): at worst two attempts of 5 + 20 s.
    private val client = StripeClient.builder()
        .setApiKey(secretKey)
        .setConnectTimeout(CONNECT_TIMEOUT_MS)
        .setReadTimeout(READ_TIMEOUT_MS)
        .setMaxNetworkRetries(MAX_NETWORK_RETRIES)
        .build()

    private inline fun <T> call(what: String, block: () -> T): T = try {
        block()
    } catch (e: StripeException) {
        log.warn("stripe {} failed: status={} code={} requestId={} message={}", what, e.statusCode, e.code, e.requestId, e.message)
        throw Errors.providerError()
    }

    override fun createAccount(params: AccountCreateParams, options: RequestOptions): String =
        call("account.create") { client.v1().accounts().create(params, options).id }

    override fun retrieveAccount(accountId: String) = call("account.retrieve") {
        val a = client.v1().accounts().retrieve(accountId)
        StripeAccountState(a.id, a.chargesEnabled == true, a.detailsSubmitted == true)
    }

    override fun createAccountLink(params: AccountLinkCreateParams): String =
        call("account_link.create") { client.v1().accountLinks().create(params).url }

    override fun createCheckoutSession(params: SessionCreateParams, options: RequestOptions) = call("checkout.session.create") {
        val s = client.v1().checkout().sessions().create(params, options)
        StripeSessionRef(s.id, s.url, s.paymentIntent)
    }

    override fun retrieveCheckoutSession(sessionId: String, options: RequestOptions) = call("checkout.session.retrieve") {
        val s = client.v1().checkout().sessions().retrieve(sessionId, options)
        StripeSessionRef(s.id, s.url, s.paymentIntent, s.status)
    }

    override fun expireCheckoutSession(sessionId: String, options: RequestOptions) = call("checkout.session.expire") {
        val s = client.v1().checkout().sessions().expire(sessionId, options)
        StripeSessionRef(s.id, s.url, s.paymentIntent, s.status)
    }

    override fun createRefund(params: RefundCreateParams, options: RequestOptions) = call("refund.create") {
        val r = client.v1().refunds().create(params, options)
        StripeRefundRef(r.id, r.status)
    }

    override fun createCustomer(params: CustomerCreateParams, options: RequestOptions): String =
        call("customer.create") { client.v1().customers().create(params, options).id }

    override fun createPortalSession(params: PortalSessionCreateParams): String =
        call("billing_portal.session.create") { client.v1().billingPortal().sessions().create(params).url }

    override fun createMeterEvent(params: MeterEventCreateParams) {
        call("billing.meter_event.create") { client.v1().billing().meterEvents().create(params) }
    }
}

private const val CONNECT_TIMEOUT_MS = 5_000
private const val READ_TIMEOUT_MS = 20_000
private const val MAX_NETWORK_RETRIES = 1
