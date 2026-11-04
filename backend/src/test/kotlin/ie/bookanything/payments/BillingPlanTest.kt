package ie.bookanything.payments

import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MarketplaceFixtures
import ie.bookanything.support.StripeTest
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The platform plan follows Stripe Billing (docs/architecture.md sections 5.3, 7 and 14): subscription events move a
 * business between free, pro and business, events for older subscriptions or unknown customers change nothing, and the
 * Free plan's limits apply again as soon as a business is downgraded.
 */
class BillingPlanTest {
    private val pro = "price_pro_test"
    private val business = "price_business_test"

    private fun billingCustomer(clinic: Clinic, customer: String = "cus_${unique("b")}", subscription: String? = null): String {
        Fixtures.sql(
            "UPDATE businesses SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?", customer, subscription,
            UUID.fromString(clinic.id),
        )
        return customer
    }

    private fun planOf(clinic: Clinic): String = Fixtures.sqlAll(
        "SELECT plan::text || ' ' || coalesce(plan_status, '-') || ' ' || coalesce(stripe_subscription_id, '-') " +
            "FROM businesses WHERE id = ?",
        clinic.id,
    ).single()

    @Test
    fun `subscription events move the plan between free, pro and business`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = billingCustomer(clinic)
            // (event, subscription, status, price) → "plan status subscription" afterwards
            val steps = listOf(
                listOf("customer.subscription.created", "sub_a", "incomplete", business) to "free incomplete sub_a",
                listOf("customer.subscription.updated", "sub_a", "active", pro) to "pro active sub_a",
                listOf("customer.subscription.updated", "sub_a", "active", business) to "business active sub_a",
                listOf("customer.subscription.updated", "sub_a", "past_due", business) to "business past_due sub_a",
                listOf("customer.subscription.updated", "sub_a", "active", pro) to "pro active sub_a",
                listOf("customer.subscription.updated", "sub_a", "unpaid", pro) to "free unpaid sub_a",
                listOf("customer.subscription.updated", "sub_a", "active", pro) to "pro active sub_a",
                listOf("customer.subscription.deleted", "sub_a", "canceled", pro) to "free canceled -",
                listOf("customer.subscription.created", "sub_b", "trialing", business) to "business trialing sub_b",
            )
            for ((event, expected) in steps) {
                val (type, sub, status, price) = event
                s.send(api, s.subscription(type, sub, customer, status, price), StripeTest.WEBHOOK_SECRET)
                s.worker.drain()
                assertEquals(expected, planOf(clinic), event.toString())
            }
            val billing = api.get("${clinic.base}/billing", clinic.owner.token).obj()
            assertEquals(listOf("business", "trialing"), listOf(billing.s("plan"), billing.s("status")))
            val changes = Fixtures.sqlAll(
                "SELECT summary->>'from' || '>' || (summary->>'to') FROM audit_events " +
                    "WHERE entity_id = ? AND action = 'billing.plan_changed' " +
                    "ORDER BY occurred_at, id",
                clinic.id,
            )
            assertEquals(steps.size, changes.size)
        }
    }

    @Test
    fun `events for an older subscription never override the current one`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = billingCustomer(clinic, subscription = "sub_new")
            Fixtures.sql("UPDATE businesses SET plan = 'business', plan_status = 'active' WHERE id = ?", UUID.fromString(clinic.id))
            for ((type, status) in listOf("customer.subscription.deleted" to "canceled", "customer.subscription.updated" to "past_due")) {
                s.send(api, s.subscription(type, "sub_old", customer, status, pro), StripeTest.WEBHOOK_SECRET)
                s.worker.drain()
                assertEquals("business active sub_new", planOf(clinic), type)
            }
        }
    }

    @Test
    fun `billing events for unknown customers or businesses are ignored and marked processed`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            billingCustomer(clinic)
            val events = listOf(
                s.subscription("customer.subscription.created", "sub_x", "cus_nobody", "active", business),
                s.subscription(
                    "customer.subscription.created", "sub_y", "cus_nobody", "active", business, mapOf("businessId" to "not-a-uuid"),
                ),
                s.subscription(
                    "customer.subscription.created", "sub_z", "cus_nobody", "active", business,
                    mapOf("businessId" to UUID.randomUUID().toString()),
                ),
                StripeTest.event("invoice.payment_failed", mapOf("id" to "in_x", "object" to "invoice", "customer" to "cus_nobody")),
                StripeTest.event(
                    "checkout.session.completed",
                    mapOf("id" to "cs_x", "object" to "checkout.session", "mode" to "subscription", "customer" to "cus_nobody"),
                ),
            )
            for (event in events) s.send(api, event, StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            val ids = events.map { Regex("\"id\":\"(evt_[^\"]+)\"").find(it)!!.groupValues[1] }
            val unprocessed = ids.filter { id ->
                Fixtures.sqlAll("SELECT id FROM provider_events WHERE id = ? AND processed_at IS NOT NULL AND error IS NULL", id).isEmpty()
            }
            assertEquals(emptyList(), unprocessed)
            assertEquals("free - -", planOf(clinic))
            // A payment failure on a business already on the free plan changes nothing either.
            val customer = Fixtures.sqlAll("SELECT stripe_customer_id FROM businesses WHERE id = ?", clinic.id).single()
            s.send(
                api, StripeTest.event("invoice.payment_failed", mapOf("id" to "in_y", "object" to "invoice", "customer" to customer)),
                StripeTest.WEBHOOK_SECRET,
            )
            s.worker.drain()
            assertEquals("free - -", planOf(clinic))
        }
    }

    @Test
    fun `after a downgrade the free plan's booking and team limits apply again`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val customer = billingCustomer(clinic)
            s.send(api, s.subscription("customer.subscription.created", "sub_team", customer, "active", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("pro active sub_team", planOf(clinic))

            // On Pro: a fourth member and more than 100 bookings this month.
            val members = listOf("admin", "staff", "staff").map { MarketplaceFixtures.member(api, clinic, it) }
            val pending = TestUser.create("pending")
            assertStatus(
                HttpStatusCode.Created,
                api.post("${clinic.base}/team/invitations", jsonOf("email" to pending.email, "role" to "staff"), clinic.owner.token),
            )
            for ((batch, start) in listOf("A" to "2026-10-07T10:00:00+01:00", "B" to "2026-10-07T11:00:00+01:00")) {
                assertStatus(HttpStatusCode.Created, api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Consult", start)))
                fillMonth(clinic, batch)
            }

            s.send(api, s.subscription("customer.subscription.deleted", "sub_team", customer, "canceled", pro), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("free canceled -", planOf(clinic))

            assertError(
                HttpStatusCode.Conflict, "PLAN_LIMIT_REACHED",
                api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Consult", "2026-10-07T12:00:00+01:00")),
            )
            assertError(
                HttpStatusCode.Conflict, "PLAN_LIMIT_REACHED",
                api.post(
                    "${clinic.base}/team/invitations", jsonOf("email" to TestUser.create("late").email, "role" to "staff"),
                    clinic.owner.token,
                ),
            )
            // The invitation sent on Pro can't be taken up while the team is over the Free limit; existing members keep access.
            val me = api.get("/v1/me", pending.token).obj()
            assertTrue(me["pendingInvitations"]!!.a.any { it.s("businessName") == "Test Clinic ${clinic.slug}" }, me.toString())
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("${clinic.base}/bookings", pending.token))
            for (member in members) assertStatus(HttpStatusCode.OK, api.get("${clinic.base}/bookings", member.token))
            // The limit counts every booking created this month, so the dashboard can't add one either (current behaviour;
            // docs/architecture.md 5.3 only names public bookings).
            assertError(
                HttpStatusCode.Conflict, "PLAN_LIMIT_REACHED",
                api.post(
                    "${clinic.base}/bookings",
                    jsonOf(
                        "serviceId" to clinic.service("Consult"), "start" to "2026-10-07T14:00:00+01:00",
                        "customer" to mapOf("name" to "Phone Booking"), "notifyCustomer" to false,
                    ),
                    clinic.owner.token,
                ),
            )
        }
    }

    /** 100 more bookings created this month (the Free plan's limit), as cancelled copies so they block no time. */
    private fun fillMonth(clinic: Clinic, batch: String) {
        Fixtures.sql(
            """
            INSERT INTO bookings (business_id, reference, customer_id, service_id, start_at, end_at, status, currency, created_at)
            SELECT c.business_id, 'BA-' || ? || lpad(g::text, 5, '0'), c.id, s.id, now(), now() + interval '1 hour', 'cancelled', 'EUR', ?
            FROM customers c JOIN services s ON s.business_id = c.business_id AND s.name = 'Consult', generate_series(1, 100) g
            WHERE c.id = (SELECT min(id::text)::uuid FROM customers WHERE business_id = ?)
            """.trimIndent(),
            batch, java.time.OffsetDateTime.parse("2026-10-05T08:00:00Z"), UUID.fromString(clinic.id),
        )
    }
}
