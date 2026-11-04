package ie.bookanything.payments

import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.StripeTest
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.assertStatus
import ie.bookanything.support.count
import ie.bookanything.support.i
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import ie.bookanything.support.withTelemetry
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Refunds that fail (docs/architecture.md section 7): refused by Stripe, out of attempts, or accepted and reported failed
 * later. Each is taken off the booking, never retried for nothing, the business's owners are told to refund the customer
 * another way, and the customer is told the truth. Thursday 8 October 2026, Dublin.
 */
class RefundFailuresTest {
    private fun at(time: String) = "2026-10-08T$time:00+01:00"

    private class Paid(val booking: JsonObject, val email: String, val paymentIntent: String)

    private suspend fun paid(api: Api, s: StripeWorld, clinic: Clinic, account: String, time: String): Paid {
        val email = "${unique("refund")}@example.test"
        val held = Fixtures.book(api, clinic, "Paid consult", at(time), email = email, resourceId = clinic.resource("Alex"))
        val pi = "pi_${unique("paid")}"
        s.send(api, s.sessionCompleted(Money.bookingId(held), account, 5000, pi))
        s.worker.drain()
        return Paid(held, email, pi)
    }

    private fun mails(s: StripeWorld, p: Paid) = s.env.email.sent.filter { it.to == p.email && it.template != "booking_confirmed" }

    private fun alerts(clinic: Clinic): List<String> = Fixtures.sqlAll(
        "SELECT n.title FROM notifications n WHERE n.business_id = ? AND n.kind = 'payments_alert' ORDER BY n.created_at",
        clinic.id,
    )

    private fun pendingRefundJobs(clinic: Clinic) = Fixtures.sqlAll(
        "SELECT id::text FROM jobs WHERE kind = 'payment_refund_retry' AND status = 'pending' AND payload->>'businessId' = ?::text",
        clinic.id,
    )

    private fun refundEvent(account: String, refundId: String, status: String, extra: Map<String, Any?> = emptyMap()) = StripeTest.event(
        "refund.updated",
        mapOf("id" to refundId, "object" to "refund", "status" to status, "amount" to 5000, "currency" to "eur") + extra,
        account,
    )

    @Test
    fun `a refund Stripe reports failed is not retried, and nobody is told it is on its way`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "10:00")
            s.gateway.refundStatus = "failed"
            s.gateway.refundFailureReason = "expired_or_canceled_card"
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()

            assertEquals(listOf("charge succeeded 5000", "refund failed 5000"), Money.ledger(Money.bookingId(p.booking)))
            assertEquals(0, Money.view(api, p.booking).i("amountRefundedCents"))
            assertTrue(pendingRefundJobs(clinic).isEmpty(), "not retried")
            val cancelled = mails(s, p).single()
            assertEquals("booking_cancelled", cancelled.template)
            assertTrue("will arrange your refund with you" in cancelled.text, cancelled.text)
            assertTrue("being processed" !in cancelled.text && "on its way" !in cancelled.text, cancelled.text)
            assertEquals(listOf("A refund couldn't be made"), alerts(clinic))
            val body = Fixtures.sqlAll("SELECT body FROM notifications WHERE business_id = ? AND kind = 'payments_alert'", clinic.id)
            assertTrue("expired or canceled card" in body.single(), body.single())
        }
    }

    @Test
    fun `a refund Stripe refuses for good fails at once`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "11:00")
            s.gateway.refuseRefunds.set(1)
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            assertEquals(listOf("charge succeeded 5000", "refund failed 5000"), Money.ledger(Money.bookingId(p.booking)))
            assertTrue(pendingRefundJobs(clinic).isEmpty())
            assertTrue("will arrange your refund with you" in mails(s, p).single().text)
            assertEquals(listOf("A refund couldn't be made"), alerts(clinic))
        }
    }

    @Test
    fun `a refund Stripe never answers is handed to the owners to check, and is recorded if Stripe made it after all`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "12:00")
            s.gateway.failRefunds.set(100)
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            assertTrue("being processed" in mails(s, p).single().text, "the first answer: Stripe is unreachable")
            // The last attempt.
            Fixtures.sql(
                "UPDATE jobs SET attempts = max_attempts - 1, run_at = now() " +
                    "WHERE kind = 'payment_refund_retry' AND payload->>'businessId' = ?",
                clinic.id,
            )
            s.worker.drain()
            assertEquals(listOf("charge succeeded 5000", "refund failed 5000"), Money.ledger(Money.bookingId(p.booking)))
            assertTrue(pendingRefundJobs(clinic).isEmpty())
            // Stripe may have made it after all: the owners check first, and the customer hears it is being checked.
            assertEquals(listOf("booking_cancelled", "payment_refund_failed"), mails(s, p).map { it.template })
            assertTrue("being checked" in mails(s, p).last().text, mails(s, p).last().text)
            assertEquals(listOf("A refund needs checking"), alerts(clinic))
            val body = Fixtures.sqlAll("SELECT body FROM notifications WHERE business_id = ? AND kind = 'payments_alert'", clinic.id)
            assertTrue("Check the payment in your Stripe dashboard" in body.first(), body.first())

            // Stripe had made it after all (the calls timed out): an older report saying so changes nothing, and its
            // charge.refunded records the money with a receipt.
            val refundId = Fixtures.sqlAll(
                "SELECT id::text FROM payments WHERE booking_id = ? AND kind = 'refund'", UUID.fromString(Money.bookingId(p.booking)),
            ).single()
            s.send(api, refundEvent(account, "re_made", "pending", mapOf("metadata" to mapOf("refundPaymentId" to refundId))))
            val charge = mapOf("id" to "ch_made", "object" to "charge", "payment_intent" to p.paymentIntent, "amount_refunded" to 5000)
            s.send(api, StripeTest.event("charge.refunded", charge, account))
            s.worker.drain()
            assertEquals(5000, Money.view(api, p.booking).i("amountRefundedCents"))
            assertEquals(listOf("booking_cancelled", "payment_refund_failed", "payment_refunded"), mails(s, p).map { it.template })
            assertEquals(listOf("A refund needs checking"), alerts(clinic))
        }
    }

    @Test
    fun `an accepted refund that fails later is taken off the booking, and both sides are told`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "14:00")
            s.gateway.refundStatus = "pending"
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            // Accepted: on its way, and counted.
            assertEquals(5000, Money.view(api, p.booking).i("amountRefundedCents"))
            assertTrue("on its way" in mails(s, p).single().text)
            val refundId = Fixtures.sqlAll(
                "SELECT provider_ref FROM payments WHERE booking_id = ? AND kind = 'refund'", UUID.fromString(Money.bookingId(p.booking)),
            ).single()

            // Its success changes nothing; a failure from another account is ignored.
            s.send(api, refundEvent(account, refundId, "succeeded"))
            s.send(api, refundEvent("acct_someone_else", refundId, "failed"))
            s.worker.drain()
            assertEquals(5000, Money.view(api, p.booking).i("amountRefundedCents"))

            s.send(api, refundEvent(account, refundId, "failed", mapOf("failure_reason" to "lost_or_stolen_card")))
            s.send(api, refundEvent(account, refundId, "failed")) // a second delivery
            s.send(api, refundEvent(account, refundId, "pending")) // an older one, delivered late
            s.worker.drain()
            val view = Money.view(api, p.booking)
            assertEquals(listOf(0, "paid"), listOf(view.i("amountRefundedCents"), view.s("paymentStatus")))
            assertEquals(listOf("booking_cancelled", "payment_refund_failed"), mails(s, p).map { it.template })
            assertEquals(listOf("A refund couldn't be made"), alerts(clinic))
        }
    }

    @Test
    fun `a refund made in the Stripe dashboard that fails is taken off too`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "15:00")
            val charge = mapOf("id" to "ch_1", "object" to "charge", "payment_intent" to p.paymentIntent, "amount_refunded" to 2000)
            s.send(api, StripeTest.event("charge.refunded", charge, account))
            s.worker.drain()
            assertEquals(2000, Money.view(api, p.booking).i("amountRefundedCents"))
            s.send(
                api,
                StripeTest.event(
                    "charge.refund.updated",
                    mapOf(
                        "id" to "re_dash", "object" to "refund", "status" to "failed", "amount" to 2000,
                        "payment_intent" to p.paymentIntent,
                    ),
                    account,
                ),
            )
            s.worker.drain()
            assertEquals(0, Money.view(api, p.booking).i("amountRefundedCents"))
            assertEquals(listOf("A refund couldn't be made"), alerts(clinic))
        }
    }

    @Test
    fun `a payment that doesn't match its booking is refunded in full on its account, and the owners are told`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", at("16:00"))
            s.send(api, s.sessionCompleted(Money.bookingId(held), account, 4000, "pi_short"))
            s.worker.drain()
            val refund = s.gateway.refunds.single()
            assertEquals("pi_short", refund.params.paymentIntent)
            assertEquals(null, refund.params.amount, "in full")
            assertEquals(account, refund.options!!.stripeAccount)
            assertEquals("bookanything-unmatched-pi_short", refund.options.idempotencyKey)
            assertEquals("held", Money.view(api, held).s("status"), "the booking isn't paid for")
            assertEquals(listOf("A payment was refunded"), alerts(clinic))
            val audited = Fixtures.sqlAll(
                "SELECT id::text FROM audit_events WHERE action = 'payment.unmatched_refund' AND business_id = ?", clinic.id,
            )
            assertEquals(1, audited.size)
        }
    }

    @Test
    fun `Stripe saying the charge was refunded already is checked by the owners, not reported as a failure`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "10:00")
            // The owner refunded it in the Stripe dashboard a moment ago; that event is still on its way.
            val refundedAt = Instant.now().epochSecond - 30
            s.gateway.refuseRefunds.set(1)
            s.gateway.refusalCode = "charge_already_refunded"
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            assertTrue("We're checking your refund" in mails(s, p).single().text, mails(s, p).single().text)
            assertEquals(listOf("A refund needs checking"), alerts(clinic))
            // The dashboard refund's own event still records it: ours never reached Stripe.
            val charge = mapOf("id" to "ch_dash", "object" to "charge", "payment_intent" to p.paymentIntent, "amount_refunded" to 5000)
            s.send(api, StripeTest.event("charge.refunded", charge, account).replace(Regex("\"created\":\\d+"), "\"created\":$refundedAt"))
            s.worker.drain()
            assertEquals(5000, Money.view(api, p.booking).i("amountRefundedCents"))
        }
    }

    @Test
    fun `a refund that timed out at Stripe and then fails is told to the customer once`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "10:00")
            // Unreachable, as far as we know (the call timed out): the customer hears it is being processed.
            s.gateway.failRefunds.set(1)
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            val refundId = Fixtures.sqlAll(
                "SELECT id::text FROM payments WHERE booking_id = ? AND kind = 'refund'", UUID.fromString(Money.bookingId(p.booking)),
            ).single()
            // Stripe had made it, and later reports it failed: found by our id in its metadata.
            s.send(api, refundEvent(account, "re_timed_out", "failed", mapOf("metadata" to mapOf("refundPaymentId" to refundId))))
            s.worker.drain()
            assertEquals(listOf("booking_cancelled", "payment_refund_failed"), mails(s, p).map { it.template })
            // The retry finds nothing left to send.
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'payment_refund_retry' AND payload->>'businessId' = ?", clinic.id)
            s.worker.drain()
            assertEquals(1, mails(s, p).count { it.template == "payment_refund_failed" })
            assertTrue(s.gateway.refunds.isEmpty())
        }
    }

    @Test
    fun `a failure Stripe reports before our job hears back goes out with the cancellation`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "10:00")
            s.gateway.failRefunds.set(1)
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            val refund = Fixtures.sqlAll(
                "SELECT id::text FROM payments WHERE booking_id = ? AND kind = 'refund'", UUID.fromString(Money.bookingId(p.booking)),
            ).single()
            s.worker.drain()
            // Put the notice back, as if the first attempt had not answered yet.
            Fixtures.sql(
                "UPDATE jobs SET payload = payload || jsonb_build_object('notice', jsonb_build_object('kind', 'booking_cancelled', " +
                    "'extra', '{}'::jsonb)), status = 'pending', run_at = now() + interval '1 hour' " +
                    "WHERE kind = 'payment_refund_retry' AND payload->>'businessId' = ?",
                clinic.id,
            )
            s.env.email.sent.clear()
            s.send(api, refundEvent(account, "re_early", "failed", mapOf("metadata" to mapOf("refundPaymentId" to refund))))
            s.worker.drain()
            assertTrue(mails(s, p).isEmpty(), "the notice still to go out will say it")
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'payment_refund_retry' AND payload->>'businessId' = ?", clinic.id)
            s.worker.drain()
            val cancelled = mails(s, p).single()
            assertEquals("booking_cancelled", cancelled.template)
            assertTrue("will arrange your refund with you" in cancelled.text, cancelled.text)
        }
    }

    @Test
    fun `a late report of the refunded total doesn't bring a failed refund back`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "10:00")
            s.gateway.refundStatus = "pending"
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            val refundId = Fixtures.sqlAll(
                "SELECT provider_ref FROM payments WHERE booking_id = ? AND kind = 'refund'", UUID.fromString(Money.bookingId(p.booking)),
            ).single()
            // Stripe's timestamps and the database's are both the real time: the refund was recorded two minutes ago,
            // Stripe accepted it a minute ago, and it failed now.
            Fixtures.sql(
                "UPDATE payments SET created_at = now() - interval '2 minutes' WHERE booking_id = ? AND kind = 'refund'",
                UUID.fromString(Money.bookingId(p.booking)),
            )
            val acceptedAt = Instant.now().epochSecond - 60
            s.send(api, refundEvent(account, refundId, "failed"))
            s.worker.drain()
            // The charge.refunded Stripe sent when it accepted the refund, delivered late.
            val charge = mapOf("id" to "ch_late", "object" to "charge", "payment_intent" to p.paymentIntent, "amount_refunded" to 5000)
            s.send(
                api,
                StripeTest.event("charge.refunded", charge, account).replace(Regex("\"created\":\\d+"), "\"created\":$acceptedAt"),
            )
            s.worker.drain()
            assertEquals(0, Money.view(api, p.booking).i("amountRefundedCents"))
            // (The refund row was backdated above, so it sorts first.)
            assertEquals(setOf("charge succeeded 5000", "refund failed 5000"), Money.ledger(Money.bookingId(p.booking)).toSet())
            assertTrue(mails(s, p).none { it.template == "payment_refunded" })

            // A refund made in the dashboard after that is recorded as usual.
            val later = mapOf("id" to "ch_late", "object" to "charge", "payment_intent" to p.paymentIntent, "amount_refunded" to 1000)
            val afterwards = Instant.now().epochSecond + 5
            s.send(api, StripeTest.event("charge.refunded", later, account).replace(Regex("\"created\":\\d+"), "\"created\":$afterwards"))
            s.worker.drain()
            assertEquals(1000, Money.view(api, p.booking).i("amountRefundedCents"))
        }
    }

    @Test
    fun `each dashboard refund that fails is matched once, even when several were recorded together`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "10:00")
            // Two refunds of 1000 made in the dashboard, reported as one total.
            val charge = mapOf("id" to "ch_dash", "object" to "charge", "payment_intent" to p.paymentIntent, "amount_refunded" to 2000)
            s.send(api, StripeTest.event("charge.refunded", charge, account))
            s.worker.drain()
            val failed = mapOf(
                "id" to "re_one", "object" to "refund", "status" to "failed", "amount" to 1000,
                "payment_intent" to p.paymentIntent,
            )
            // Stripe reports one failure three ways.
            for (type in listOf("refund.updated", "refund.failed", "charge.refund.updated")) {
                s.send(api, StripeTest.event(type, failed, account))
            }
            s.worker.drain()
            assertEquals(1000, Money.view(api, p.booking).i("amountRefundedCents"))
            assertEquals(
                listOf("charge succeeded 5000", "refund succeeded 1000", "refund failed 1000"),
                Money.ledger(Money.bookingId(p.booking)),
            )
            assertEquals(1, mails(s, p).count { it.template == "payment_refund_failed" })
        }
    }

    @Test
    fun `a late payment's refund that fails says so in its own words`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            s.gateway.refundStatus = "failed"
            // A late payment: the hold expired and the time was taken.
            val alex = clinic.resource("Alex")
            val held = Fixtures.book(api, clinic, "Paid consult", at("11:00"), email = "${unique("late")}@example.test", resourceId = alex)
            Fixtures.sql(
                "UPDATE bookings SET hold_expires_at = ? WHERE id = ?",
                java.sql.Timestamp.from(s.clock.instant().minusSeconds(60)), UUID.fromString(Money.bookingId(held)),
            )
            // Booking the same time expires the stale hold and takes the slot.
            Fixtures.book(api, clinic, "Paid consult", at("11:00"), email = "${unique("taker")}@example.test", resourceId = alex)
            s.send(api, s.sessionCompleted(Money.bookingId(held), account, 5000, "pi_${unique("late")}"))
            s.worker.drain()
            val late = s.env.email.sent.filter { it.template == "payment_refund_failed" }
            assertEquals(1, late.size)
            assertTrue("reached us after the time" in late.single().text, late.single().text)
        }
    }

    @Test
    fun `an unmatched payment's own refund events are its own`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", at("10:00"))
            s.send(api, s.sessionCompleted(Money.bookingId(held), account, 4000, "pi_odd", currency = "usd"))
            s.worker.drain()
            val body = Fixtures.sqlAll("SELECT body FROM notifications WHERE business_id = ? AND kind = 'payments_alert'", clinic.id)
            assertTrue("US$40" in body.single(), body.single())
            // Its refund's charge.refunded: nothing to record (and no endless retries).
            val charge = mapOf("id" to "ch_odd", "object" to "charge", "payment_intent" to "pi_odd", "amount_refunded" to 4000)
            s.send(api, StripeTest.event("charge.refunded", charge, account))
            s.worker.drain()
            assertTrue(Fixtures.sqlAll("SELECT error FROM provider_events WHERE error IS NOT NULL").none { "pi_odd" in it })
            // Its refund failing later: the owners refund it themselves.
            val refund = mapOf(
                "id" to "re_odd", "object" to "refund", "status" to "failed", "amount" to 4000, "payment_intent" to "pi_odd",
                "metadata" to mapOf("reason" to "unmatched_payment"),
            )
            s.send(api, StripeTest.event("refund.updated", refund, account))
            s.worker.drain()
            assertEquals(listOf("A payment was refunded", "A payment needs refunding"), alerts(clinic))
        }
    }

    @Test
    fun `a refund with nothing to send it from fails for certain at once`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "10:00")
            // A charge recorded before accounts were kept on charges, from a business no longer connected.
            Fixtures.sql("UPDATE payments SET provider_account = NULL WHERE booking_id = ?", UUID.fromString(Money.bookingId(p.booking)))
            Fixtures.sql("UPDATE businesses SET stripe_account_id = NULL WHERE id = ?", UUID.fromString(clinic.id))
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            assertTrue(pendingRefundJobs(clinic).isEmpty())
            assertTrue("will arrange your refund with you" in mails(s, p).single().text)
            assertEquals(listOf("A refund couldn't be made"), alerts(clinic))
        }
    }

    @Test
    fun `an unmatched payment never touches a booking's paid charge`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "10:00")
            // A second session naming the same (paid) payment, for another amount.
            s.send(api, s.sessionCompleted(Money.bookingId(p.booking), account, 100, "pi_other"))
            s.worker.drain()
            assertEquals(listOf("charge succeeded 5000", "charge failed 100"), Money.ledger(Money.bookingId(p.booking)))
            assertEquals(listOf("pi_other"), s.gateway.refunds.map { it.params.paymentIntent })
            // Refunds of the booking still go to its own payment.
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            assertEquals(listOf("pi_other", p.paymentIntent), s.gateway.refunds.map { it.params.paymentIntent })
        }
    }

    @Test
    fun `a refund past Stripe's day of idempotency is never sent again`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "10:00")
            s.gateway.failRefunds.set(1)
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            // The worker was down for a day: the next attempt finds the refund older than Stripe keeps its key.
            Fixtures.sql(
                "UPDATE payments SET created_at = now() - interval '24 hours' WHERE booking_id = ? AND kind = 'refund'",
                UUID.fromString(Money.bookingId(p.booking)),
            )
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'payment_refund_retry' AND payload->>'businessId' = ?", clinic.id)
            s.worker.drain()
            assertTrue(s.gateway.refunds.isEmpty(), "not sent again")
            assertEquals(listOf("A refund needs checking"), alerts(clinic))
            assertTrue(pendingRefundJobs(clinic).isEmpty())
        }
    }

    @Test
    fun `a dashboard refund of an unmatched payment that fails is the owners' to make`() = withTelemetry { registry, _ ->
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", at("10:00"))
            s.send(api, s.sessionCompleted(Money.bookingId(held), account, 4000, "pi_odd2"))
            s.worker.drain()
            val refund = mapOf(
                "id" to "re_dash2", "object" to "refund", "status" to "failed", "amount" to 4000,
                "payment_intent" to "pi_odd2",
            )
            s.send(api, StripeTest.event("refund.updated", refund, account))
            s.worker.drain()
            assertEquals(listOf("A payment was refunded", "A payment needs refunding"), alerts(clinic))
            assertTrue(Fixtures.sqlAll("SELECT error FROM provider_events WHERE error IS NOT NULL").none { "re_dash2" in it })
            assertEquals(1.0, registry.count("payments.refunds.given_up", "certain", "true"))
        }
    }

    @Test
    fun `an unmatched payment Stripe never answers about is the owners' to check, and counted as unclear`() = withTelemetry { registry, _ ->
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", at("10:00"))
            s.gateway.failRefunds.set(100)
            s.send(api, s.sessionCompleted(Money.bookingId(held), account, 4000, "pi_quiet"))
            s.worker.drain()
            assertTrue(alerts(clinic).isEmpty(), "retried first")
            // The last attempt.
            Fixtures.sql(
                "UPDATE jobs SET attempts = max_attempts - 1, run_at = now() " +
                    "WHERE kind = 'stripe_unmatched_refund' AND payload->>'businessId' = ?",
                clinic.id,
            )
            s.worker.drain()
            assertEquals(listOf("A payment needs refunding"), alerts(clinic))
            val body = Fixtures.sqlAll("SELECT body FROM notifications WHERE business_id = ? AND kind = 'payments_alert'", clinic.id)
            assertTrue("Stripe didn't answer" in body.single(), body.single())
            assertEquals(1.0, registry.count("payments.refunds.given_up", "certain", "false"))
            assertEquals(0.0, registry.count("payments.refunds.given_up", "certain", "true"))
        }
    }

    @Test
    fun `a refund recorded moments after Stripe's report of it is still taken off when it fails`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "10:00")
            s.gateway.refundStatus = "pending"
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            val refundId = Fixtures.sqlAll(
                "SELECT provider_ref FROM payments WHERE booking_id = ? AND kind = 'refund'", UUID.fromString(Money.bookingId(p.booking)),
            ).single()
            s.send(api, refundEvent(account, refundId, "failed"))
            s.worker.drain()
            // Stripe's report that it accepted the refund, in whole seconds from a clock half a minute behind ours.
            val acceptedAt = Instant.now().epochSecond - 30
            val charge = mapOf("id" to "ch_skew", "object" to "charge", "payment_intent" to p.paymentIntent, "amount_refunded" to 5000)
            s.send(
                api,
                StripeTest.event("charge.refunded", charge, account).replace(Regex("\"created\":\\d+"), "\"created\":$acceptedAt"),
            )
            s.worker.drain()
            assertEquals(0, Money.view(api, p.booking).i("amountRefundedCents"))
            assertTrue(mails(s, p).none { it.template == "payment_refunded" })
        }
    }

    @Test
    fun `a refund given up on that Stripe made after all is taken off again when it fails`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val p = paid(api, s, clinic, account, "12:00")
            s.gateway.failRefunds.set(100)
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${p.booking.s("manageToken")}/cancel"))
            s.worker.drain()
            Fixtures.sql(
                "UPDATE jobs SET attempts = max_attempts - 1, run_at = now() " +
                    "WHERE kind = 'payment_refund_retry' AND payload->>'businessId' = ?",
                clinic.id,
            )
            s.worker.drain()
            assertEquals(listOf("A refund needs checking"), alerts(clinic))
            val refundId = Fixtures.sqlAll(
                "SELECT id::text FROM payments WHERE booking_id = ? AND kind = 'refund'", UUID.fromString(Money.bookingId(p.booking)),
            ).single()
            // Stripe had made it: its charge.refunded records the money.
            val charge = mapOf("id" to "ch_gone", "object" to "charge", "payment_intent" to p.paymentIntent, "amount_refunded" to 5000)
            s.send(api, StripeTest.event("charge.refunded", charge, account))
            s.worker.drain()
            assertEquals(5000, Money.view(api, p.booking).i("amountRefundedCents"))

            // Then it fails at Stripe: the money is taken off again, and both sides are told.
            val failed = refundEvent(
                account, "re_gone", "failed",
                mapOf("payment_intent" to p.paymentIntent, "metadata" to mapOf("refundPaymentId" to refundId)),
            )
            s.send(api, failed)
            s.worker.drain()
            assertEquals(0, Money.view(api, p.booking).i("amountRefundedCents"))
            assertEquals(listOf("A refund needs checking", "A refund couldn't be made"), alerts(clinic))
            assertEquals("payment_refund_failed", mails(s, p).last().template)
            assertTrue(Fixtures.sqlAll("SELECT error FROM provider_events WHERE error IS NOT NULL").none { "re_gone" in it })
        }
    }
}
