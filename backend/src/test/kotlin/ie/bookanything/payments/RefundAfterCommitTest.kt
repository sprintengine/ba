package ie.bookanything.payments

import ie.bookanything.audit.Actor
import ie.bookanything.booking.Cancellation
import ie.bookanything.business.BusinessRepository
import ie.bookanything.db.AfterCommit
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.assertStatus
import ie.bookanything.support.count
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import ie.bookanything.support.withTelemetry
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonObject
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Refunds reach Stripe after the cancellation has committed (docs/architecture.md section 7): a slow Stripe holds no
 * booking or slot, the response still reports the refund, and the customer's email goes with Stripe's answer, exactly
 * once, even when the request stopped before calling Stripe. Thursday 8 October 2026, Dublin.
 */
class RefundAfterCommitTest {
    private fun at(time: String) = "2026-10-08T$time:00+01:00"

    /** A Paid consult with Alex at [time], paid through Stripe. */
    private suspend fun paid(api: Api, s: StripeWorld, clinic: Clinic, account: String, time: String, email: String): JsonObject {
        val held = Fixtures.book(api, clinic, "Paid consult", at(time), email = email, resourceId = clinic.resource("Alex"))
        s.send(api, s.sessionCompleted(Money.bookingId(held), account, 5000, "pi_${unique("paid")}"))
        s.worker.drain()
        return held
    }

    @Test
    fun `while Stripe makes the refund the booking and its slot are free, and the answer reports the refund`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val email = "${unique("slow.refund")}@example.test"
            val held = paid(api, s, clinic, account, "10:00", email)
            val bookingId = Money.bookingId(held)
            val gate = CountDownLatch(1)
            s.gateway.gate = gate
            try {
                coroutineScope {
                    val cancel = async(Dispatchers.IO) {
                        api.post("/v1/public/manage/${held.s("manageToken")}/cancel", jsonOf("reason" to "Travelling"))
                    }
                    assertTrue(s.gateway.entered.tryAcquire(30, TimeUnit.SECONDS), "the cancellation is inside the Stripe call")
                    // Committed before Stripe was called: cancelled, with the refund recorded as pending.
                    assertEquals(listOf("charge succeeded 5000", "refund pending 5000"), Money.ledger(bookingId))

                    // The booking's row is free: staff can edit it (before, they waited for Stripe behind its lock)...
                    val edited = withTimeout(LOCK_FREE_MS) {
                        api.patch("${clinic.base}/bookings/$bookingId", jsonOf("internalNotes" to "Refund on its way"), clinic.owner.token)
                    }
                    assertStatus(HttpStatusCode.OK, edited)
                    // ...and so is its time: someone else books it at once.
                    val sameTime = Fixtures.bookingBody(clinic, "Consult", at("10:00"), resourceId = clinic.resource("Alex"))
                    val taken = withTimeout(LOCK_FREE_MS) { api.post("${clinic.public}/bookings", sameTime) }
                    assertStatus(HttpStatusCode.Created, taken)

                    gate.countDown()
                    val cancelled = cancel.await()
                    assertStatus(HttpStatusCode.OK, cancelled)
                    val view = cancelled.obj()
                    assertEquals("cancelled refunded, paid 5000, refunded 5000", Money.state(view))
                    assertEquals(listOf("charge succeeded 5000", "refund succeeded 5000"), Money.ledger(bookingId))
                }
            } finally {
                gate.countDown()
            }
            s.worker.drain()
            val mails = s.env.email.sent.filter { it.to == email && it.template in setOf("booking_cancelled", "payment_refunded") }
            assertEquals(listOf("booking_cancelled"), mails.map { it.template }, "one email, sent with Stripe's answer")
            assertTrue(mails.single().text.contains("A refund of €50.00"), mails.single().text)
            assertEquals(
                5000,
                Fixtures.sqlOne(
                    "SELECT (summary->>'amountCents')::int FROM audit_events WHERE entity_id = ?::uuid AND action = 'payment.refunded'",
                    bookingId,
                ) { it.getInt(1) },
            )
        }
    }

    @Test
    fun `a refund whose request stopped after the commit is made by the worker, with the cancellation email`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val email = "${unique("stopped")}@example.test"
            val held = paid(api, s, clinic, account, "12:00", email)
            val bookingId = UUID.fromString(Money.bookingId(held))
            val businessId = UUID.fromString(clinic.id)
            s.env.db.txBlocking(businessId) { conn ->
                val business = BusinessRepository.findById(conn, businessId)!!
                s.env.ctx.booking.lifecycle.cancel(conn, business, bookingId, Cancellation.byCustomer(Actor.GUEST, null), s.clock.instant())
                AfterCommit.dropAfter(conn, 0) // the process stops right after the commit
            }
            assertEquals(listOf("charge succeeded 5000", "refund pending 5000"), Money.ledger(bookingId.toString()))
            assertTrue(s.gateway.refunds.isEmpty())
            s.worker.drain()
            assertTrue(s.env.email.sent.none { it.to == email && it.template == "booking_cancelled" }, "nothing said before Stripe answers")

            // The backstop comes due and the worker makes the refund.
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'payment_refund_retry' AND payload->>'businessId' = ?", clinic.id)
            s.worker.drain()
            s.worker.drain()
            assertEquals(5000, Money.view(api, held).i("amountRefundedCents"))
            assertEquals(1, s.gateway.refunds.size)
            val mails = s.env.email.sent.filter { it.to == email && it.template in setOf("booking_cancelled", "payment_refunded") }
            assertEquals(listOf("booking_cancelled"), mails.map { it.template })
            assertTrue(mails.single().text.contains("A refund of €50.00"), mails.single().text)
        }
    }

    @Test
    fun `when Stripe fails the email says the refund is being processed, and the retry sends one receipt`() = withTelemetry { registry, _ ->
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val email = "${unique("declined.later")}@example.test"
            val held = paid(api, s, clinic, account, "14:00", email)
            s.gateway.failRefunds.set(1)
            val cancelled = api.post("/v1/public/manage/${held.s("manageToken")}/cancel").obj()
            assertEquals("cancelled paid, paid 5000, refunded 0", Money.state(cancelled))
            s.worker.drain()
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'payment_refund_retry' AND payload->>'businessId' = ?", clinic.id)
            s.worker.drain()
            // Run the finished job's work again (as a recovered job would): nothing is refunded or sent twice.
            Fixtures.sql(
                "UPDATE jobs SET status = 'pending', run_at = now() WHERE kind = 'payment_refund_retry' AND payload->>'businessId' = ?",
                clinic.id,
            )
            s.worker.drain()
            assertEquals(5000, Money.view(api, held).i("amountRefundedCents"))
            assertEquals(1, s.gateway.refunds.size)
            val mails = s.env.email.sent.filter { it.to == email && it.template in setOf("booking_cancelled", "payment_refunded") }
            assertEquals(listOf("booking_cancelled", "payment_refunded"), mails.map { it.template })
            assertTrue(mails.first().text.contains("being processed"), mails.first().text)
            assertEquals(1.0, registry.count("payments.refunds.failed"))
            assertEquals(1.0, registry.count("jobs.runs", "kind", "payment_refund_retry", "result", "retry"))
        }
    }
}

/** Far below the gate's 30 s: a request that waited for the cancellation's locks would not answer within it. */
private const val LOCK_FREE_MS = 10_000L
