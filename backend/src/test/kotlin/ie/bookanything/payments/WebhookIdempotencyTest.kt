package ie.bookanything.payments

import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.i
import ie.bookanything.support.inParallel
import ie.bookanything.support.jsonOf
import ie.bookanything.support.race
import ie.bookanything.support.runTask
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Paying exactly once: duplicate and concurrent webhook deliveries, several workers, two events for one checkout, the
 * development checkout clicked twice, payments that arrive after the hold, and checkouts that don't match the charge.
 * Now is Monday 5 October 2026, 09:00 in Dublin.
 */
class WebhookIdempotencyTest {
    private val wed = "2026-10-07"

    private fun count(sql: String, vararg params: Any?): Int = Fixtures.sqlOne(sql, *params) { it.getInt(1) }!!

    private fun succeededPayments(bookingId: String) =
        count("SELECT count(*) FROM audit_events WHERE entity_id = ? AND action = 'payment.succeeded'", bookingId)

    @Test
    fun `the same event delivered concurrently is stored once and applied once by concurrent workers`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val email = "${unique("dup")}@example.test"
            val held = Fixtures.book(api, clinic, "Paid consult", "${wed}T10:00:00+01:00", email = email)
            val bookingId = Money.bookingId(held)
            val event = s.sessionCompleted(bookingId, account, 5000, "pi_dup")
            val eventId = Regex("\"id\":\"(evt_[^\"]+)\"").find(event)!!.groupValues[1]

            val deliveries = race(6) { s.post(api, event) }
            assertTrue(deliveries.all { it.status == HttpStatusCode.OK }, deliveries.toString())
            assertEquals(1, deliveries.count { it.body.contains("\"duplicate\":false") }, deliveries.toString())
            assertEquals(1, count("SELECT count(*) FROM jobs WHERE kind = 'stripe_event' AND payload->>'eventId' = ?", eventId))

            // A retried job may run on another worker while the first is still at it.
            repeat(3) { Fixtures.sql("INSERT INTO jobs (kind, payload) VALUES ('stripe_event', ?::jsonb)", "{\"eventId\":\"$eventId\"}") }
            val workers = List(4) { JobWorker(s.env.ctx, batchSize = 1) }
            inParallel(4) { workers[it].drain() }

            val view = Money.view(api, held)
            assertEquals("confirmed paid, paid 5000, refunded 0", Money.state(view))
            assertEquals(listOf("charge succeeded 5000"), Money.ledger(bookingId))
            assertEquals(1, succeededPayments(bookingId))
            assertTrue(s.gateway.refunds.none { it.params.paymentIntent == "pi_dup" })
            JobWorker(s.env.ctx).drain()
            assertEquals(1, s.env.email.sent.count { it.to == email && it.template == "booking_confirmed" })
        }
    }

    @Test
    fun `completed and async-succeeded events for one checkout confirm it once, even processed at the same time`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", "${wed}T11:00:00+01:00")
            val bookingId = Money.bookingId(held)
            val completed = s.sessionCompleted(bookingId, account, 5000, "pi_twice")
            val async = s.sessionCompleted(bookingId, account, 5000, "pi_twice", type = "checkout.session.async_payment_succeeded")
            s.send(api, completed)
            s.send(api, async)
            val workers = List(2) { JobWorker(s.env.ctx, batchSize = 1) }
            inParallel(2) { workers[it].drain() }

            val view = Money.view(api, held)
            assertEquals("confirmed paid, paid 5000, refunded 0", Money.state(view))
            assertEquals(listOf("charge succeeded 5000"), Money.ledger(bookingId))
            assertEquals(1, succeededPayments(bookingId))
        }
    }

    @Test
    fun `the development checkout completed twice at once records one payment`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            repeat(3) { round ->
                val held = Fixtures.book(api, clinic, "Paid consult", "${wed}T1${round + 3}:00:00+01:00")
                val outcomes = race(4) {
                    api.post("/v1/public/dev-payments/${Money.paymentId(held)}/complete", jsonOf("outcome" to "succeeded"))
                }
                assertTrue(outcomes.all { it.status == HttpStatusCode.OK }, outcomes.toString())
                val view = Money.view(api, held)
                assertEquals("confirmed paid, paid 5000, refunded 0", Money.state(view))
                assertEquals(listOf("charge succeeded 5000"), Money.ledger(Money.bookingId(held)))
                assertEquals(1, succeededPayments(Money.bookingId(held)))
            }
        }
    }

    @Test
    fun `a completion read before another one committed is not applied a second time`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val held = Fixtures.book(api, clinic, "Paid consult", "${wed}T09:00:00+01:00")
            val businessId = UUID.fromString(clinic.id)
            val lifecycle = env.ctx.booking.lifecycle
            // Both callers read the pending payment; the first one's completion commits before the second applies its copy.
            val stale = env.db.tx(businessId) { PaymentRepository.get(it, UUID.fromString(Money.paymentId(held)))!! }
            assertStatus(
                HttpStatusCode.OK, api.post("/v1/public/dev-payments/${Money.paymentId(held)}/complete", jsonOf("outcome" to "succeeded")),
            )
            env.db.tx(businessId) { conn ->
                val business = ie.bookanything.business.BusinessRepository.findById(conn, businessId)!!
                lifecycle.paymentSucceeded(conn, business, stale, env.clock.instant())
            }
            val view = Money.view(api, held)
            assertEquals("confirmed paid, paid 5000, refunded 0", Money.state(view))
            assertEquals(listOf("charge succeeded 5000"), Money.ledger(Money.bookingId(held)))
        }
    }

    @Test
    fun `a payment after the hold expired revives the booking while its time is still free`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val alex = clinic.resource("Alex")
            val start = "${wed}T14:00:00+01:00"
            val held = Fixtures.book(api, clinic, "Paid consult", start, resourceId = alex)
            s.clock.advanceMinutes(32)
            s.worker.runTask(s.env.ctx, "expire-holds")
            assertEquals("expired", Money.view(api, held).s("status"))
            // Someone else books the other therapist at the same time: the expired booking's own resource stays free.
            Fixtures.book(api, clinic, "Paid consult", start, resourceId = clinic.resource("Blake"))

            s.send(api, s.sessionCompleted(Money.bookingId(held), account, 5000, "pi_revived"))
            s.worker.drain()
            val view = Money.view(api, held)
            assertEquals("confirmed paid, paid 5000, refunded 0", Money.state(view))
            assertEquals(1, count("SELECT count(*) FROM booking_allocations WHERE booking_id = ? AND active", Money.bookingId(held)))
            assertTrue(start !in Fixtures.slots(api, clinic, "Paid consult", wed, "&resourceId=$alex"))
            assertError(
                HttpStatusCode.Conflict, "SLOT_UNAVAILABLE",
                api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Paid consult", start, resourceId = alex)),
            )
            assertTrue(s.gateway.refunds.isEmpty())
        }
    }

    @Test
    fun `a late payment is refunded in full when the booking was cancelled or its time has passed`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)

            // The customer gave up and cancelled the held booking, then the checkout went through anyway.
            val email = "${unique("changed.mind")}@example.test"
            val cancelled = Fixtures.book(api, clinic, "Paid consult", "${wed}T14:00:00+01:00", email = email)
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${cancelled.s("manageToken")}/cancel"))
            s.send(api, s.sessionCompleted(Money.bookingId(cancelled), account, 5000, "pi_after_cancel"))
            s.worker.drain()
            val afterCancel = Money.view(api, cancelled)
            assertEquals("cancelled refunded, paid 5000, refunded 5000", Money.state(afterCancel))
            assertEquals(listOf("charge succeeded 5000", "refund succeeded 5000"), Money.ledger(Money.bookingId(cancelled)))
            assertEquals("pi_after_cancel", s.gateway.refunds.last().params.paymentIntent)
            assertTrue(s.env.email.sent.any { it.to == email && it.template == "payment_refunded_apology" })

            // The hold expired and the appointment time passed before the money arrived: nothing to revive.
            val soon = Fixtures.book(api, clinic, "Paid consult", "2026-10-05T10:00:00+01:00")
            s.clock.advanceMinutes(90)
            s.worker.runTask(s.env.ctx, "expire-holds")
            s.send(api, s.sessionCompleted(Money.bookingId(soon), account, 5000, "pi_too_late"))
            s.worker.drain()
            val tooLate = Money.view(api, soon)
            assertEquals("cancelled refunded, paid 5000, refunded 5000", Money.state(tooLate))
            assertEquals("system", Fixtures.sqlAll("SELECT cancelled_by::text FROM bookings WHERE id = ?", Money.bookingId(soon)).single())
        }
    }

    @Test
    fun `a checkout only pays for its charge with exactly the amount and currency asked for`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            // (amount, currency, applied)
            val cases =
                listOf(Triple(4999, "eur", false), Triple(5001, "eur", false), Triple(5000, "gbp", false), Triple(5000, "EUR", true))
            cases.forEachIndexed { n, (amount, currency, applied) ->
                val held = Fixtures.book(api, clinic, "Paid consult", "2026-10-08T${10 + n}:00:00+01:00")
                s.send(api, s.sessionCompleted(Money.bookingId(held), account, amount, "pi_case_$n", currency = currency))
                s.worker.drain()
                val view = Money.view(api, held)
                val case = "$amount $currency"
                assertEquals(if (applied) "confirmed" else "held", view.s("status"), case)
                assertEquals(if (applied) 5000 else 0, view.i("amountPaidCents"), case)
                val charge = if (applied) "charge succeeded 5000" else "charge pending 5000"
                assertEquals(listOf(charge), Money.ledger(Money.bookingId(held)), case)
            }

            // An event for a checkout bookanything never created is stored, ignored and marked processed.
            val other = Fixtures.book(api, clinic, "Paid consult", "2026-10-09T10:00:00+01:00")
            val unknown = s.sessionCompleted(Money.bookingId(other), account, 5000, "pi_x")
                .replace(Regex("\"paymentId\":\"[^\"]+\""), "\"paymentId\":\"${UUID.randomUUID()}\"")
                .replace(Regex("\"id\":\"cs_[^\"]+\""), "\"id\":\"cs_unknown\"")
            val unknownId = Regex("\"id\":\"(evt_[^\"]+)\"").find(unknown)!!.groupValues[1]
            s.send(api, unknown)
            s.worker.drain()
            val processed =
                count("SELECT count(*) FROM provider_events WHERE id = ? AND processed_at IS NOT NULL AND error IS NULL", unknownId)
            assertEquals(1, processed)
            assertEquals("held", Money.view(api, other).s("status"))
        }
    }

    @Test
    fun `an expired checkout session releases the hold once and a later payment for it is still honoured`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", "2026-10-09T15:00:00+01:00", resourceId = clinic.resource("Blake"))
            val bookingId = Money.bookingId(held)
            val (paymentId, sessionId, _) = s.charge(bookingId)
            val expired = ie.bookanything.support.StripeTest.event(
                "checkout.session.expired",
                mapOf(
                    "id" to sessionId, "object" to "checkout.session", "mode" to "payment", "status" to "expired",
                    "metadata" to mapOf("paymentId" to paymentId),
                ),
                account,
            )
            s.send(api, expired)
            s.send(api, expired)
            s.worker.drain()
            assertEquals("expired", Money.view(api, held).s("status"))
            assertEquals(1, count("SELECT count(*) FROM audit_events WHERE entity_id = ? AND action = 'booking.expired'", bookingId))
            // Stripe may still report the payment (e.g. a delayed method); the time is free, so the booking comes back.
            s.send(api, s.sessionCompleted(bookingId, account, 5000, "pi_after_expiry"))
            s.worker.drain()
            assertEquals("confirmed paid, paid 5000, refunded 0", Money.state(Money.view(api, held)))
            assertEquals(listOf("charge succeeded 5000"), Money.ledger(bookingId))
        }
    }
}
