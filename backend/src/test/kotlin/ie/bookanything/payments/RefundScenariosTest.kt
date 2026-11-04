package ie.bookanything.payments

import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Clinic
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.StripeTest
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.createBusiness
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.race
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Refunds by policy through the API (docs/architecture.md section 7): who cancels, how late, what was already refunded,
 * deposits. Each case checks the refund preview, the booking's totals and payment status, and the payment ledger.
 * Now is Monday 5 October 2026, 09:00 in Dublin; the notice window is 24 hours.
 */
class RefundScenariosTest {
    private val thursday = "2026-10-08T10:00:00+01:00"
    private val today = "2026-10-05T15:00:00+01:00" // six hours away: a late cancellation

    private fun spa(latePercent: Int) = testBusiness("Refund Spa") {
        policies = policies.copy(lateCancellationRefundPercent = latePercent)
        val pat = person("Pat")
        service("Massage", 60) { price(6000); needs("Therapist", pat) }
        service("Deposit massage", 60) { deposit(6000, 1500); needs("Therapist", pat) }
        service("Approval massage", 60) { price(6000); approval(); needs("Therapist", pat) }
    }

    private data class CustomerCase(
        val name: String, val latePercent: Int, val service: String, val start: String, val minutesLater: Long, val refund: Int,
        val paymentStatus: String,
    )

    @Test
    fun `customer cancellations refund by notice and the late percentage, deposits included`() {
        val cases = listOf(
            CustomerCase("early: full refund", 50, "Massage", thursday, 0, 6000, "refunded"),
            CustomerCase("exactly 24 hours ahead still counts as early", 50, "Massage", "2026-10-06T10:00:00+01:00", 60, 6000, "refunded"),
            CustomerCase("a minute inside the window is late", 50, "Massage", "2026-10-06T10:00:00+01:00", 61, 3000, "partially_refunded"),
            CustomerCase("late at 50%", 50, "Massage", today, 0, 3000, "partially_refunded"),
            CustomerCase("late at 0%: nothing back", 0, "Massage", today, 0, 0, "paid"),
            CustomerCase("late at 100%: everything back", 100, "Massage", today, 0, 6000, "refunded"),
            CustomerCase("early deposit: the deposit back", 50, "Deposit massage", thursday, 0, 1500, "refunded"),
            CustomerCase("late deposit: half the deposit back", 50, "Deposit massage", today, 0, 750, "partially_refunded"),
        )
        val env = TestEnv()
        withApp(env) { api ->
            val spas = cases.map { it.latePercent }.distinct().associateWith { api.createBusiness(spa(it)) }
            for (c in cases) {
                env.clock.instant = DEFAULT_NOW
                val paid = Money.paidBooking(api, spas.getValue(c.latePercent), c.service, c.start)
                val charged = Money.view(api, paid).i("amountPaidCents")
                env.clock.advanceMinutes(c.minutesLater)
                assertEquals(c.refund, Money.view(api, paid)["refundPreview"]!!.o.i("amountCents"), "${c.name}: preview")

                val cancelled = api.post("/v1/public/manage/${paid.s("manageToken")}/cancel", jsonOf("reason" to "Plans changed")).obj()
                assertEquals("cancelled", cancelled.s("status"), c.name)
                assertEquals(c.refund, cancelled.i("amountRefundedCents"), c.name)
                assertEquals(c.paymentStatus, cancelled.s("paymentStatus"), c.name)
                assertEquals(
                    listOf("charge succeeded $charged") + listOfNotNull("refund succeeded ${c.refund}".takeIf { c.refund > 0 }),
                    Money.ledger(Money.bookingId(paid)), c.name,
                )
            }
        }
    }

    @Test
    fun `business cancellations refund in full by default and staff can override with full or none`() {
        val env = TestEnv()
        withApp(env) { api ->
            val spa = api.createBusiness(spa(0)) // even a 0% late policy does not apply to the business's own cancellations
            for ((refund, expected) in listOf(null to 6000, "policy" to 6000, "full" to 6000, "none" to 0)) {
                val paid = Money.paidBooking(api, spa, "Massage", today)
                val body = if (refund == null) null else jsonOf("reason" to "Therapist ill", "refund" to refund, "notifyCustomer" to true)
                val res = api.post("${spa.base}/bookings/${Money.bookingId(paid)}/cancel", body, spa.owner.token)
                assertStatus(HttpStatusCode.OK, res)
                val cancelled = res.obj()
                assertEquals(expected, cancelled.i("amountRefundedCents"), "refund=$refund")
                assertEquals(if (expected > 0) "refunded" else "paid", cancelled.s("paymentStatus"), "refund=$refund")
                assertEquals("business", cancelled.s("cancelledBy"), "refund=$refund")
                assertEquals(
                    listOf("charge succeeded 6000") + listOfNotNull("refund succeeded 6000".takeIf { expected > 0 }),
                    Money.ledger(Money.bookingId(paid)), "refund=$refund",
                )
            }
            assertError(
                HttpStatusCode.BadRequest, "INVALID_REQUEST",
                api.post(
                    "${spa.base}/bookings/${Money.bookingId(Money.paidBooking(api, spa, "Massage", thursday))}/cancel",
                    jsonOf("refund" to "half"), spa.owner.token,
                ),
            )
        }
    }

    @Test
    fun `after a partial refund only the remainder is refundable`() {
        val env = TestEnv()
        withApp(env) { api ->
            val spa = api.createBusiness(spa(50))
            // (who cancels, refund override or null for the customer's manage link, start, refunded now, payment status after)
            val cases = listOf(
                Triple("business, policy", "policy", thursday) to (4000 to "refunded"),
                Triple("business, full", "full", thursday) to (4000 to "refunded"),
                Triple("business, none", "none", thursday) to (0 to "partially_refunded"),
                Triple("customer, early", null, thursday) to (4000 to "refunded"),
                // 50% of the 6000 paid, capped at the 4000 still refundable: 3000 more, 5000 in all (see RefundPolicy).
                Triple("customer, late", null, today) to (3000 to "partially_refunded"),
            )
            for ((case, expected) in cases) {
                val (name, override, start) = case
                val (refundNow, status) = expected
                val paid = Money.paidBooking(api, spa, "Massage", start)
                val bookingId = Money.bookingId(paid)
                refundOutsideBookanything(env, spa, bookingId, 2000)
                assertEquals("partially_refunded", Money.view(api, paid).s("paymentStatus"), name)

                val cancelled = if (override == null) {
                    api.post("/v1/public/manage/${paid.s("manageToken")}/cancel").obj()
                } else {
                    api.post("${spa.base}/bookings/$bookingId/cancel", jsonOf("refund" to override), spa.owner.token).obj()
                }
                assertEquals(2000 + refundNow, cancelled.i("amountRefundedCents"), name)
                assertEquals(status, cancelled.s("paymentStatus"), name)
                assertEquals(
                    listOf("charge succeeded 6000", "refund succeeded 2000") +
                        listOfNotNull("refund succeeded $refundNow".takeIf { refundNow > 0 }),
                    Money.ledger(bookingId), name,
                )
            }
        }
    }

    @Test
    fun `a booking is cancelled and refunded once, however often or concurrently it is cancelled`() {
        val env = TestEnv()
        withApp(env) { api ->
            val spa = api.createBusiness(spa(50))
            val sequential = Money.paidBooking(api, spa, "Massage", thursday)
            val id = Money.bookingId(sequential)
            assertStatus(HttpStatusCode.OK, api.post("${spa.base}/bookings/$id/cancel", jsonOf("refund" to "full"), spa.owner.token))
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("${spa.base}/bookings/$id/cancel", null, spa.owner.token))
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("/v1/public/manage/${sequential.s("manageToken")}/cancel"))
            assertEquals(listOf("charge succeeded 6000", "refund succeeded 6000"), Money.ledger(id))

            val raced = Money.paidBooking(api, spa, "Massage", "2026-10-08T14:00:00+01:00")
            val racedId = Money.bookingId(raced)
            val outcomes = race(6) { n ->
                if (n % 2 == 0) {
                    api.post("${spa.base}/bookings/$racedId/cancel", jsonOf("refund" to "full"), spa.owner.token)
                } else {
                    api.post("/v1/public/manage/${raced.s("manageToken")}/cancel")
                }
            }
            assertEquals(1, outcomes.count { it.status == HttpStatusCode.OK }, outcomes.toString())
            assertTrue(outcomes.filter { it.status != HttpStatusCode.OK }.all { it.errorCode == "POLICY_VIOLATION" }, outcomes.toString())
            assertEquals(listOf("charge succeeded 6000", "refund succeeded 6000"), Money.ledger(racedId))
            assertEquals(6000, Money.view(api, raced).i("amountRefundedCents"))
            val cancelledEvents = Fixtures.sqlOne(
                "SELECT count(*) FROM audit_events WHERE entity_id = ? AND action = 'booking.cancelled'", racedId,
            ) { it.getInt(1) }
            assertEquals(1, cancelledEvents)
        }
    }

    @Test
    fun `once a booking has started the customer can't cancel it, a no-show keeps the money and the business may still refund`() {
        val env = TestEnv()
        withApp(env) { api ->
            val spa = api.createBusiness(spa(50))
            val noShow = Money.paidBooking(api, spa, "Massage", today)
            val lateRefund = Money.paidBooking(api, spa, "Deposit massage", "2026-10-05T16:00:00+01:00")
            val noShowId = Money.bookingId(noShow)
            assertError(
                HttpStatusCode.Conflict, "POLICY_VIOLATION",
                api.post("${spa.base}/bookings/$noShowId/status", jsonOf("status" to "no_show"), spa.owner.token),
            )

            env.clock.instant = java.time.Instant.parse("2026-10-05T14:30:00Z") // 15:30 in Dublin: the first one has started
            val view = Money.view(api, noShow)
            assertEquals(false, view.s("canCancel").toBoolean())
            assertEquals("null", view["refundPreview"].toString())
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("/v1/public/manage/${noShow.s("manageToken")}/cancel"))

            val marked = api.post("${spa.base}/bookings/$noShowId/status", jsonOf("status" to "no_show"), spa.owner.token)
            assertStatus(HttpStatusCode.OK, marked)
            assertEquals("no_show paid, paid 6000, refunded 0", Money.state(marked.obj()))
            assertEquals(listOf("charge succeeded 6000"), Money.ledger(noShowId))
            assertEquals(emptyList(), Fixtures.sqlAll("SELECT id::text FROM booking_allocations WHERE booking_id = ? AND active", noShowId))
            assertError(
                HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("${spa.base}/bookings/$noShowId/cancel", null, spa.owner.token),
            )

            // The business can still cancel a booking that has started (say, the therapist fell ill): a full refund of the deposit.
            env.clock.instant = java.time.Instant.parse("2026-10-05T15:10:00Z")
            val cancelled = api.post("${spa.base}/bookings/${Money.bookingId(lateRefund)}/cancel", null, spa.owner.token).obj()
            assertEquals("cancelled refunded, paid 1500, refunded 1500", Money.state(cancelled))
        }
    }

    @Test
    fun `a pending Stripe refund counts once (the later charge refunded event adds nothing), a failed one not at all`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            // A failed refund is recorded as failed and not retried; the money stays with the business (current behaviour).
            val cases = listOf(
                "pending" to "cancelled refunded, paid 5000, refunded 5000",
                "failed" to "cancelled paid, paid 5000, refunded 0",
            )
            cases.forEachIndexed { n, (stripeStatus, expected) ->
                val email = "${unique("stripe.refund")}@example.test"
                val held = Fixtures.book(api, clinic, "Paid consult", "2026-10-08T1$n:00:00+01:00", email = email)
                val bookingId = Money.bookingId(held)
                s.send(api, s.sessionCompleted(bookingId, account, 5000, "pi_refund_$n"))
                s.worker.drain()
                s.gateway.refundStatus = stripeStatus
                val cancelled = api.post("/v1/public/manage/${held.s("manageToken")}/cancel").obj()
                assertEquals(expected, Money.state(cancelled), stripeStatus)
                val refundRow = if (stripeStatus == "pending") "refund succeeded 5000" else "refund failed 5000"
                assertEquals(listOf("charge succeeded 5000", refundRow), Money.ledger(bookingId), stripeStatus)
                if (stripeStatus == "pending") {
                    val refunded = mapOf(
                        "id" to "ch_$n", "object" to "charge", "payment_intent" to "pi_refund_$n", "amount" to 5000,
                        "amount_refunded" to 5000,
                    )
                    s.send(api, StripeTest.event("charge.refunded", refunded, account))
                    s.worker.drain()
                    assertEquals(listOf("charge succeeded 5000", refundRow), Money.ledger(bookingId), "nothing recorded twice")
                    assertEquals(5000, Money.view(api, held).i("amountRefundedCents"))
                }
            }
        }
    }

    @Test
    fun `a refund whose call failed but reached Stripe counts once when charge refunded arrives before the retry`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val email = "${unique("stripe.timeout")}@example.test"
            val held = Fixtures.book(api, clinic, "Paid consult", "2026-10-08T10:00:00+01:00", email = email)
            val bookingId = Money.bookingId(held)
            s.send(api, s.sessionCompleted(bookingId, account, 5000, "pi_timeout"))
            s.worker.drain()
            // Stripe made the refund but our call timed out, and so does the retry's first attempt.
            s.gateway.failRefunds.set(2)
            val cancelled = api.post("/v1/public/manage/${held.s("manageToken")}/cancel").obj()
            assertEquals("cancelled paid, paid 5000, refunded 0", Money.state(cancelled))
            s.worker.drain()
            val refunded = mapOf(
                "id" to "ch_timeout", "object" to "charge", "payment_intent" to "pi_timeout", "amount" to 5000, "amount_refunded" to 5000,
            )
            s.send(api, StripeTest.event("charge.refunded", refunded, account))
            s.worker.drain()
            // The retry comes round again and Stripe replays the refund it already made (same idempotency key).
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'payment_refund_retry' AND status = 'pending'")
            s.worker.drain()
            assertEquals(5000, Money.view(api, held).i("amountRefundedCents"))
            assertEquals(listOf("charge succeeded 5000", "refund succeeded 5000"), Money.ledger(bookingId))
            assertEquals(1, s.env.email.sent.count { it.to == email && it.template == "payment_refunded" })
        }
    }

    @Test
    fun `declining a paid request refunds it in full and says so`() {
        val env = TestEnv()
        withApp(env) { api ->
            val spa = api.createBusiness(spa(0))
            val email = "${unique("declined")}@example.test"
            val request = Money.paidBooking(api, spa, "Approval massage", today, email = email)
            assertEquals("pending_approval", Money.view(api, request).s("status"))
            val declined = api.post(
                "${spa.base}/bookings/${Money.bookingId(request)}/decline", jsonOf("reason" to "Fully booked"), spa.owner.token,
            ).obj()
            assertEquals("cancelled refunded, paid 6000, refunded 6000", Money.state(declined))
            assertEquals(listOf("charge succeeded 6000", "refund succeeded 6000"), Money.ledger(Money.bookingId(request)))
            JobWorker(env.ctx).drain()
            val mail = env.email.sent.single { it.to == email && it.template == "booking_declined" }
            assertTrue(mail.text.contains("€60.00"), mail.text)
        }
    }

    @Test
    fun `cancelling a held booking before paying refunds nothing and drops the payment it was waiting for`() = withApp { api ->
        val spa = api.createBusiness(spa(50))
        val held = Money.book(api, spa, "Massage", thursday)
        val cancelled = api.post("/v1/public/manage/${held.s("manageToken")}/cancel").obj()
        assertEquals("cancelled not_required, paid 0, refunded 0", Money.state(cancelled))
        assertEquals(listOf("charge cancelled 6000"), Money.ledger(Money.bookingId(held)))
    }

    /** A refund made outside bookanything (the Stripe dashboard), recorded as `charge.refunded` does. */
    private suspend fun refundOutsideBookanything(env: TestEnv, spa: Clinic, bookingId: String, cents: Int) {
        val businessId = UUID.fromString(spa.id)
        env.db.tx(businessId) { conn ->
            val charge = PaymentRepository.succeededCharge(conn, businessId, UUID.fromString(bookingId))!!
            env.ctx.booking.lifecycle.payments.reconcileRefunds(conn, charge, cents)
        }
    }
}
