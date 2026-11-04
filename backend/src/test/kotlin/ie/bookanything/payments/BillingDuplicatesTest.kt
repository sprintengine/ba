package ie.bookanything.payments

import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.StripeTest
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * One plan subscription per business (docs/architecture.md section 7): plan checkouts asked for twice share a session,
 * a second subscription that still comes about is cancelled and refunded, and subscription events are applied as
 * Stripe has the subscription now, whatever order they arrive in.
 */
class BillingDuplicatesTest {
    private val pro = "price_pro_test"

    private fun planOf(clinic: Clinic): String = Fixtures.sqlAll(
        "SELECT plan::text || ' ' || coalesce(plan_status, '-') || ' ' || coalesce(stripe_subscription_id, '-') FROM businesses WHERE id = ?",
        clinic.id,
    ).single()

    private fun customer(clinic: Clinic, subscription: String? = null): String {
        val customer = "cus_${unique("dup")}"
        Fixtures.sql(
            "UPDATE businesses SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?", customer, subscription,
            UUID.fromString(clinic.id),
        )
        return customer
    }

    private fun alerts(clinic: Clinic) =
        Fixtures.sqlAll("SELECT title FROM notifications WHERE business_id = ? AND kind = 'payments_alert' ORDER BY created_at", clinic.id)

    private fun alertBodies(clinic: Clinic) =
        Fixtures.sqlAll("SELECT body FROM notifications WHERE business_id = ? AND kind = 'payments_alert' ORDER BY created_at", clinic.id)

    /** A business on Pro, billed by [first] (live at Stripe, with [firstStatus]); returns its customer. */
    private fun onPro(s: StripeWorld, clinic: Clinic, first: String, firstStatus: String = "active"): String {
        val customer = customer(clinic, first)
        Fixtures.sql("UPDATE businesses SET plan = 'pro', plan_status = ? WHERE id = ?", firstStatus, UUID.fromString(clinic.id))
        s.gateway.subscriptions[first] = StripeSubscription(first, firstStatus, customer, listOf(pro), ours(clinic), latestInvoice = null)
        return customer
    }

    /** The metadata of a subscription started from here. */
    private fun ours(clinic: Clinic) = mapOf("businessId" to clinic.id, "plan" to "pro")

    @Test
    fun `plan checkouts asked for twice share one session`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            suspend fun checkout(plan: String) = api.post(
                "${clinic.base}/billing/checkout", jsonOf("plan" to plan, "returnUrl" to "http://localhost:3000/x"), clinic.owner.token,
            )
            assertStatus(HttpStatusCode.OK, checkout("pro"))
            assertStatus(HttpStatusCode.OK, checkout("pro"))
            assertStatus(HttpStatusCode.OK, checkout("business"))
            val keys = s.gateway.sessions.map { it.options!!.idempotencyKey }
            assertEquals(keys[0], keys[1], "the same plan in the same window: the same session")
            assertTrue(keys[2] != keys[0], "another plan: its own")
            // A plan that started and ended within the window: a new session, not the finished one again.
            Fixtures.sql("UPDATE businesses SET plan_status = 'canceled' WHERE id = ?", UUID.fromString(clinic.id))
            assertStatus(HttpStatusCode.OK, checkout("pro"))
            assertTrue(s.gateway.sessions.last().options!!.idempotencyKey != keys[0])
            val expires = Instant.ofEpochSecond(s.gateway.sessions.first().params.expiresAt!!)
            val now = s.clock.instant()
            // Over Stripe's 30-minute minimum, with a margin.
            assertTrue(expires >= now.plusSeconds(32 * 60) && expires <= now.plusSeconds(62 * 60), "$expires")
        }
    }

    @Test
    fun `a second subscription is cancelled and refunded, once, and the first stays`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_first")
            val second = "sub_${unique("second")}"
            s.gateway.subscriptions[second] =
                StripeSubscription(second, "active", customer, listOf(pro), ours(clinic), latestInvoice = "in_second")
            s.gateway.invoicePayments["in_second"] = listOf(StripeInvoicePayment("pi_second_invoice", 1200, "eur"))

            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.send(api, s.subscription("customer.subscription.updated", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active sub_first", planOf(clinic))
            assertEquals(listOf(second), s.gateway.cancelledSubscriptions.map { it.params })
            val refund = s.gateway.refunds.single()
            assertEquals("pi_second_invoice", refund.params.paymentIntent)
            assertEquals(null, refund.options!!.stripeAccount, "on the platform account")
            assertEquals(listOf("A second plan subscription was cancelled"), alerts(clinic))
            assertTrue(second in alertBodies(clinic).single(), alertBodies(clinic).single())

            // Its deletion, once cancelled, changes nothing either.
            s.send(api, s.subscription("customer.subscription.deleted", second, customer, "canceled", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active sub_first", planOf(clinic))
            assertEquals(1, s.gateway.cancelledSubscriptions.size)
        }
    }

    @Test
    fun `a subscription event is applied as Stripe has it now, not as it was`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = customer(clinic)
            val sub = "sub_${unique("order")}"
            s.gateway.subscriptions[sub] = StripeSubscription(sub, "active", customer, listOf(pro), emptyMap(), null)
            s.send(api, s.subscription("customer.subscription.updated", sub, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active $sub", planOf(clinic))
            // An older event (still incomplete when it was sent) delivered late: Stripe says active, so it stays active.
            s.send(api, s.subscription("customer.subscription.created", sub, customer, "incomplete", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active $sub", planOf(clinic))
        }
    }

    @Test
    fun `a second subscription not started here is left to the owners`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_mine")
            val other = "sub_${unique("manual")}"
            s.gateway.subscriptions[other] = StripeSubscription(other, "active", customer, listOf(pro), emptyMap(), "in_manual")
            s.send(api, s.subscription("customer.subscription.created", other, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active sub_mine", planOf(clinic))
            assertTrue(s.gateway.cancelledSubscriptions.isEmpty())
            assertTrue(s.gateway.refunds.isEmpty())
            assertEquals(listOf("You have two plan subscriptions"), alerts(clinic))
            assertTrue("wasn't started here" in alertBodies(clinic).single() && other in alertBodies(clinic).single())
        }
    }

    @Test
    fun `when the subscription it had ended meanwhile, the second becomes the plan`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_ending")
            // Ended at Stripe; its deletion event isn't here yet.
            s.gateway.subscriptions["sub_ending"] = s.gateway.subscriptions["sub_ending"]!!.copy(status = "canceled")
            val second = "sub_${unique("next")}"
            s.gateway.subscriptions[second] = StripeSubscription(second, "active", customer, listOf(pro), ours(clinic), "in_next")
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active $second", planOf(clinic))
            assertTrue(s.gateway.cancelledSubscriptions.isEmpty())
            // The deletion that follows is about the old one: the plan stays.
            s.send(api, s.subscription("customer.subscription.deleted", "sub_ending", customer, "canceled", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active $second", planOf(clinic))
            assertTrue(alerts(clinic).isEmpty())
        }
    }

    @Test
    fun `a paid second subscription replaces one that is past due, and the old one is cancelled`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_overdue", firstStatus = "past_due")
            val second = "sub_${unique("paid")}"
            s.gateway.subscriptions[second] = StripeSubscription(second, "active", customer, listOf(pro), ours(clinic), "in_paid")
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active $second", planOf(clinic))
            assertEquals(listOf("sub_overdue"), s.gateway.cancelledSubscriptions.map { it.params })
            assertEquals(listOf("A second plan subscription was cancelled"), alerts(clinic))
            assertTrue("sub_overdue) was past due" in alertBodies(clinic).single(), alertBodies(clinic).single())
        }
    }

    @Test
    fun `a payment Stripe won't refund is said, and the others are still refunded`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_kept")
            val second = "sub_${unique("twice")}"
            s.gateway.subscriptions[second] = StripeSubscription(second, "active", customer, listOf(pro), ours(clinic), "in_twice")
            s.gateway.invoicePayments["in_twice"] = listOf(
                StripeInvoicePayment("pi_refused_part", 500, "eur"), StripeInvoicePayment("pi_refunded_part", 700, "eur"),
            )
            s.gateway.refusalCode = "charge_disputed"
            s.gateway.refuseRefunds.set(1)
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals(listOf(second), s.gateway.cancelledSubscriptions.map { it.params })
            assertEquals(listOf("pi_refunded_part"), s.gateway.refunds.map { it.params.paymentIntent })
            val body = alertBodies(clinic).single()
            assertTrue("€7" in body && "couldn't be refunded yet" in body, body)
        }
    }

    @Test
    fun `a subscription Stripe won't let us read is applied as the event says`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = customer(clinic)
            val sub = "sub_${unique("unread")}"
            s.gateway.refuseSubscriptionReads.set(1)
            s.send(api, s.subscription("customer.subscription.created", sub, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active $sub", planOf(clinic))
        }
    }

    @Test
    fun `a subscription Stripe never answers about is applied as the event says on its last attempt`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = customer(clinic)
            val sub = "sub_${unique("quiet")}"
            s.gateway.failSubscriptionReads.set(100)
            val event = s.subscription("customer.subscription.created", sub, customer, "active", pro)
            s.send(api, event, StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("free - -", planOf(clinic), "retried first")
            val eventId = Regex("\"id\":\"(evt_[^\"]+)\"").find(event)!!.groupValues[1]
            Fixtures.sql(
                "UPDATE jobs SET attempts = max_attempts - 1, run_at = now() WHERE kind = 'stripe_event' AND payload->>'eventId' = ?",
                eventId,
            )
            s.worker.drain()
            assertEquals("pro active $sub", planOf(clinic))
        }
    }

    @Test
    fun `only the plan subscription's failed invoice makes the plan past due`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_plan")
            fun failed(id: String, subscription: String) = StripeTest.event(
                "invoice.payment_failed",
                mapOf(
                    "id" to id, "object" to "invoice", "customer" to customer, "amount_due" to 1200,
                    "parent" to mapOf("subscription_details" to mapOf("subscription" to subscription)),
                ),
            )
            s.send(api, failed("in_other", "sub_other"), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active sub_plan", planOf(clinic))
            // The field of older API versions, at the top of the invoice.
            val older = StripeTest.event(
                "invoice.payment_failed",
                mapOf("id" to "in_older", "object" to "invoice", "customer" to customer, "subscription" to "sub_other"),
            )
            s.send(api, older, StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active sub_plan", planOf(clinic))
            s.send(api, failed("in_plan", "sub_plan"), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro past_due sub_plan", planOf(clinic))
        }
    }

    /** A plan subscription started here, live at Stripe, whose latest invoice paid 12 euro. */
    private fun second(s: StripeWorld, clinic: Clinic, customer: String, status: String = "active"): String {
        val id = "sub_${unique("second")}"
        s.gateway.subscriptions[id] = StripeSubscription(id, status, customer, listOf(pro), ours(clinic), latestInvoice = "in_$id")
        s.gateway.invoicePayments["in_$id"] = listOf(StripeInvoicePayment("pi_$id", 1200, "eur"))
        return id
    }

    private fun retryJobs(kind: String, lastAttempt: Boolean = false) = Fixtures.sql(
        "UPDATE jobs SET run_at = now()" + (if (lastAttempt) ", attempts = max_attempts - 1" else "") +
            " WHERE kind = ? AND status = 'pending'",
        kind,
    )

    @Test
    fun `a cancellation that stopped halfway is finished by the retry, once`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_halfway")
            val second = second(s, clinic, customer)
            s.gateway.failInvoicePayments.set(1)
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals(listOf(second), s.gateway.cancelledSubscriptions.map { it.params })
            assertTrue(s.gateway.refunds.isEmpty() && alerts(clinic).isEmpty(), "Stripe unreachable: retried")
            retryJobs(DuplicateSubscriptions.JOB_KIND)
            s.worker.drain()
            assertEquals(1, s.gateway.cancelledSubscriptions.size, "cancelled once")
            assertEquals(listOf("pi_$second"), s.gateway.refunds.map { it.params.paymentIntent })
            assertEquals(listOf("A second plan subscription was cancelled"), alerts(clinic))
        }
    }

    @Test
    fun `a refund Stripe never answers about is said on the last attempt, with the cancellation`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_unanswered")
            val second = second(s, clinic, customer)
            s.gateway.failRefunds.set(100)
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            retryJobs(DuplicateSubscriptions.JOB_KIND, lastAttempt = true)
            s.worker.drain()
            assertEquals(listOf("A second plan subscription was cancelled"), alerts(clinic))
            assertTrue("couldn't be refunded yet" in alertBodies(clinic).single(), alertBodies(clinic).single())
        }
    }

    @Test
    fun `a cancellation Stripe refuses is left to the owners`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_refusing")
            val second = second(s, clinic, customer)
            s.gateway.refuseCancels.set(1)
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertTrue(s.gateway.refunds.isEmpty())
            assertEquals(listOf("You have two plan subscriptions"), alerts(clinic))
            assertTrue("couldn't cancel $second" in alertBodies(clinic).single(), alertBodies(clinic).single())
        }
    }

    @Test
    fun `when the plan's deletion is handled before the job, the second becomes the plan`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_deleted_first")
            val second = second(s, clinic, customer)
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.gateway.subscriptions["sub_deleted_first"] = s.gateway.subscriptions["sub_deleted_first"]!!.copy(status = "canceled")
            s.send(
                api, s.subscription("customer.subscription.deleted", "sub_deleted_first", customer, "canceled", pro),
                StripeTest.WEBHOOK_SECRET,
            )
            s.worker.drain()
            assertEquals("pro active $second", planOf(clinic))
            assertTrue(s.gateway.cancelledSubscriptions.isEmpty())
        }
    }

    @Test
    fun `a past due second is still the plan when the one it had ended`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_ended")
            s.gateway.subscriptions["sub_ended"] = s.gateway.subscriptions["sub_ended"]!!.copy(status = "canceled")
            val second = second(s, clinic, customer, status = "past_due")
            s.send(api, s.subscription("customer.subscription.updated", second, customer, "past_due", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro past_due $second", planOf(clinic))
            assertTrue(s.gateway.cancelledSubscriptions.isEmpty())
        }
    }

    @Test
    fun `a subscription that isn't for a plan is not the plan's duplicate`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_the_plan")
            val other = "sub_${unique("addon")}"
            val created = s.subscription("customer.subscription.created", other, customer, "active", "price_addon")
            s.send(api, created, StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active sub_the_plan", planOf(clinic))
            assertTrue(s.gateway.cancelledSubscriptions.isEmpty() && alerts(clinic).isEmpty())
        }
    }

    @Test
    fun `a second subscription flagged for cancelling never replaces the plan`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_slipping")
            val second = second(s, clinic, customer)
            s.gateway.refuseCancels.set(1)
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            // The plan falls past due while the flagged second is still live: the second's next event changes nothing.
            Fixtures.sql("UPDATE businesses SET plan_status = 'past_due' WHERE id = ?", UUID.fromString(clinic.id))
            s.send(api, s.subscription("customer.subscription.updated", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro past_due sub_slipping", planOf(clinic))
            assertTrue(s.gateway.cancelledSubscriptions.isEmpty())
        }
    }

    @Test
    fun `a cancellation made before Stripe stopped answering is still said, with its refund outstanding`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_went_quiet")
            val second = second(s, clinic, customer)
            s.gateway.failInvoicePayments.set(1)
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals(listOf(second), s.gateway.cancelledSubscriptions.map { it.params })
            s.gateway.unreadableSubscriptions.add(second)
            retryJobs(DuplicateSubscriptions.JOB_KIND, lastAttempt = true)
            s.worker.drain()
            assertEquals(listOf("A second plan subscription was cancelled"), alerts(clinic))
            assertTrue("couldn't be refunded yet" in alertBodies(clinic).single(), alertBodies(clinic).single())
        }
    }

    @Test
    fun `a cancelled second is refunded even when the plan ends before the retry`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_ends_later")
            val second = second(s, clinic, customer)
            s.gateway.failInvoicePayments.set(1)
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            s.gateway.subscriptions["sub_ends_later"] = s.gateway.subscriptions["sub_ends_later"]!!.copy(status = "canceled")
            retryJobs(DuplicateSubscriptions.JOB_KIND)
            s.worker.drain()
            assertEquals(listOf("pi_$second"), s.gateway.refunds.map { it.params.paymentIntent })
            assertEquals(listOf("A second plan subscription was cancelled"), alerts(clinic))
        }
    }

    @Test
    fun `a second deleted after it was read is not adopted`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_gone_too")
            val second = second(s, clinic, customer)
            // The job's first attempt can't reach Stripe.
            s.gateway.failingSubscriptions.add("sub_gone_too")
            s.send(api, s.subscription("customer.subscription.created", second, customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            // The second's deletion is handled before the retry, which still reads it live (Stripe's answer from a moment
            // before), while the plan's own subscription has ended.
            s.send(api, s.subscription("customer.subscription.deleted", second, customer, "canceled", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            s.gateway.subscriptions[second] = s.gateway.subscriptions[second]!!.copy(status = "active")
            s.gateway.failingSubscriptions.clear()
            s.gateway.subscriptions["sub_gone_too"] = s.gateway.subscriptions["sub_gone_too"]!!.copy(status = "canceled")
            retryJobs(DuplicateSubscriptions.JOB_KIND)
            s.worker.drain()
            assertEquals("pro active sub_gone_too", planOf(clinic))
            assertTrue(
                Fixtures.sqlAll(
                    "SELECT 1 FROM audit_events WHERE business_id = ? AND action = 'billing.plan_changed'", clinic.id,
                ).isEmpty(),
            )
        }
    }

    @Test
    fun `a subscription that isn't for a plan never becomes the business's`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = customer(clinic)
            val other = "sub_${unique("addon")}"
            val created = s.subscription("customer.subscription.created", other, customer, "active", "price_addon")
            s.send(api, created, StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("free - -", planOf(clinic))
        }
    }

    @Test
    fun `a second Stripe won't let us check after the plan ended is said in its own words`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = onPro(s, clinic, "sub_over")
            val second = "sub_${unique("unchecked")}"
            s.gateway.unreadableSubscriptions.add(second)
            val created = s.subscription("customer.subscription.created", second, customer, "active", pro, ours(clinic))
            s.send(api, created, StripeTest.WEBHOOK_SECRET)
            s.gateway.subscriptions["sub_over"] = s.gateway.subscriptions["sub_over"]!!.copy(status = "canceled")
            s.send(api, s.subscription("customer.subscription.deleted", "sub_over", customer, "canceled", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("free canceled -", planOf(clinic))
            assertEquals(listOf("A plan subscription needs checking"), alerts(clinic))
            assertTrue("none" !in alertBodies(clinic).single(), alertBodies(clinic).single())
        }
    }
}
