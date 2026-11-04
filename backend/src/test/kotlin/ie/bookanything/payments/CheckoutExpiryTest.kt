package ie.bookanything.payments

import ie.bookanything.support.FakeStripeGateway
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.StripeTest
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.assertStatus
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonNull
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Cancelling a booking held for payment closes its Stripe Checkout, so it can't be paid any more (finding PAY-12). */
class CheckoutExpiryTest {
    private fun at(time: String) = "2026-10-07T$time:00+01:00"

    @Test
    fun `only an open session is expired, on the business's connected account`() {
        val gateway = FakeStripeGateway()
        val provider = StripePaymentProvider(gateway, StripeTest.config)
        val business = sampleBusiness().copy(stripeAccountId = "acct_77", stripeChargesEnabled = true)
        provider.expireCheckout(business, "cs_open")
        assertEquals(listOf("cs_open"), gateway.expired.map { it.params })
        assertEquals("acct_77", gateway.expired.single().options!!.stripeAccount)

        gateway.sessionStatus["cs_paid"] = "complete"
        provider.expireCheckout(business, "cs_paid") // paid meanwhile: the late payment is refunded instead
        provider.expireCheckout(business, "cs_open") // already expired
        provider.expireCheckout(business, "pi_123") // a charge known by its PaymentIntent has no session left
        provider.expireCheckout(business.copy(stripeAccountId = null), "cs_other")
        assertEquals(1, gateway.expired.size)
    }

    @Test
    fun `cancelling a held booking expires its checkout after the commit`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", at("10:00"))
            val (_, sessionId, _) = s.charge(Money.bookingId(held))
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${held.s("manageToken")}/cancel"))
            assertTrue(s.gateway.expired.isEmpty(), "not inside the cancellation")
            s.worker.drain()
            assertEquals(listOf(sessionId), s.gateway.expired.map { it.params })
            assertEquals(account, s.gateway.expired.single().options!!.stripeAccount)

            // A paid booking's cancellation has no checkout to close.
            val paid = Fixtures.book(api, clinic, "Paid consult", at("12:00"))
            s.send(api, s.sessionCompleted(Money.bookingId(paid), account, 5000, "pi_${unique("paid")}"))
            s.worker.drain()
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${paid.s("manageToken")}/cancel"))
            s.worker.drain()
            assertEquals(1, s.gateway.expired.size)
        }
    }

    @Test
    fun `a booking cancelled while its checkout was being created gets that checkout expired`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            s.connect(clinic)
            val gate = CountDownLatch(1)
            s.gateway.gate = gate
            val email = "${unique("cancelled.early")}@example.test"
            try {
                coroutineScope {
                    val booking = async(Dispatchers.IO) {
                        api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Paid consult", at("14:00"), email = email))
                    }
                    assertTrue(s.gateway.entered.tryAcquire(30, TimeUnit.SECONDS))
                    val id = Fixtures.sqlOne(
                        "SELECT b.id FROM bookings b JOIN customers c ON c.id = b.customer_id WHERE c.email = ?", email,
                    ) { it.getObject(1).toString() }!!
                    // Staff cancel it while Stripe is still creating the session (the hold is committed, so they can).
                    assertStatus(HttpStatusCode.OK, api.post("${clinic.base}/bookings/$id/cancel", "{}", clinic.owner.token))
                    gate.countDown()
                    val created = booking.await()
                    assertStatus(HttpStatusCode.Created, created)
                    val body = created.obj()
                    assertEquals("cancelled", body["booking"]!!.o.s("status"))
                    assertEquals("cancelled", body["next"]!!.o.s("type"))
                    val link = body["next"]!!.o["checkoutUrl"]
                    assertTrue(link == null || link == JsonNull, "no link to pay a cancelled booking: $link")
                    s.worker.drain()
                    val sessionId = s.charge(id).second
                    assertEquals(listOf(sessionId), s.gateway.expired.map { it.params })
                }
            } finally {
                gate.countDown()
            }
        }
    }
}
