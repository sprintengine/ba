package ie.bookanything.payments

import com.stripe.StripeClient
import com.stripe.exception.InvalidRequestException
import com.stripe.exception.PermissionException
import com.stripe.exception.StripeException
import com.stripe.exception.oauth.InvalidClientException
import com.stripe.exception.oauth.OAuthException
import com.stripe.net.OAuth
import com.stripe.net.RequestOptions
import com.stripe.param.AccountCreateParams
import com.stripe.param.AccountLinkCreateParams
import com.stripe.param.CustomerCreateParams
import com.stripe.param.InvoicePaymentListParams
import com.stripe.param.RefundCreateParams
import com.stripe.param.SubscriptionCancelParams
import com.stripe.param.billing.MeterEventCreateParams
import com.stripe.param.checkout.SessionCreateParams
import ie.bookanything.http.Errors
import org.slf4j.LoggerFactory
import com.stripe.param.billingportal.SessionCreateParams as PortalSessionCreateParams

/** [StripeGateway] backed by the official stripe-java SDK (`StripeClient`, API v1 services). */
class SdkStripeGateway(private val secretKey: String) : StripeGateway {
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
        throw if (refusedForGood(e)) StripeRefusedException(e.code) else Errors.providerError()
    }

    override fun createAccount(params: AccountCreateParams, options: RequestOptions): String =
        call("account.create") { client.v1().accounts().create(params, options).id }

    override fun retrieveAccount(accountId: String) = call("account.retrieve") {
        val a = client.v1().accounts().retrieve(accountId)
        StripeAccountState(
            a.id, a.chargesEnabled == true, a.detailsSubmitted == true, a.country, a.defaultCurrency?.lowercase(),
            a.businessProfile?.name ?: a.settings?.dashboard?.displayName,
        )
    }

    // OAuth lives on connect.stripe.com and only has the SDK's static API: the key and timeouts go in per request.
    private fun oauthOptions(retries: Int) = RequestOptions.builder()
        .setApiKey(secretKey)
        .setConnectTimeout(CONNECT_TIMEOUT_MS)
        .setReadTimeout(READ_TIMEOUT_MS)
        .setMaxNetworkRetries(retries)
        .build()

    override fun exchangeOAuthCode(code: String): StripeOAuthConnection = call("oauth.token") {
        try {
            // No network retries: a second use of the code would revoke the connection the first one made.
            val r = OAuth.token(mapOf("grant_type" to "authorization_code", "code" to code), oauthOptions(retries = 0))
            StripeOAuthConnection(r.stripeUserId, r.livemode == true)
        } catch (e: OAuthException) {
            log.warn("stripe oauth.token refused: code={} requestId={}", e.code, e.requestId)
            throw StripeOAuthError(e.code, e)
        }
    }

    override fun deauthorizeAccount(clientId: String, accountId: String): Boolean = call("oauth.deauthorize") {
        try {
            OAuth.deauthorize(mapOf("client_id" to clientId, "stripe_user_id" to accountId), oauthOptions(MAX_NETWORK_RETRIES))
            true
        } catch (e: InvalidClientException) {
            // Already disconnected (or never connected to this application): nothing left to undo.
            log.info("stripe oauth.deauthorize for {}: not connected ({})", accountId, e.message)
            false
        }
    }

    override fun createAccountLink(params: AccountLinkCreateParams): String =
        call("account_link.create") { client.v1().accountLinks().create(params).url }

    override fun createCheckoutSession(params: SessionCreateParams, options: RequestOptions) = call("checkout.session.create") {
        val s = client.v1().checkout().sessions().create(params, options)
        StripeSessionRef(s.id, s.url, s.paymentIntent, s.status, expiresAt = s.expiresAt)
    }

    override fun retrieveCheckoutSession(sessionId: String, options: RequestOptions) = call("checkout.session.retrieve") {
        val s = client.v1().checkout().sessions().retrieve(sessionId, options)
        StripeSessionRef(s.id, s.url, s.paymentIntent, s.status, s.paymentStatus, s.amountTotal, s.currency)
    }

    override fun expireCheckoutSession(sessionId: String, options: RequestOptions) = call("checkout.session.expire") {
        val s = client.v1().checkout().sessions().expire(sessionId, options)
        StripeSessionRef(s.id, s.url, s.paymentIntent, s.status)
    }

    override fun createRefund(params: RefundCreateParams, options: RequestOptions) = call("refund.create") {
        val r = client.v1().refunds().create(params, options)
        StripeRefundRef(r.id, r.status, r.failureReason)
    }

    override fun createCustomer(params: CustomerCreateParams, options: RequestOptions): String =
        call("customer.create") { client.v1().customers().create(params, options).id }

    override fun createPortalSession(params: PortalSessionCreateParams): String =
        call("billing_portal.session.create") { client.v1().billingPortal().sessions().create(params).url }

    override fun retrieveSubscription(subscriptionId: String): StripeSubscription? = try {
        call("subscription.retrieve") {
            val s = client.v1().subscriptions().retrieve(subscriptionId)
            StripeSubscription(
                s.id, s.status, s.customer, s.items?.data.orEmpty().mapNotNull { it.price?.id }, s.metadata.orEmpty(), s.latestInvoice,
            )
        }
    } catch (e: StripeRefusedException) {
        if (e.stripeCode == "resource_missing") null else throw e
    }

    override fun cancelSubscription(subscriptionId: String, idempotencyKey: String) {
        call("subscription.cancel") {
            client.v1().subscriptions().cancel(
                subscriptionId,
                SubscriptionCancelParams.builder().setProrate(false).setInvoiceNow(false).build(),
                RequestOptions.builder().setIdempotencyKey(idempotencyKey).build(),
            )
        }
    }

    override fun invoicePayments(invoiceId: String): List<StripeInvoicePayment> = call("invoice_payment.list") {
        client.v1().invoicePayments().list(
            InvoicePaymentListParams.builder().setInvoice(invoiceId).setStatus(InvoicePaymentListParams.Status.PAID).build(),
        ).data.mapNotNull { p ->
            p.payment?.paymentIntent?.let { StripeInvoicePayment(it, p.amountPaid ?: 0L, p.currency.orEmpty()) }
        }
    }

    override fun createMeterEvent(params: MeterEventCreateParams) {
        call("billing.meter_event.create") { client.v1().billing().meterEvents().create(params) }
    }
}

private const val CONNECT_TIMEOUT_MS = 5_000
private const val READ_TIMEOUT_MS = 20_000
private const val MAX_NETWORK_RETRIES = 1

/** Refusals that clear by themselves: the connected account's balance can cover a refund once funds arrive. */
private val TRANSIENT_REFUSALS = setOf("balance_insufficient")

/**
 * A request Stripe will refuse again: invalid (a 400 or 404: `InvalidRequestException`; rate limits, idempotency clashes
 * and conflicts are other exception types) or without access to the account. Retrying those only delays the answer.
 */
internal fun refusedForGood(e: StripeException) =
    e is PermissionException || (e is InvalidRequestException && e.code !in TRANSIENT_REFUSALS)
