package ie.bookanything.support

import ie.bookanything.payments.CheckoutRequest
import ie.bookanything.payments.CheckoutSession
import ie.bookanything.payments.DevPaymentProvider
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.payments.RefundRequest
import ie.bookanything.payments.RefundResult
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The development payment provider (its `/dev-payments` checkout keeps working) that records every checkout and refund
 * it is asked for, so tests can check the amount that actually reaches the provider.
 */
class RecordingPaymentProvider(
    private val delegate: PaymentProvider = DevPaymentProvider("http://localhost:3000"),
) : PaymentProvider by delegate {
    val checkouts = CopyOnWriteArrayList<CheckoutRequest>()
    val refunds = CopyOnWriteArrayList<RefundRequest>()

    override fun createCheckout(request: CheckoutRequest): CheckoutSession = delegate.createCheckout(request).also { checkouts += request }
    override fun refund(request: RefundRequest): RefundResult = delegate.refund(request).also { refunds += request }

    /** What the provider was asked to charge for [bookingId] (one checkout per booking). */
    fun chargedFor(bookingId: String): Int = checkouts.single { it.bookingId.toString() == bookingId }.amountCents
}

/** Money helpers over the public API: book with options and add-ons, pay through the dev checkout, read the ledger. */
object Money {
    /** A public booking request with an option and add-ons ([Fixtures.bookingBody] sends neither). */
    fun bookingBody(
        clinic: Clinic, service: String, start: String, optionId: String? = null, addonIds: List<String> = emptyList(),
        email: String = "${unique("guest")}@example.test", resourceId: String? = null,
    ): String = jsonOf(
        "serviceId" to clinic.service(service), "optionId" to optionId, "addonIds" to addonIds, "resourceId" to resourceId,
        "start" to start, "customer" to mapOf("name" to "Jordan Casey", "email" to email, "phone" to null),
        "answers" to emptyMap<String, String>(),
    )

    suspend fun book(
        api: Api, clinic: Clinic, service: String, start: String, optionId: String? = null, addonIds: List<String> = emptyList(),
        email: String = "${unique("guest")}@example.test", resourceId: String? = null,
    ): JsonObject {
        val body = bookingBody(clinic, service, start, optionId, addonIds, email, resourceId)
        val res: HttpResponse = api.post("${clinic.public}/bookings", body)
        assertStatus(HttpStatusCode.Created, res)
        return res.obj()
    }

    /** The dev checkout's payment id from a booking result's checkout link. */
    fun paymentId(result: JsonObject): String = result["next"]!!.s("checkoutUrl").substringAfterLast('/')

    /** Completes the dev checkout of [result] ("succeeded" or "cancelled"). */
    suspend fun pay(api: Api, result: JsonObject, outcome: String = "succeeded") {
        assertStatus(
            HttpStatusCode.OK, api.post("/v1/public/dev-payments/${paymentId(result)}/complete", jsonOf("outcome" to outcome)),
        )
    }

    /** Books [service] at [start] and pays for it; returns the booking result (with its manage token). */
    suspend fun paidBooking(
        api: Api, clinic: Clinic, service: String, start: String, email: String = "${unique("payer")}@example.test",
    ): JsonObject =
        book(api, clinic, service, start, email = email).also { pay(api, it) }

    /** The booking as its customer sees it on the manage link. */
    suspend fun view(api: Api, result: JsonObject): JsonObject = api.get("/v1/public/manage/${result.s("manageToken")}").obj()

    fun bookingId(result: JsonObject): String = result["booking"]!!.s("id")

    /** A booking's status and money in one line: "confirmed paid, paid 5000, refunded 0". */
    fun state(booking: JsonObject): String =
        "${booking.s("status")} ${booking.s("paymentStatus")}, " +
            "paid ${booking.i("amountPaidCents")}, refunded ${booking.i("amountRefundedCents")}"

    /** The booking's payment ledger in order, one "kind status amount" line per row. */
    fun ledger(bookingId: String): List<String> = Fixtures.sqlAll(
        "SELECT kind || ' ' || status || ' ' || amount_cents FROM payments WHERE booking_id = ? ORDER BY created_at, kind, amount_cents",
        bookingId,
    )

    /** A service as the public booking flow lists it (with its options' and add-ons' ids). */
    suspend fun catalog(api: Api, clinic: Clinic, service: String): JsonObject =
        api.get("${clinic.public}/services").arr().single { it.s("name") == service }.o

    /** Ids of [service]'s options (or add-ons, [kind] = "addons") by name. */
    suspend fun ids(api: Api, clinic: Clinic, service: String, kind: String = "options"): Map<String, String> =
        catalog(api, clinic, service)[kind]!!.jsonArray.associate { it.s("name") to it.s("id") }
}
