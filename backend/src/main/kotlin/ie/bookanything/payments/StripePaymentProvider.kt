package ie.bookanything.payments

import com.stripe.net.RequestOptions
import com.stripe.param.AccountCreateParams
import com.stripe.param.AccountLinkCreateParams
import com.stripe.param.CustomerCreateParams
import com.stripe.param.RefundCreateParams
import com.stripe.param.checkout.SessionCreateParams
import ie.bookanything.booking.RefundSettlement
import ie.bookanything.business.BusinessRow
import ie.bookanything.business.Plan
import ie.bookanything.config.StripeConfig
import ie.bookanything.http.ApiException
import ie.bookanything.http.Errors
import org.slf4j.LoggerFactory
import java.time.Clock
import java.time.Duration
import java.time.Instant
import com.stripe.param.billingportal.SessionCreateParams as PortalSessionCreateParams

/**
 * Stripe Connect provider (docs/architecture.md section 7).
 *
 * - Each business has its own connected account (Stripe-hosted onboarding via Account Links;
 *   Stripe collects requirements, the account pays its own Stripe fees and has the full dashboard).
 * - Booking payments are **direct charges on the connected account** (`Stripe-Account` header):
 *   the business is merchant of record and the platform takes **no application fee**.
 * - Platform billing (plans) runs on the platform account with Stripe Billing.
 */
class StripePaymentProvider(
    private val gateway: StripeGateway,
    private val config: StripeConfig,
    private val clock: Clock = Clock.systemUTC(),
) : PaymentProvider, PlatformSubscriptions {
    private val log = LoggerFactory.getLogger(StripePaymentProvider::class.java)

    override val name = "stripe"

    /** Checkout Sessions must expire at least 30 minutes after creation; one extra minute absorbs clock skew. */
    override val minHoldMinutes = MIN_HOLD_MINUTES

    override fun chargesEnabled(business: BusinessRow) = business.stripeAccountId != null && business.stripeChargesEnabled

    override fun accountFor(business: BusinessRow) = business.stripeAccountId

    override fun connectStatus(business: BusinessRow): ConnectStatus {
        val accountId = business.stripeAccountId ?: return ConnectStatus(false, false, false)
        return try {
            val a = gateway.retrieveAccount(accountId)
            ConnectStatus(true, a.chargesEnabled, a.detailsSubmitted, a.displayName)
        } catch (_: ApiException) {
            // Stripe unreachable (the gateway turns StripeException into a provider error): report what the last
            // account.updated webhook told us.
            ConnectStatus(true, business.stripeChargesEnabled, business.stripeDetailsSubmitted)
        }
    }

    override fun createConnectLink(business: BusinessRow, returnUrl: String): ConnectLink {
        // Account Links only onboard accounts we created; an account the owner brought is managed in their own dashboard.
        if (business.stripeConnectMethod == "oauth") {
            throw Errors.conflict("This business uses a Stripe account you connected. Manage its details in your Stripe dashboard.")
        }
        var created: String? = null
        val accountId = business.stripeAccountId ?: gateway.createAccount(
            accountParams(business),
            // Two concurrent first clicks must not create two accounts; after a disconnect, the next one is a new account.
            RequestOptions.builder().setIdempotencyKey(accountIdempotencyKey(business)).build(),
        ).also { created = it }
        val url = gateway.createAccountLink(
            AccountLinkCreateParams.builder()
                .setAccount(accountId)
                .setType(AccountLinkCreateParams.Type.ACCOUNT_ONBOARDING)
                .setRefreshUrl(withQuery(returnUrl, "stripe=refresh"))
                .setReturnUrl(withQuery(returnUrl, "stripe=return"))
                .build(),
        )
        return ConnectLink(url, created)
    }

    override val canConnectExisting get() = config.connectClientId?.startsWith("ca_") == true

    /**
     * Stripe's Connect OAuth page (docs.stripe.com/connect/oauth-reference): the owner signs in and picks the account to
     * connect (or creates one there). `read_write` is the only scope a platform can ask for; the prefilled fields only
     * apply to an account created on that page.
     */
    override fun existingAccountUrl(business: BusinessRow, state: String, redirectUri: String): String {
        val clientId = config.connectClientId ?: return super.existingAccountUrl(business, state, redirectUri)
        val params = listOf(
            "response_type" to "code", "client_id" to clientId, "scope" to "read_write", "state" to state, "redirect_uri" to redirectUri,
            "stripe_user[country]" to business.country, "stripe_user[business_name]" to business.name,
            "stripe_user[email]" to business.contactEmail, "stripe_user[url]" to business.websiteUrl,
        )
        return OAUTH_AUTHORIZE_URL + "?" + params.filter { it.second != null }.joinToString("&") { (k, v) -> "${enc(k)}=${enc(v!!)}" }
    }

    /**
     * The reliability simulation's test accounts on this provider's Stripe ([SimulationStripeAccounts]); null unless
     * the key is a test key. Only staging with the simulation sign-in asks for them (`AppContext.simulationStripe`).
     */
    fun simulationAccounts(): SimulationStripeAccounts? =
        if (SimulationStripeAccounts.isTestKey(config.secretKey)) SimulationStripeAccounts(gateway) else null

    override fun exchangeExistingAccountCode(code: String): String = gateway.exchangeOAuthCode(code).accountId

    override fun existingAccount(accountId: String): LinkedAccount {
        val a = gateway.retrieveAccount(accountId)
        return LinkedAccount(accountId, a.chargesEnabled, a.detailsSubmitted, a.defaultCurrency, a.country)
    }

    override fun disconnectExisting(accountId: String): Boolean {
        val clientId = config.connectClientId ?: run {
            log.warn("cannot deauthorize {}: STRIPE_CONNECT_CLIENT_ID is not set; forgetting it only", accountId)
            return false
        }
        return gateway.deauthorizeAccount(clientId, accountId)
    }

    fun accountParams(business: BusinessRow): AccountCreateParams = AccountCreateParams.builder()
        .setCountry(business.country)
        .setDefaultCurrency(business.currency.lowercase())
        .apply { business.contactEmail?.let { setEmail(it) } }
        .setController(
            AccountCreateParams.Controller.builder()
                .setFees(AccountCreateParams.Controller.Fees.builder().setPayer(AccountCreateParams.Controller.Fees.Payer.ACCOUNT).build())
                .setLosses(
                    AccountCreateParams.Controller.Losses.builder().setPayments(
                        AccountCreateParams.Controller.Losses.Payments.STRIPE,
                    ).build(),
                )
                .setRequirementCollection(AccountCreateParams.Controller.RequirementCollection.STRIPE)
                .setStripeDashboard(
                    AccountCreateParams.Controller.StripeDashboard.builder()
                        .setType(AccountCreateParams.Controller.StripeDashboard.Type.FULL).build(),
                )
                .build(),
        )
        .setBusinessProfile(
            AccountCreateParams.BusinessProfile.builder()
                .setName(business.name)
                .apply { business.websiteUrl?.let { setUrl(it) } }
                .build(),
        )
        .putMetadata("businessId", business.id.toString())
        .putMetadata("slug", business.slug)
        .build()

    /** Builds the Checkout Session parameters. Public so tests can assert the exact request. */
    fun checkoutParams(request: CheckoutRequest): SessionCreateParams {
        val now = clock.instant()
        // Stripe accepts expires_at between 30 minutes and 24 hours after creation.
        val earliest = now.plus(Duration.ofMinutes(30)).plusSeconds(30)
        val latest = now.plus(Duration.ofHours(24)).minusSeconds(60)
        val expiresAt = request.expiresAt.coerceIn(earliest, latest)
        val metadata = mapOf(
            "bookingId" to request.bookingId.toString(),
            "paymentId" to request.paymentId.toString(),
            "businessId" to request.business.id.toString(),
        )
        return SessionCreateParams.builder()
            .setMode(SessionCreateParams.Mode.PAYMENT)
            .addLineItem(
                SessionCreateParams.LineItem.builder()
                    .setQuantity(1L)
                    .setPriceData(
                        SessionCreateParams.LineItem.PriceData.builder()
                            .setCurrency(request.currency.lowercase())
                            .setUnitAmount(request.amountCents.toLong())
                            .setProductData(
                                SessionCreateParams.LineItem.PriceData.ProductData.builder().setName(
                                    request.description.take(STRIPE_PRODUCT_NAME_MAX),
                                ).build(),
                            )
                            .build(),
                    )
                    .build(),
            )
            .apply { request.customerEmail?.let { setCustomerEmail(it) } }
            .setClientReferenceId(request.paymentId.toString())
            .setExpiresAt(expiresAt.epochSecond)
            // Stripe fills in the session's id: on their return, the customer's page has it confirmed straight away.
            .setSuccessUrl(withQuery(request.successUrl, "session_id={CHECKOUT_SESSION_ID}"))
            .setCancelUrl(request.cancelUrl)
            .putAllMetadata(metadata)
            // Direct charge on the connected account: no application_fee_amount, no transfer_data.
            .setPaymentIntentData(
                SessionCreateParams.PaymentIntentData.builder()
                    .setDescription(request.description.take(STRIPE_DESCRIPTION_MAX))
                    .putAllMetadata(metadata)
                    .build(),
            )
            .build()
    }

    fun connectedAccountOptions(business: BusinessRow, idempotencyKey: String): RequestOptions {
        val account = business.stripeAccountId ?: throw Errors.paymentsNotConfigured()
        return RequestOptions.builder().setStripeAccount(account).setIdempotencyKey(idempotencyKey).build()
    }

    override fun createCheckout(request: CheckoutRequest): CheckoutSession {
        if (!chargesEnabled(request.business)) throw Errors.paymentsNotConfigured()
        val params = checkoutParams(request)
        val session = gateway.createCheckoutSession(
            params, connectedAccountOptions(request.business, "bookanything-checkout-${request.paymentId}"),
        )
        val url = session.url ?: throw Errors.providerError()
        // Stripe's own answer (the same as asked, unless a replay found an older session).
        return CheckoutSession(session.id, url, Instant.ofEpochSecond(session.expiresAt ?: params.expiresAt))
    }

    /**
     * Expires the Checkout Session on the connected account while it is still open. A session the customer completed
     * meanwhile is left alone: its payment confirms or refunds the booking as any late payment does.
     */
    override fun expireCheckout(business: BusinessRow, providerRef: String, account: String?): Boolean {
        // Once paid, a charge is known by its PaymentIntent: there is no session to close.
        if (!providerRef.startsWith("cs_")) return true
        val options = RequestOptions.builder().setStripeAccount(account ?: business.stripeAccountId ?: return false).build()
        when (gateway.retrieveCheckoutSession(providerRef, options).status) {
            "open" -> gateway.expireCheckoutSession(providerRef, options)
            "complete" -> return true
        }
        return false
    }

    override fun paidCheckout(business: BusinessRow, providerRef: String, account: String?): CompletedCheckout? {
        if (!providerRef.startsWith("cs_")) return null
        val options = RequestOptions.builder().setStripeAccount(account ?: business.stripeAccountId ?: return null).build()
        val s = gateway.retrieveCheckoutSession(providerRef, options)
        if (s.status != "complete" || s.paymentStatus != "paid") return null
        return CompletedCheckout(s.id, s.paymentIntentId, s.amountTotal, s.currency)
    }

    override fun refund(request: RefundRequest): RefundResult {
        // Nothing that could change by retrying: refused for good, like Stripe's own refusals.
        val ref = request.chargeProviderRef ?: throw StripeRefusedException("charge_reference_missing")
        // On the account the charge was taken on, even if the business has connected another since.
        val account = request.account ?: request.business.stripeAccountId ?: throw StripeRefusedException("account_missing")
        val options = RequestOptions.builder()
            .setStripeAccount(account)
            .setIdempotencyKey("bookanything-refund-${request.refundPaymentId}")
            .build()
        // Charges store the Checkout Session id until the payment completes, then the PaymentIntent id.
        val paymentIntent = if (ref.startsWith("cs_")) {
            gateway.retrieveCheckoutSession(ref, RequestOptions.builder().setStripeAccount(account).build()).paymentIntentId
                ?: throw StripeRefusedException("payment_intent_missing")
        } else {
            ref
        }
        val refund = gateway.createRefund(
            RefundCreateParams.builder()
                .setPaymentIntent(paymentIntent)
                .setAmount(request.amountCents.toLong())
                .putMetadata("refundPaymentId", request.refundPaymentId.toString())
                .putMetadata("businessId", request.business.id.toString())
                .build(),
            options,
        )
        val outcome = refundOutcome(refund.status)
        if (outcome == RefundOutcome.FAILED) {
            log.warn(
                "stripe refund {} for payment {} has status {} ({})",
                refund.id, request.refundPaymentId, refund.status, refund.failureReason,
            )
        }
        return RefundResult(refund.id, outcome, refund.failureReason)
    }

    override fun refundUnmatched(business: BusinessRow, account: String, paymentRef: String): RefundResult {
        val refund = gateway.createRefund(
            RefundCreateParams.builder()
                .setPaymentIntent(paymentRef)
                .putMetadata("businessId", business.id.toString())
                .putMetadata("reason", UnmatchedPayments.REASON)
                .build(),
            RequestOptions.builder().setStripeAccount(account).setIdempotencyKey("bookanything-unmatched-$paymentRef").build(),
        )
        return RefundResult(refund.id, refundOutcome(refund.status), refund.failureReason)
    }

    fun priceFor(plan: Plan): String? = when (plan) {
        Plan.PRO -> config.pricePro
        Plan.BUSINESS -> config.priceBusiness
        Plan.FREE -> null
    }

    fun billingCheckoutParams(
        business: BusinessRow, customerId: String, plan: Plan, price: String, returnUrl: String, expiresAt: Instant,
    ): SessionCreateParams =
        SessionCreateParams.builder()
            .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
            .setExpiresAt(expiresAt.epochSecond)
            .setCustomer(customerId)
            .addLineItem(SessionCreateParams.LineItem.builder().setPrice(price).setQuantity(1L).build())
            .setClientReferenceId(business.id.toString())
            .putMetadata("businessId", business.id.toString())
            .putMetadata("plan", plan.wire)
            .setSubscriptionData(
                SessionCreateParams.SubscriptionData.builder()
                    .putMetadata("businessId", business.id.toString())
                    .putMetadata("plan", plan.wire)
                    .build(),
            )
            .setAllowPromotionCodes(true)
            .setSuccessUrl(withQuery(returnUrl, "billing=success"))
            .setCancelUrl(withQuery(returnUrl, "billing=cancelled"))
            .build()

    override fun createBillingCheckout(business: BusinessRow, plan: Plan, returnUrl: String, ownerEmail: String?): BillingSession {
        val price = priceFor(plan) ?: throw Errors.paymentsNotConfigured("Billing prices are not configured on this server.")
        var created: String? = null
        val customerId = business.stripeCustomerId ?: gateway.createCustomer(
            CustomerCreateParams.builder()
                .setName(business.name)
                .apply { (ownerEmail ?: business.contactEmail)?.let { setEmail(it) } }
                .putMetadata("businessId", business.id.toString())
                .putMetadata("slug", business.slug)
                .build(),
            RequestOptions.builder().setIdempotencyKey("bookanything-customer-${business.id}").build(),
        ).also { created = it }
        // Two clicks (or tabs) asking for the same plan within a window get the same session, not two subscriptions: the
        // idempotency key and the parameters (expiry included) are the window's. Another plan gets its own session; a
        // second subscription that comes of it is cancelled and refunded (duplicate, see the event processor).
        val window = clock.instant().epochSecond / BILLING_WINDOW.seconds
        // Stripe wants at least 30 minutes: the margin covers the request's time on the way and a clock a little ahead.
        val expiresAt = Instant.ofEpochSecond((window + 2) * BILLING_WINDOW.seconds).plus(BILLING_EXPIRY_MARGIN)
        // The subscription state too: a checkout finished (or a plan ended) within the window starts a new session.
        val state = "${business.stripeSubscriptionId ?: "none"}-${business.planStatus ?: "none"}"
        val key = "bookanything-billing-${business.id}-${plan.wire}-$price-$window-$state-${returnUrl.hashCode().toUInt()}"
        val session = gateway.createCheckoutSession(
            billingCheckoutParams(business, customerId, plan, price, returnUrl, expiresAt),
            RequestOptions.builder().setIdempotencyKey(key).build(),
        )
        return BillingSession(session.url ?: throw Errors.providerError(), created)
    }

    override fun currentSubscription(subscriptionId: String): StripeSubscription? = gateway.retrieveSubscription(subscriptionId)

    override fun cancelDuplicateSubscription(subscriptionId: String): Boolean = try {
        gateway.cancelSubscription(subscriptionId, "bookanything-duplicate-cancel-$subscriptionId")
        true
    } catch (e: StripeRefusedException) {
        log.warn("cancelling duplicate subscription {} refused: {}", subscriptionId, e.stripeCode)
        false
    }

    override fun refundDuplicateSubscription(subscriptionId: String, latestInvoice: String?, lastAttempt: Boolean): DuplicateCancel {
        // Each payment once: idempotency keys, and Stripe refusing a second refund of a refunded charge.
        val unlisted = DuplicateCancel(cancelled = true, notRefunded = listOfNotNull(latestInvoice))
        val payments = try {
            latestInvoice?.let(gateway::invoicePayments).orEmpty()
        } catch (e: StripeRefusedException) {
            log.warn("listing the payments of duplicate subscription {} refused: {}", subscriptionId, e.stripeCode)
            return unlisted
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Unreachable: retried, then reported.
            if (!lastAttempt) throw e
            log.warn("listing the payments of duplicate subscription {} failed: {}", subscriptionId, e.message)
            return unlisted
        }
        val (refunded, refused) = payments.partition { refundDuplicatePayment(subscriptionId, it, lastAttempt) }
        return DuplicateCancel(
            cancelled = true,
            refunded = refunded.groupBy { it.currency.uppercase() }.mapValues { (_, p) -> p.sumOf { it.amountPaid } },
            notRefunded = refused.map { it.paymentIntent },
        )
    }

    /** Refunds one payment of a cancelled duplicate subscription; false when Stripe refused it (or stayed unreachable). */
    private fun refundDuplicatePayment(subscriptionId: String, payment: StripeInvoicePayment, lastAttempt: Boolean): Boolean = try {
        gateway.createRefund(
            RefundCreateParams.builder()
                .setPaymentIntent(payment.paymentIntent)
                .putMetadata("subscription", subscriptionId)
                .putMetadata("reason", "duplicate_subscription")
                .build(),
            RequestOptions.builder().setIdempotencyKey("bookanything-duplicate-refund-${payment.paymentIntent}").build(),
        )
        true
    } catch (e: StripeRefusedException) {
        log.warn("refunding duplicate subscription payment {} refused: {}", payment.paymentIntent, e.stripeCode)
        // Refunded already (by an earlier attempt, or from the Stripe dashboard): the money is back.
        e.stripeCode in RefundSettlement.ALREADY_REFUNDED
    } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Unreachable: the job retries, then reports it.
        if (!lastAttempt) throw e
        log.warn("refunding duplicate subscription payment {} failed: {}", payment.paymentIntent, e.message)
        false
    }

    override fun createBillingPortal(business: BusinessRow, returnUrl: String): String {
        val customerId = business.stripeCustomerId
            ?: throw Errors.conflict("There is no billing account yet. Choose a plan first.")
        return gateway.createPortalSession(PortalSessionCreateParams.builder().setCustomer(customerId).setReturnUrl(returnUrl).build())
    }

    companion object {
        const val MIN_HOLD_MINUTES = 31

        /**
         * A Stripe refund status as an outcome. Only "failed" and "canceled" are failures: "pending", "requires_action" (or a
         * status Stripe adds) are accepted and count towards the charge's `amount_refunded`, and Stripe reports a later
         * failure with `refund.updated`.
         */
        fun refundOutcome(status: String?): RefundOutcome = when (status) {
            "succeeded" -> RefundOutcome.SUCCEEDED
            "failed", "canceled" -> RefundOutcome.FAILED
            else -> RefundOutcome.PENDING
        }
        const val OAUTH_AUTHORIZE_URL = "https://connect.stripe.com/oauth/authorize"

        /** Plan checkouts asked for within one window share a session; each lives 32 to 62 minutes. */
        val BILLING_WINDOW: Duration = Duration.ofMinutes(30)
        private val BILLING_EXPIRY_MARGIN: Duration = Duration.ofMinutes(2)

        /** Stripe keeps idempotency keys for 24 hours: the generation makes the key new once the last account was forgotten. */
        fun accountIdempotencyKey(business: BusinessRow) =
            "bookanything-account-${business.id}" + if (business.stripeAccountGeneration > 0) "-${business.stripeAccountGeneration}" else ""

        private fun enc(s: String) = java.net.URLEncoder.encode(s, Charsets.UTF_8)

        fun withQuery(url: String, query: String): String {
            val (base, fragment) = url.split('#', limit = 2).let { it[0] to it.getOrNull(1) }
            val sep = if (base.contains('?')) "&" else "?"
            return base + sep + query + fragment?.let { "#$it" }.orEmpty()
        }
    }
}

/** Stripe's length limits for a product name and a PaymentIntent description. */
private const val STRIPE_PRODUCT_NAME_MAX = 250
private const val STRIPE_DESCRIPTION_MAX = 500
