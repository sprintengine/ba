package ie.bookanything.support

import ie.bookanything.config.StripeConfig
import ie.bookanything.jobs.JobWorker
import ie.bookanything.payments.StripePaymentProvider
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonObject
import java.util.UUID

/**
 * An app wired to Stripe fakes (no network): the gateway records calls, webhooks are signed like Stripe signs them and
 * stored events are applied by [worker]. Connected-account events use [StripeTest.CONNECT_SECRET], platform (billing)
 * events [StripeTest.WEBHOOK_SECRET].
 */
class StripeWorld(val clock: MutableClock = MutableClock(DEFAULT_NOW), config: StripeConfig = StripeTest.config) {
    val gateway = FakeStripeGateway()
    val provider = StripePaymentProvider(gateway, config, clock)
    val env = TestEnv(clock, TestConfig.config(stripe = config), payments = provider)
    val worker = JobWorker(env.ctx)

    /** Gives [clinic] a connected account that can take charges; returns its id. */
    fun connect(clinic: Clinic, account: String = "acct_${UUID.randomUUID().toString().take(8)}", method: String = "created"): String {
        Fixtures.sql(
            "UPDATE businesses SET stripe_account_id = ?, stripe_connect_method = ?, stripe_connected_at = now(), " +
                "stripe_charges_enabled = true, stripe_details_submitted = true WHERE id = ?",
            account, method, UUID.fromString(clinic.id),
        )
        return account
    }

    suspend fun post(api: Api, payload: String, secret: String = StripeTest.CONNECT_SECRET): HttpResponse =
        api.client.post("/v1/webhooks/stripe") {
            header("Stripe-Signature", StripeTest.signature(payload, secret, clock.instant().epochSecond))
            contentType(ContentType.Application.Json)
            setBody(payload)
        }

    suspend fun send(api: Api, payload: String, secret: String = StripeTest.CONNECT_SECRET): JsonObject =
        post(api, payload, secret).also { assertStatus(HttpStatusCode.OK, it) }.obj()

    /** The latest charge of a booking: (payment id, provider reference, status). */
    fun charge(bookingId: String): Triple<String, String?, String> = Fixtures.sqlOne(
        "SELECT id, provider_ref, status::text AS status FROM payments WHERE booking_id = ? AND kind = 'charge' " +
            "ORDER BY created_at DESC LIMIT 1",
        UUID.fromString(bookingId),
    ) { Triple(it.getObject("id").toString(), it.getString("provider_ref"), it.getString("status")) }!!

    /** A paid `checkout.session.completed` for the booking's charge, from [account]. */
    fun sessionCompleted(
        bookingId: String, account: String?, amount: Int, paymentIntent: String, currency: String = "eur",
        type: String = "checkout.session.completed", id: String? = null,
    ): String {
        val (paymentId, sessionId, _) = charge(bookingId)
        val session = mapOf(
            "id" to sessionId, "object" to "checkout.session", "mode" to "payment", "payment_status" to "paid", "status" to "complete",
            "amount_total" to amount, "currency" to currency, "payment_intent" to paymentIntent,
            "metadata" to mapOf("paymentId" to paymentId, "bookingId" to bookingId),
        )
        return if (id == null) StripeTest.event(type, session, account) else StripeTest.event(type, session, account, id)
    }

    /** A platform subscription event for [customer] on [price] (metadata names no business: the customer must match). */
    fun subscription(
        type: String, subscriptionId: String, customer: String, status: String, price: String, metadata: Map<String, String> = emptyMap(),
    ): String = StripeTest.event(
        type,
        mapOf(
            "id" to subscriptionId, "object" to "subscription", "customer" to customer, "status" to status, "metadata" to metadata,
            "items" to mapOf("object" to "list", "data" to listOf(mapOf("id" to "si_$subscriptionId", "price" to mapOf("id" to price)))),
        ),
    )
}
