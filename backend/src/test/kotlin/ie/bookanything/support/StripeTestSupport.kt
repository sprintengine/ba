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
import ie.bookanything.payments.StripeRefundRef
import ie.bookanything.payments.StripeSessionRef
import java.util.Locale
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

    var accountState = StripeAccountState("acct_fake", chargesEnabled = true, detailsSubmitted = true)

    /** Number of upcoming refund calls that fail like a Stripe outage. */
    val failRefunds = AtomicInteger(0)
    var refundStatus = "succeeded"

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
        accounts.add(Call(params, options)); return "acct_new_${seq.incrementAndGet()}"
    }
    override fun retrieveAccount(accountId: String) = accountState.copy(id = accountId)
    override fun createAccountLink(params: AccountLinkCreateParams): String {
        accountLinks.add(params); return "https://connect.stripe.test/setup/${params.account}"
    }
    override fun createCheckoutSession(params: SessionCreateParams, options: RequestOptions): StripeSessionRef {
        pass()
        if (failCheckouts.getAndUpdate { if (it > 0) it - 1 else 0 } > 0) throw Errors.providerError()
        sessions.add(Call(params, options))
        val id = "cs_test_${seq.incrementAndGet()}"
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
        refunds.add(Call(params, options))
        return StripeRefundRef("re_${seq.incrementAndGet()}", refundStatus)
    }
    override fun createCustomer(params: CustomerCreateParams, options: RequestOptions): String {
        customers.add(Call(params, options)); return "cus_${seq.incrementAndGet()}"
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
    val config = StripeConfig("sk_test_fake", WEBHOOK_SECRET, CONNECT_SECRET, "price_pro_test", "price_business_test")

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
