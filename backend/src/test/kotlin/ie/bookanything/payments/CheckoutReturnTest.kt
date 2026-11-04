package ie.bookanything.payments

import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.FakeStripeGateway
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.MutableClock
import ie.bookanything.support.StripeTest
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Back from Checkout, and holds that end unpaid (docs/architecture.md section 7): the customer's page confirms the
 * payment with Stripe instead of waiting for the webhook (one path, once); a hold lasts as long as its checkout; an
 * unpaid hold owes nothing and a failed delayed payment says so. Thursday 8 October 2026, Dublin.
 */
class CheckoutReturnTest {
    private fun at(time: String) = "2026-10-08T$time:00+01:00"

    private fun bookingRow(bookingId: String): List<String> = Fixtures.sqlOne(
        "SELECT status::text AS status, payment_status::text AS payment FROM bookings WHERE id = ?", UUID.fromString(bookingId),
    ) { listOf(it.getString("status"), it.getString("payment")) }!!

    @Test
    fun `the return confirms a paid checkout before the webhook, and the webhook then changes nothing`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val email = "${unique("back")}@example.test"
            val held = Fixtures.book(api, clinic, "Paid consult", at("10:00"), email = email)
            val bookingId = Money.bookingId(held)
            val (_, session, _) = s.charge(bookingId)
            val confirm = "/v1/public/manage/${held.s("manageToken")}/payment/confirm"

            // Not paid yet: nothing changes.
            assertEquals("held", api.post(confirm, jsonOf("sessionId" to session)).obj().s("status"))

            s.gateway.pay(session!!, 5000, paymentIntent = "pi_back_${bookingId.take(8)}")
            val view = api.post(confirm, jsonOf("sessionId" to session)).obj()
            assertEquals(listOf("confirmed", "5000"), listOf(view.s("status"), view.i("amountPaidCents").toString()))
            assertEquals(account, s.gateway.sessions.single().options!!.stripeAccount)
            assertEquals(listOf("charge succeeded 5000"), Money.ledger(bookingId))

            // The webhook, and the page asking again: already done.
            s.send(api, s.sessionCompleted(bookingId, account, 5000, "pi_back_${bookingId.take(8)}"))
            s.worker.drain()
            assertStatus(HttpStatusCode.OK, api.post(confirm, jsonOf("sessionId" to session)))
            assertEquals(listOf("charge succeeded 5000"), Money.ledger(bookingId))
            assertEquals(1, s.env.email.sent.count { it.to == email && it.template == "booking_confirmed" })
        }
    }

    @Test
    fun `only the booking's own checkout is confirmed`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            s.connect(clinic)
            val mine = Fixtures.book(api, clinic, "Paid consult", at("10:00"))
            val other = Fixtures.book(api, clinic, "Paid consult", at("11:00"))
            val (_, otherSession, _) = s.charge(Money.bookingId(other))
            s.gateway.pay(otherSession!!, 5000)
            val confirm = "/v1/public/manage/${mine.s("manageToken")}/payment/confirm"
            assertEquals("held", api.post(confirm, jsonOf("sessionId" to otherSession)).obj().s("status"))
            assertEquals("held", Money.view(api, other).s("status"), "someone else's page can't confirm it either")
            assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.post(confirm, jsonOf("sessionId" to "pi_nope")))
            assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.post(confirm, "{}"))
        }
    }

    @Test
    fun `a paid checkout for another amount is refunded on return too, once`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", at("12:00"))
            val (_, session, _) = s.charge(Money.bookingId(held))
            s.gateway.pay(session!!, 4000, paymentIntent = "pi_short_return")
            api.post("/v1/public/manage/${held.s("manageToken")}/payment/confirm", jsonOf("sessionId" to session))
            s.send(api, s.sessionCompleted(Money.bookingId(held), account, 4000, "pi_short_return"))
            s.worker.drain()
            assertEquals(listOf("pi_short_return"), s.gateway.refunds.map { it.params.paymentIntent })
            assertEquals("held", Money.view(api, held).s("status"))
        }
    }

    @Test
    fun `a hold lasts as long as its checkout`() {
        // The checkout is created ten minutes after the hold began (a slow or replayed request): Stripe keeps it open at
        // least 30 minutes from then, past the hold's own end.
        val clock = MutableClock(DEFAULT_NOW)
        val gateway = FakeStripeGateway()
        val provider = StripePaymentProvider(gateway, StripeTest.config, MutableClock(DEFAULT_NOW.plus(Duration.ofMinutes(10))))
        val env = TestEnv(clock, TestConfig.config(stripe = StripeTest.config), payments = provider)
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            Fixtures.sql(
                "UPDATE businesses SET stripe_account_id = ?, stripe_charges_enabled = true WHERE id = ?",
                "acct_${unique("late")}", UUID.fromString(clinic.id),
            )
            val held = Fixtures.book(api, clinic, "Paid consult", at("14:00"))
            val closes = Instant.ofEpochSecond(gateway.sessions.single().params.expiresAt!!)
            val hold = Fixtures.sqlOne("SELECT hold_expires_at FROM bookings WHERE id = ?", UUID.fromString(Money.bookingId(held))) {
                it.getTimestamp(1).toInstant()
            }!!
            assertEquals(closes, hold, "held until the checkout closes")
            assertTrue(Duration.between(DEFAULT_NOW, hold) > Duration.ofMinutes(31))
        }
    }

    @Test
    fun `an unpaid hold owes nothing, and a delayed payment that fails says so`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            // Expired by time.
            val lapsed = Fixtures.book(api, clinic, "Paid consult", at("15:00"))
            s.clock.advanceMinutes(40)
            s.env.ctx.db.txBlocking { s.env.ctx.booking.lifecycle.expireHolds(it, s.clock.instant()) }
            assertEquals(listOf("expired", "not_required"), bookingRow(Money.bookingId(lapsed)))

            // A bank debit that failed after the checkout completed (hold still running).
            val debit = Fixtures.book(api, clinic, "Paid consult", at("16:00"))
            val (paymentId, session, _) = s.charge(Money.bookingId(debit))
            val failed = mapOf(
                "id" to session, "object" to "checkout.session", "mode" to "payment", "payment_status" to "unpaid",
                "metadata" to mapOf("paymentId" to paymentId, "bookingId" to Money.bookingId(debit)),
            )
            s.send(api, StripeTest.event("checkout.session.async_payment_failed", failed, account))
            s.worker.drain()
            assertEquals(listOf("expired", "failed"), bookingRow(Money.bookingId(debit)))
            assertEquals(listOf("charge failed 5000"), Money.ledger(Money.bookingId(debit)))
        }
    }

    @Test
    fun `confirming is best effort and only for a booking still held`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", at("16:00"))
            val bookingId = Money.bookingId(held)
            val (_, session, _) = s.charge(bookingId)
            val confirm = "/v1/public/manage/${held.s("manageToken")}/payment/confirm"
            // Stripe can't be asked: the booking as it is, no error (the webhook confirms it).
            s.gateway.pay(session!!, 5000)
            s.gateway.refuseSessionReads.set(1)
            val res = api.post(confirm, jsonOf("sessionId" to session))
            assertStatus(HttpStatusCode.OK, res)
            assertEquals("held", res.obj().s("status"))
            // Confirmed by the webhook: asking again doesn't call Stripe.
            s.send(api, s.sessionCompleted(bookingId, account, 5000, "pi_for_$session"))
            s.worker.drain()
            val reads = s.gateway.sessionReads.size
            assertEquals("confirmed", api.post(confirm, jsonOf("sessionId" to session)).obj().s("status"))
            assertEquals(reads, s.gateway.sessionReads.size)
        }
    }

    @Test
    fun `a late payment brings an expired hold back as paid, and a late failed debit says so`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val late = Fixtures.book(api, clinic, "Paid consult", at("10:00"))
            val debit = Fixtures.book(api, clinic, "Paid consult", at("11:00"))
            s.clock.advanceMinutes(40)
            s.env.ctx.db.txBlocking { s.env.ctx.booking.lifecycle.expireHolds(it, s.clock.instant()) }
            assertEquals(listOf("expired", "not_required"), bookingRow(Money.bookingId(late)))
            s.send(api, s.sessionCompleted(Money.bookingId(late), account, 5000, "pi_${unique("late")}"))
            s.worker.drain()
            assertEquals(listOf("confirmed", "paid"), bookingRow(Money.bookingId(late)))

            val (paymentId, session, _) = s.charge(Money.bookingId(debit))
            val failed = mapOf(
                "id" to session, "object" to "checkout.session", "mode" to "payment", "payment_status" to "unpaid",
                "metadata" to mapOf("paymentId" to paymentId, "bookingId" to Money.bookingId(debit)),
            )
            s.send(api, StripeTest.event("checkout.session.async_payment_failed", failed, account))
            s.worker.drain()
            assertEquals(listOf("expired", "failed"), bookingRow(Money.bookingId(debit)))
            assertEquals(listOf("charge failed 5000"), Money.ledger(Money.bookingId(debit)))
        }
    }
}
