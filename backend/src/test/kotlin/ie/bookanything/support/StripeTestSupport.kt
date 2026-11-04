package ie.bookanything.support

import com.stripe.net.RequestOptions
import com.stripe.param.AccountCreateParams
import com.stripe.param.AccountLinkCreateParams
import com.stripe.param.CustomerCreateParams
import com.stripe.param.RefundCreateParams
import com.stripe.param.billing.MeterEventCreateParams
import com.stripe.param.checkout.SessionCreateParams
import ie.bookanything.config.StripeConfig
import ie.bookanything.http.Errors
import ie.bookanything.payments.StripeAccountState
import ie.bookanything.payments.StripeGateway
import ie.bookanything.payments.StripeOAuthConnection
import ie.bookanything.payments.StripeOAuthError
import ie.bookanything.payments.StripeRefundRef
import ie.bookanything.payments.StripeRefusedException
import ie.bookanything.payments.StripeSessionRef
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import com.stripe.param.billingportal.SessionCreateParams as PortalSessionCreateParams

/** Records every Stripe call; no network. */
class FakeStripeGateway : StripeGateway {
    data class Call<P>(val params: P, val options: RequestOptions?)

    val accounts = CopyOnWriteArrayList<Call<AccountCreateParams>>()
    val accountLinks = CopyOnWriteArrayList<AccountLinkCreateParams>()
    val sessions = CopyOnWriteArrayList<Call<SessionCreateParams>>()
    val refunds = CopyOnWriteArrayList<Call<RefundCreateParams>>()
    val customers = CopyOnWriteArrayList<Call<CustomerCreateParams>>()
    val portals = CopyOnWriteArrayList<PortalSessionCreateParams>()
    val meterEvents = CopyOnWriteArrayList<MeterEventCreateParams>()
    val expired = CopyOnWriteArrayList<Call<String>>()

    /** Checkout Session statuses a test has set ("complete", "expired"); others are "open". */
    val sessionStatus = ConcurrentHashMap<String, String>()
    private val seq = AtomicInteger(0)

    /** Ids unique across gateways (and so across tests, which share the database), as Stripe's are. */
    private val run = UUID.randomUUID().toString().take(8)
    private fun next() = "${run}_${seq.incrementAndGet()}"

    var accountState = StripeAccountState("acct_fake", chargesEnabled = true, detailsSubmitted = true)

    /** Per-account states a test has set (country, currency); others are [accountState]. */
    val accountStates = ConcurrentHashMap<String, StripeAccountState>()

    /** Connect OAuth: the account each authorization code connects. A code works once, as at Stripe. */
    val oauthCodes = ConcurrentHashMap<String, String>()
    val oauthExchanges = CopyOnWriteArrayList<String>()

    /** Accounts deauthorized, as (client id, account id); [connectedAccounts] are those still connected by OAuth. */
    val deauthorized = CopyOnWriteArrayList<Pair<String, String>>()
    val connectedAccounts: MutableSet<String> = ConcurrentHashMap.newKeySet()

    /** Gives [account] an authorization code, as Stripe's OAuth page does once its owner allows the connection. */
    fun authorize(account: String, code: String = "ac_${next()}"): String {
        oauthCodes[code] = account
        return code
    }

    /** Number of upcoming refund calls that fail like a Stripe outage. */
    val failRefunds = AtomicInteger(0)

    /** Number of upcoming refund calls Stripe refuses for good (as for a charge on an account we can no longer reach). */
    val refuseRefunds = AtomicInteger(0)
    var refusalCode = "account_invalid"
    var refundStatus = "succeeded"
    var refundFailureReason: String? = null

    /** Number of upcoming checkout creations that fail like a Stripe outage. */
    val failCheckouts = AtomicInteger(0)

    /**
     * A slow Stripe: while set, checkout creations and refunds wait on it (up to 30 s) after signalling [entered], so a
     * test can act while a request is inside the Stripe call.
     */
    @Volatile var gate: CountDownLatch? = null
    val entered = Semaphore(0)

    private fun pass() {
        val g = gate ?: return
        entered.release()
        g.await(GATE_SECONDS, TimeUnit.SECONDS)
    }

    override fun createAccount(params: AccountCreateParams, options: RequestOptions): String {
        accounts.add(Call(params, options)); return "acct_new_${next()}"
    }

    /** Number of upcoming account reads that fail like a Stripe outage. */
    val failAccountReads = AtomicInteger(0)

    override fun retrieveAccount(accountId: String): StripeAccountState {
        if (failAccountReads.getAndUpdate { if (it > 0) it - 1 else 0 } > 0) throw Errors.providerError()
        return accountStates[accountId] ?: accountState.copy(id = accountId)
    }
    override fun exchangeOAuthCode(code: String): StripeOAuthConnection {
        oauthExchanges.add(code)
        val account = oauthCodes.remove(code) ?: throw StripeOAuthError("invalid_grant")
        connectedAccounts.add(account)
        return StripeOAuthConnection(account, livemode = false)
    }
    override fun deauthorizeAccount(clientId: String, accountId: String): Boolean {
        deauthorized.add(clientId to accountId)
        return connectedAccounts.remove(accountId)
    }
    override fun createAccountLink(params: AccountLinkCreateParams): String {
        accountLinks.add(params); return "https://connect.stripe.test/setup/${params.account}"
    }
    override fun createCheckoutSession(params: SessionCreateParams, options: RequestOptions): StripeSessionRef {
        pass()
        if (failCheckouts.getAndUpdate { if (it > 0) it - 1 else 0 } > 0) throw Errors.providerError()
        sessions.add(Call(params, options))
        val id = "cs_test_${next()}"
        return StripeSessionRef(id, "https://checkout.stripe.test/c/pay/$id", null)
    }
    override fun retrieveCheckoutSession(sessionId: String, options: RequestOptions) =
        StripeSessionRef(sessionId, null, "pi_for_$sessionId", sessionStatus[sessionId] ?: "open")
    override fun expireCheckoutSession(sessionId: String, options: RequestOptions): StripeSessionRef {
        expired.add(Call(sessionId, options))
        sessionStatus[sessionId] = "expired"
        return StripeSessionRef(sessionId, null, null, "expired")
    }
    override fun createRefund(params: RefundCreateParams, options: RequestOptions): StripeRefundRef {
        pass()
        if (failRefunds.getAndUpdate { if (it > 0) it - 1 else 0 } > 0) throw Errors.providerError()
        if (refuseRefunds.getAndUpdate { if (it > 0) it - 1 else 0 } > 0) throw StripeRefusedException(refusalCode)
        refunds.add(Call(params, options))
        return StripeRefundRef("re_${next()}", refundStatus, refundFailureReason)
    }
    override fun createCustomer(params: CustomerCreateParams, options: RequestOptions): String {
        customers.add(Call(params, options)); return "cus_${next()}"
    }
    override fun createPortalSession(params: PortalSessionCreateParams): String {
        portals.add(params); return "https://billing.stripe.test/p/session/${params.customer}"
    }
    override fun createMeterEvent(params: MeterEventCreateParams) {
        meterEvents.add(params)
    }
}

object StripeTest {
    const val WEBHOOK_SECRET = "whsec_test_platform_secret"
    const val CONNECT_SECRET = "whsec_test_connect_secret"
    const val CLIENT_ID = "ca_test_platform"
    val config = StripeConfig(
        "sk_test_fake", WEBHOOK_SECRET, CONNECT_SECRET, "price_pro_test", "price_business_test", connectClientId = CLIENT_ID,
    )

    /** A `Stripe-Signature` header exactly as Stripe computes it (HMAC-SHA256 over "t.payload"). */
    fun signature(payload: String, secret: String = WEBHOOK_SECRET, timestamp: Long = System.currentTimeMillis() / 1000): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(), "HmacSHA256"))
        val hex = mac.doFinal("$timestamp.$payload".toByteArray()).joinToString("") { "%02x".format(Locale.ROOT, it) }
        return "t=$timestamp,v1=$hex"
    }

    private val eventSeq = AtomicInteger(0)

    fun event(
        type: String, obj: Map<String, Any?>, account: String? = null,
        id: String = "evt_test_${System.nanoTime()}_${eventSeq.incrementAndGet()}",
    ): String =
        jsonOf(
            "id" to id, "object" to "event", "api_version" to "2025-09-30.clover", "created" to System.currentTimeMillis() / 1000,
            "type" to type, "account" to account, "livemode" to false, "pending_webhooks" to 1,
            "data" to mapOf("object" to obj),
        )
}

/** How long a request waits inside a gated (slow) fake Stripe call at most. */
private const val GATE_SECONDS = 30L
