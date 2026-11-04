package ie.bookanything.payments

import com.stripe.param.checkout.SessionCreateParams
import ie.bookanything.business.Plan
import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.FakeStripeGateway
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.StripeTest
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonObject
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StripePaymentsTest {
    private val wed = "2026-10-07"
    private val thu = "2026-10-08"

    private class StripeEnv {
        val gateway = FakeStripeGateway()
        val clock = MutableClock(DEFAULT_NOW)
        val provider = StripePaymentProvider(gateway, StripeTest.config, clock)
        val testEnv = TestEnv(clock, TestConfig.config(stripe = StripeTest.config), payments = provider)
        val env get() = testEnv
        val worker = JobWorker(testEnv.ctx)
    }

    private fun connect(clinic: Clinic, account: String = "acct_${UUID.randomUUID().toString().take(8)}"): String {
        Fixtures.sql(
            "UPDATE businesses SET stripe_account_id = ?, stripe_charges_enabled = true, stripe_details_submitted = true WHERE id = ?",
            account, UUID.fromString(clinic.id),
        )
        return account
    }

    private suspend fun send(api: Api, s: StripeEnv, payload: String, secret: String = StripeTest.CONNECT_SECRET): JsonObject {
        val res = api.client.post("/v1/webhooks/stripe") {
            header("Stripe-Signature", StripeTest.signature(payload, secret, s.env.clock.instant().epochSecond))
            contentType(io.ktor.http.ContentType.Application.Json)
            setBody(payload)
        }
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()
    }

    private fun sessionCompleted(sessionId: String, paymentId: String, bookingId: String, amount: Int, pi: String) = mapOf(
        "id" to sessionId, "object" to "checkout.session", "mode" to "payment", "payment_status" to "paid", "status" to "complete",
        "amount_total" to amount, "currency" to "eur", "payment_intent" to pi,
        "metadata" to mapOf("paymentId" to paymentId, "bookingId" to bookingId),
    )

    private fun paymentRow(bookingId: String) = Fixtures.sqlOne(
        "SELECT id, provider_ref, status::text AS status FROM payments WHERE booking_id = ? AND kind = 'charge' ORDER BY created_at DESC LIMIT 1",
        UUID.fromString(bookingId),
    ) { Triple(it.getObject("id").toString(), it.getString("provider_ref"), it.getString("status")) }!!

    // ---- Unit: request parameters ----

    @Test
    fun `checkout is a direct charge on the connected account with no application fee`() {
        val gateway = FakeStripeGateway()
        val now = Instant.parse("2026-10-05T08:00:00Z")
        val provider = StripePaymentProvider(gateway, StripeTest.config, java.time.Clock.fixed(now, java.time.ZoneOffset.UTC))
        val business = sampleBusiness().copy(stripeAccountId = "acct_123", stripeChargesEnabled = true)
        val paymentId = UUID.randomUUID(); val bookingId = UUID.randomUUID()
        val session = provider.createCheckout(
            CheckoutRequest(
                paymentId, bookingId, business, 5000, "EUR", "Paid consult · Clinic",
                "guest@example.test", now.plus(Duration.ofMinutes(31)), "http://localhost:3000/manage/t?payment=succeeded",
                "http://localhost:3000/manage/t?payment=cancelled",
            ),
        )
        assertTrue(session.url.startsWith("https://checkout.stripe.test/"))
        val call = gateway.sessions.single()
        val p = call.params
        assertEquals("acct_123", call.options!!.stripeAccount)
        assertEquals("bookanything-checkout-$paymentId", call.options.idempotencyKey)
        assertEquals(SessionCreateParams.Mode.PAYMENT, p.mode)
        assertNull(p.paymentIntentData.applicationFeeAmount, "no application fee")
        assertNull(p.paymentIntentData.transferData, "direct charge, not a destination charge")
        assertEquals(now.plus(Duration.ofMinutes(31)).epochSecond, p.expiresAt)
        assertEquals(
            mapOf("bookingId" to bookingId.toString(), "paymentId" to paymentId.toString(), "businessId" to business.id.toString()),
            p.metadata,
        )
        assertEquals(p.metadata, p.paymentIntentData.metadata)
        assertEquals(5000L, p.lineItems.single().priceData.unitAmount)
        assertEquals("eur", p.lineItems.single().priceData.currency)
        assertEquals("guest@example.test", p.customerEmail)
        assertEquals("http://localhost:3000/manage/t?payment=succeeded", p.successUrl)

        // Expiry is clamped into Stripe's accepted window (≥ 30 minutes, ≤ 24 hours).
        val short = provider.checkoutParams(
            CheckoutRequest(paymentId, bookingId, business, 5000, "EUR", "x", null, now.plus(Duration.ofMinutes(5)), "s", "c"),
        )
        assertTrue(short.expiresAt!! >= now.plus(Duration.ofMinutes(30)).epochSecond)
        val long = provider.checkoutParams(
            CheckoutRequest(paymentId, bookingId, business, 5000, "EUR", "x", null, now.plus(Duration.ofDays(3)), "s", "c"),
        )
        assertTrue(long.expiresAt!! < now.plus(Duration.ofHours(24)).epochSecond)
        assertEquals(31, provider.minHoldMinutes)
    }

    @Test
    fun `refunds go to the connected account with an idempotency key`() {
        val gateway = FakeStripeGateway()
        val provider = StripePaymentProvider(gateway, StripeTest.config)
        val business = sampleBusiness().copy(stripeAccountId = "acct_9", stripeChargesEnabled = true)
        val refundId = UUID.randomUUID()
        val r = provider.refund(RefundRequest(refundId, business, "pi_abc", 2500, "EUR"))
        assertTrue(r.succeeded)
        val call = gateway.refunds.single()
        assertEquals("pi_abc", call.params.paymentIntent)
        assertEquals(2500L, call.params.amount)
        assertEquals("acct_9", call.options!!.stripeAccount)
        assertEquals("bookanything-refund-$refundId", call.options.idempotencyKey)
        // A charge still identified by its Checkout Session resolves the PaymentIntent first.
        provider.refund(RefundRequest(UUID.randomUUID(), business, "cs_test_1", 100, "EUR"))
        assertEquals("pi_for_cs_test_1", gateway.refunds.last().params.paymentIntent)
        gateway.refundStatus = "failed"
        assertEquals(false, provider.refund(RefundRequest(UUID.randomUUID(), business, "pi_x", 100, "EUR")).succeeded)
    }

    @Test
    fun `connect creates a Stripe-hosted account once and billing uses the configured prices`() {
        val gateway = FakeStripeGateway()
        val provider = StripePaymentProvider(gateway, StripeTest.config)
        val business = sampleBusiness()
        val link = provider.createConnectLink(business, "http://localhost:3000/dashboard/x/settings/payments")
        assertNotNull(link.accountId)
        val account = gateway.accounts.single()
        assertEquals("IE", account.params.country)
        assertEquals(com.stripe.param.AccountCreateParams.Controller.Fees.Payer.ACCOUNT, account.params.controller.fees.payer)
        assertEquals(
            com.stripe.param.AccountCreateParams.Controller.RequirementCollection.STRIPE, account.params.controller.requirementCollection,
        )
        assertEquals("bookanything-account-${business.id}", account.options!!.idempotencyKey)
        assertEquals(com.stripe.param.AccountLinkCreateParams.Type.ACCOUNT_ONBOARDING, gateway.accountLinks.single().type)
        assertEquals("http://localhost:3000/dashboard/x/settings/payments?stripe=return", gateway.accountLinks.single().returnUrl)
        // Existing account: link only.
        val again = provider.createConnectLink(business.copy(stripeAccountId = link.accountId), "http://localhost:3000/r")
        assertNull(again.accountId)
        assertEquals(1, gateway.accounts.size)

        val billing = provider.createBillingCheckout(business, Plan.BUSINESS, "http://localhost:3000/b", "owner@example.test")
        assertNotNull(billing.customerId)
        val sub = gateway.sessions.single().params
        assertEquals(SessionCreateParams.Mode.SUBSCRIPTION, sub.mode)
        assertEquals("price_business_test", sub.lineItems.single().price)
        assertEquals(billing.customerId, sub.customer)
        assertEquals(business.id.toString(), sub.subscriptionData.metadata["businessId"])
        assertNull(gateway.sessions.single().options!!.stripeAccount, "billing runs on the platform account")
        assertEquals("owner@example.test", gateway.customers.single().params.email)
        assertError0 { provider.createBillingPortal(business, "http://localhost:3000/b") }
        assertEquals(
            "https://billing.stripe.test/p/session/cus_1",
            provider.createBillingPortal(business.copy(stripeCustomerId = "cus_1"), "http://localhost:3000/b"),
        )
    }

    private fun assertError0(block: () -> Unit) {
        val e = runCatching(block).exceptionOrNull()
        assertTrue(e is ie.bookanything.http.ApiException, "expected an ApiException, got $e")
    }

    @Test
    fun `subscriptions map to plans`() {
        val c = StripeTest.config
        fun map(
            type: String, status: String, prices: List<String>, current: Plan = Plan.FREE, currentSub: String? = null,
            sub: String = "sub_1",
        ) =
            PlanMapping.fromSubscription(type, sub, status, prices, null, c, current, currentSub)
        assertEquals(
            PlanMapping.Change(Plan.PRO, "active", "sub_1"), map("customer.subscription.created", "active", listOf("price_pro_test")),
        )
        assertEquals(Plan.BUSINESS, map("customer.subscription.updated", "active", listOf("price_business_test"), Plan.PRO, "sub_1")!!.plan)
        assertEquals(
            PlanMapping.Change(Plan.PRO, "past_due", "sub_1"),
            map("customer.subscription.updated", "past_due", listOf("price_pro_test"), Plan.PRO, "sub_1"),
        )
        assertEquals(
            PlanMapping.Change(Plan.FREE, "incomplete", "sub_1"),
            map("customer.subscription.created", "incomplete", listOf("price_pro_test")),
        )
        assertEquals(
            PlanMapping.Change(Plan.FREE, "canceled", null),
            map("customer.subscription.deleted", "canceled", listOf("price_pro_test"), Plan.PRO, "sub_1"),
        )
        assertEquals(
            PlanMapping.Change(Plan.FREE, "unpaid", "sub_1"),
            map("customer.subscription.updated", "unpaid", listOf("price_pro_test"), Plan.PRO, "sub_1"),
        )
        // An old subscription ending does not downgrade the business's current one.
        assertNull(map("customer.subscription.deleted", "canceled", listOf("price_pro_test"), Plan.BUSINESS, "sub_2"))
        assertEquals("trialing", map("customer.subscription.created", "trialing", listOf("price_pro_test"))!!.planStatus)
        assertEquals(Plan.PRO, PlanMapping.planForPrices(emptyList(), c, "pro"))
        assertNull(PlanMapping.planForPrices(listOf("price_other"), c, null))
    }

    @Test
    fun `withQuery keeps existing query and fragment`() {
        assertEquals("https://a.test/x?stripe=return", StripePaymentProvider.withQuery("https://a.test/x", "stripe=return"))
        assertEquals("https://a.test/x?a=1&stripe=return#top", StripePaymentProvider.withQuery("https://a.test/x?a=1#top", "stripe=return"))
    }

    // ---- Integration: webhooks, booking flow, refunds, billing ----

    @Test
    fun `webhook signatures are verified with the Stripe SDK`() {
        val s = StripeEnv()
        withApp(s.testEnv) { api ->
            val payload = StripeTest.event("customer.created", mapOf("id" to "cus_x", "object" to "customer"))
            val ts = s.env.clock.instant().epochSecond
            suspend fun post(sig: String?, body: String = payload) = api.client.post("/v1/webhooks/stripe") {
                if (sig != null) header("Stripe-Signature", sig)
                contentType(io.ktor.http.ContentType.Application.Json); setBody(body)
            }
            assertStatus(HttpStatusCode.OK, post(StripeTest.signature(payload, StripeTest.WEBHOOK_SECRET, ts)))
            assertStatus(HttpStatusCode.OK, post(StripeTest.signature(payload, StripeTest.CONNECT_SECRET, ts)))
            assertError(HttpStatusCode.BadRequest, "INVALID_SIGNATURE", post(StripeTest.signature(payload, "whsec_wrong", ts)))
            assertError(
                HttpStatusCode.BadRequest, "INVALID_SIGNATURE",
                post(StripeTest.signature(payload, StripeTest.WEBHOOK_SECRET, ts), payload.replace("cus_x", "cus_y")),
            )
            assertError(
                HttpStatusCode.BadRequest, "INVALID_SIGNATURE", post(StripeTest.signature(payload, StripeTest.WEBHOOK_SECRET, ts - 3600)),
            )
            assertError(HttpStatusCode.BadRequest, "INVALID_SIGNATURE", post(null))
            // Unhandled types are stored and marked processed; replays are acknowledged as duplicates.
            val again = post(StripeTest.signature(payload, StripeTest.WEBHOOK_SECRET, ts)).obj()
            assertEquals("true", again["duplicate"].toString())
        }
        // Without secrets the endpoint is off.
        withApp(TestEnv()) { api ->
            assertError(HttpStatusCode.ServiceUnavailable, "WEBHOOKS_NOT_CONFIGURED", api.post("/v1/webhooks/stripe", "{}"))
        }
    }

    @Test
    fun `checkout completion confirms the booking exactly once`() {
        val s = StripeEnv()
        withApp(s.testEnv) { api ->
            val clinic = Fixtures.clinic(api)
            val account = connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", "${wed}T10:00:00+01:00")
            val booking = held["booking"]!!
            assertEquals("held", booking.s("status"))
            // Stripe needs ≥ 30 minutes, so the clinic's 15-minute hold is lengthened to 31.
            val holdExpires = java.time.OffsetDateTime.parse(booking.s("holdExpiresAt")).toInstant()
            assertEquals(s.env.clock.instant().plus(Duration.ofMinutes(31)), holdExpires)
            val call = s.gateway.sessions.last()
            assertEquals(account, call.options!!.stripeAccount)
            assertEquals(holdExpires.epochSecond, call.params.expiresAt)
            assertTrue(held["next"]!!.s("checkoutUrl").startsWith("https://checkout.stripe.test/"))

            val (paymentId, sessionId, _) = paymentRow(booking.s("id"))
            val event = StripeTest.event(
                "checkout.session.completed", sessionCompleted(sessionId, paymentId, booking.s("id"), 5000, "pi_ok_1"), account,
            )
            send(api, s, event)
            assertEquals("true", send(api, s, event)["duplicate"].toString())
            s.worker.drain()
            val view = api.get("/v1/public/manage/${held.s("manageToken")}").obj()
            assertEquals("confirmed", view.s("status"))
            assertEquals("paid", view.s("paymentStatus"))
            assertEquals(5000, view.i("amountPaidCents"))
            assertEquals("pi_ok_1", paymentRow(booking.s("id")).second)
            val eventId = Regex("\"id\":\"(evt_[^\"]+)\"").find(event)!!.groupValues[1]
            assertNotNull(Fixtures.sqlOne("SELECT processed_at FROM provider_events WHERE id = ?", eventId) { it.getObject(1) })
            assertEquals(1, s.testEnv.email.sent.count { it.template == "booking_confirmed" && it.to == view["customer"]!!.s("email") })

            // Re-processing the same stored event (e.g. a retried job) changes nothing.
            Fixtures.sql("INSERT INTO jobs (kind, payload) VALUES ('stripe_event', ?::jsonb)", "{\"eventId\":\"$eventId\"}")
            s.worker.drain()
            assertEquals(5000, api.get("/v1/public/manage/${held.s("manageToken")}").obj().i("amountPaidCents"))
        }
    }

    @Test
    fun `events from another connected account are ignored and expired sessions release the hold`() {
        val s = StripeEnv()
        withApp(s.testEnv) { api ->
            val clinic = Fixtures.clinic(api)
            val account = connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", "${wed}T11:00:00+01:00")
            val bookingId = held["booking"]!!.s("id")
            val (paymentId, sessionId, _) = paymentRow(bookingId)
            send(
                api, s,
                StripeTest.event(
                    "checkout.session.completed", sessionCompleted(sessionId, paymentId, bookingId, 5000, "pi_evil"),
                    "acct_attacker",
                ),
            )
            s.worker.drain()
            assertEquals("held", api.get("/v1/public/manage/${held.s("manageToken")}").obj().s("status"))

            send(
                api, s,
                StripeTest.event(
                    "checkout.session.expired",
                    mapOf(
                        "id" to sessionId, "object" to "checkout.session", "mode" to "payment",
                        "status" to "expired", "metadata" to mapOf("paymentId" to paymentId, "bookingId" to bookingId),
                    ),
                    account,
                ),
            )
            s.worker.drain()
            assertEquals("expired", api.get("/v1/public/manage/${held.s("manageToken")}").obj().s("status"))
            assertEquals("cancelled", paymentRow(bookingId).third)
        }
    }

    @Test
    fun `a payment after the slot was taken is refunded in full with an apology`() {
        val s = StripeEnv()
        withApp(s.testEnv) { api ->
            val clinic = Fixtures.clinic(api)
            val account = connect(clinic)
            val alex = clinic.resource("Alex")
            val start = "${wed}T12:00:00+01:00"
            val first = Fixtures.book(api, clinic, "Paid consult", start, resourceId = alex, email = "late.payer@example.test")
            val firstId = first["booking"]!!.s("id")
            val (paymentId, sessionId, _) = paymentRow(firstId)
            s.env.clock.advanceMinutes(32)
            Fixtures.book(api, clinic, "Paid consult", start, resourceId = alex) // takes the released slot
            send(
                api, s,
                StripeTest.event("checkout.session.completed", sessionCompleted(sessionId, paymentId, firstId, 5000, "pi_late"), account),
            )
            s.worker.drain()
            val view = api.get("/v1/public/manage/${first.s("manageToken")}").obj()
            assertEquals("cancelled", view.s("status"))
            assertEquals("refunded", view.s("paymentStatus"))
            assertEquals(5000, view.i("amountRefundedCents"))
            val refund = s.gateway.refunds.last()
            assertEquals("pi_late", refund.params.paymentIntent)
            assertEquals(5000L, refund.params.amount)
            assertEquals(account, refund.options!!.stripeAccount)
            val apology = s.testEnv.email.sent.single { it.to == "late.payer@example.test" && it.template == "payment_refunded_apology" }
            assertTrue(apology.text.contains("€50.00"))
        }
    }

    @Test
    fun `cancellation refunds through Stripe, failed refunds are retried, and dashboard refunds are reconciled`() {
        val s = StripeEnv()
        withApp(s.testEnv) { api ->
            val clinic = Fixtures.clinic(api)
            val account = connect(clinic)
            suspend fun paid(start: String, pi: String, email: String): JsonObject {
                val held = Fixtures.book(api, clinic, "Paid consult", start, email = email)
                val id = held["booking"]!!.s("id")
                val (paymentId, sessionId, _) = paymentRow(id)
                send(api, s, StripeTest.event("checkout.session.completed", sessionCompleted(sessionId, paymentId, id, 5000, pi), account))
                s.worker.drain()
                return held
            }
            // Early customer cancellation → full refund on the connected account; the cancellation email states it.
            val a = paid("${thu}T10:00:00+01:00", "pi_a", "cancel.a@example.test")
            val cancelled = api.post("/v1/public/manage/${a.s("manageToken")}/cancel", jsonOf("reason" to "Travelling")).obj()
            assertEquals("refunded", cancelled.s("paymentStatus"))
            assertEquals("pi_a", s.gateway.refunds.last().params.paymentIntent)
            s.worker.drain()
            val mail = s.testEnv.email.sent.single { it.to == "cancel.a@example.test" && it.template == "booking_cancelled" }
            assertTrue(mail.text.contains("A refund of €50.00"), mail.text)

            // Stripe is down during the cancellation: the booking is cancelled, the refund is retried by a job.
            val b = paid("${thu}T12:00:00+01:00", "pi_b", "cancel.b@example.test")
            s.gateway.failRefunds.set(1)
            val c2 = api.post("/v1/public/manage/${b.s("manageToken")}/cancel").obj()
            assertEquals("cancelled", c2.s("status"))
            assertEquals(0, c2.i("amountRefundedCents"))
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'payment_refund_retry' AND status = 'pending'")
            s.worker.drain()
            val after = api.get("/v1/public/manage/${b.s("manageToken")}").obj()
            assertEquals(5000, after.i("amountRefundedCents"))
            assertEquals("refunded", after.s("paymentStatus"))
            assertTrue(
                s.testEnv.email.sent.any {
                    it.to == "cancel.b@example.test" && it.template == "booking_cancelled" && it.text.contains("being processed")
                },
            )
            assertTrue(s.testEnv.email.sent.any { it.to == "cancel.b@example.test" && it.template == "payment_refunded" })

            // A partial refund made in the Stripe dashboard is recorded from charge.refunded.
            val c = paid("${thu}T14:00:00+01:00", "pi_c", "refund.c@example.test")
            send(
                api, s,
                StripeTest.event(
                    "charge.refunded",
                    mapOf(
                        "id" to "ch_c", "object" to "charge", "payment_intent" to "pi_c",
                        "amount" to 5000, "amount_refunded" to 2000, "refunded" to false,
                    ),
                    account,
                ),
            )
            s.worker.drain()
            val cv = api.get("/v1/public/manage/${c.s("manageToken")}").obj()
            assertEquals(2000, cv.i("amountRefundedCents"))
            assertEquals("partially_refunded", cv.s("paymentStatus"))
            assertTrue(
                s.testEnv.email.sent.any {
                    it.to == "refund.c@example.test" && it.template == "payment_refunded" && it.text.contains("€20.00")
                },
            )
        }
    }

    @Test
    fun `a refund reported before the checkout's completion waits for it instead of being dropped`() {
        val s = StripeEnv()
        withApp(s.testEnv) { api ->
            val clinic = Fixtures.clinic(api)
            val account = connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", "${thu}T15:00:00+01:00")
            val id = held["booking"]!!.s("id")
            val (paymentId, sessionId, _) = paymentRow(id)
            val tag = UUID.randomUUID().toString().take(8)
            fun refunded(pi: String, metadata: Map<String, String>) = StripeTest.event(
                "charge.refunded",
                mapOf(
                    "id" to "ch_$pi", "object" to "charge", "payment_intent" to pi, "amount" to 5000, "amount_refunded" to 2000,
                    "refunded" to false, "metadata" to metadata,
                ),
                account, id = "evt_refund_${pi}_$tag",
            )
            fun processed(eventId: String) =
                Fixtures.sqlOne("SELECT processed_at IS NOT NULL FROM provider_events WHERE id = ?", eventId) { it.getBoolean(1) }

            // A charge that isn't one of ours is still ignored (and done with).
            send(api, s, refunded("pi_someone_else", emptyMap()))
            // Ours, while the payment is still known only by its Checkout Session: kept for a retry.
            send(api, s, refunded("pi_early", mapOf("paymentId" to paymentId, "bookingId" to id)))
            s.worker.drain()
            assertEquals(true, processed("evt_refund_pi_someone_else_$tag"))
            assertEquals(false, processed("evt_refund_pi_early_$tag"))
            assertEquals(0, api.get("/v1/public/manage/${held.s("manageToken")}").obj().i("amountRefundedCents"))

            val completed = sessionCompleted(sessionId, paymentId, id, 5000, "pi_early")
            send(api, s, StripeTest.event("checkout.session.completed", completed, account))
            s.worker.drain()
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'stripe_event' AND status = 'pending'")
            s.worker.drain()
            assertEquals(true, processed("evt_refund_pi_early_$tag"))
            val view = api.get("/v1/public/manage/${held.s("manageToken")}").obj()
            assertEquals("confirmed partially_refunded", "${view.s("status")} ${view.s("paymentStatus")}")
            assertEquals(2000, view.i("amountRefundedCents"))
        }
    }

    @Test
    fun `connect onboarding, account updates and billing subscriptions`() {
        val s = StripeEnv()
        withApp(s.testEnv) { api ->
            val clinic = Fixtures.clinic(api)
            val base = clinic.base
            val status0 = api.get("$base/payments/status", clinic.owner.token).obj()
            assertEquals("stripe", status0.s("provider"))
            assertEquals("false", status0["connected"].toString())

            val link = api.post(
                "$base/payments/connect",
                jsonOf("returnUrl" to "http://localhost:3000/dashboard/${clinic.slug}/settings/payments"), clinic.owner.token,
            )
            assertStatus(HttpStatusCode.OK, link)
            assertTrue(link.obj().s("url").startsWith("https://connect.stripe.test/setup/acct_new_"))
            val accountId = Fixtures.sqlOne(
                "SELECT stripe_account_id FROM businesses WHERE id = ?", UUID.fromString(clinic.id),
            ) { it.getString(1) }!!
            assertError(
                HttpStatusCode.BadRequest, "INVALID_REQUEST",
                api.post("$base/payments/connect", jsonOf("returnUrl" to "https://evil.example/x"), clinic.owner.token),
            )

            // Status is read live from Stripe and stored.
            s.gateway.accountState = s.gateway.accountState.copy(chargesEnabled = false, detailsSubmitted = true)
            val st = api.get("$base/payments/status", clinic.owner.token).obj()
            assertEquals("false", st["chargesEnabled"].toString())
            // account.updated turns charges on.
            send(
                api, s,
                StripeTest.event(
                    "account.updated",
                    mapOf("id" to accountId, "object" to "account", "charges_enabled" to true, "details_submitted" to true), accountId,
                ),
            )
            s.worker.drain()
            assertEquals(
                true,
                Fixtures.sqlOne(
                    "SELECT stripe_charges_enabled FROM businesses WHERE id = ?",
                    UUID.fromString(clinic.id),
                ) { it.getBoolean(1) },
            )

            // Billing checkout creates the customer once and returns the hosted URL.
            val checkout = api.post(
                "$base/billing/checkout",
                jsonOf("plan" to "pro", "returnUrl" to "http://localhost:3000/dashboard/${clinic.slug}/settings/billing"),
                clinic.owner.token,
            )
            assertStatus(HttpStatusCode.OK, checkout)
            val customerId = Fixtures.sqlOne(
                "SELECT stripe_customer_id FROM businesses WHERE id = ?", UUID.fromString(clinic.id),
            ) { it.getString(1) }!!
            assertEquals("price_pro_test", s.gateway.sessions.last().params.lineItems.single().price)

            fun sub(
                status: String, price: String, id: String = "sub_${clinic.slug}",
            ) = mapOf(
                "id" to id, "object" to "subscription", "customer" to customerId,
                "status" to status, "metadata" to mapOf("businessId" to clinic.id, "plan" to "pro"),
                "items" to mapOf("object" to "list", "data" to listOf(mapOf("id" to "si_1", "price" to mapOf("id" to price)))),
            )
            send(api, s, StripeTest.event("customer.subscription.created", sub("active", "price_pro_test")), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            val billing = api.get("$base/billing", clinic.owner.token).obj()
            assertEquals("pro", billing.s("plan"))
            assertEquals("active", billing.s("status"))
            assertError(
                HttpStatusCode.Conflict, "CONFLICT",
                api.post(
                    "$base/billing/checkout", jsonOf("plan" to "business", "returnUrl" to "http://localhost:3000/x"), clinic.owner.token,
                ),
            )
            val portal = api.post("$base/billing/portal", jsonOf("returnUrl" to "http://localhost:3000/x"), clinic.owner.token)
            assertEquals("https://billing.stripe.test/p/session/$customerId", portal.obj().s("url"))

            send(
                api, s,
                StripeTest.event(
                    "invoice.payment_failed",
                    mapOf("id" to "in_1", "object" to "invoice", "customer" to customerId, "amount_due" to 1200),
                ),
                StripeTest.WEBHOOK_SECRET,
            )
            s.worker.drain()
            assertEquals("past_due", api.get("$base/billing", clinic.owner.token).obj().s("status"))

            send(api, s, StripeTest.event("customer.subscription.deleted", sub("canceled", "price_pro_test")), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("free", api.get("$base/billing", clinic.owner.token).obj().s("plan"))

            // A stale or retried event about the deleted subscription doesn't bring the paid plan back.
            for (type in listOf("customer.subscription.updated", "customer.subscription.created")) {
                send(api, s, StripeTest.event(type, sub("active", "price_pro_test")), StripeTest.WEBHOOK_SECRET)
            }
            s.worker.drain()
            val after = api.get("$base/billing", clinic.owner.token).obj()
            assertEquals("free canceled", "${after.s("plan")} ${after.s("status")}")
            // A new subscription does.
            val renewed = sub("active", "price_business_test", id = "sub_${clinic.slug}_2")
            send(api, s, StripeTest.event("customer.subscription.created", renewed), StripeTest.WEBHOOK_SECRET)
            s.worker.drain()
            assertEquals("business", api.get("$base/billing", clinic.owner.token).obj().s("plan"))
        }
    }

    @Test
    fun `billing events from a connected account never change the business plan`() {
        val s = StripeEnv()
        withApp(s.testEnv) { api ->
            val clinic = Fixtures.clinic(api)
            val account = connect(clinic)
            // A business with a Standard account can create its own subscription (any metadata) on that account;
            // Stripe then delivers the event to the Connect endpoint.
            val sub = mapOf(
                "id" to "sub_own_account", "object" to "subscription", "customer" to "cus_on_connected_account",
                "status" to "active", "metadata" to mapOf("businessId" to clinic.id, "plan" to "business"),
                "items" to mapOf("object" to "list", "data" to listOf(mapOf("id" to "si_x", "price" to mapOf("id" to "price_their_own")))),
            )
            send(api, s, StripeTest.event("customer.subscription.created", sub, account))
            send(
                api, s,
                StripeTest.event(
                    "checkout.session.completed",
                    mapOf(
                        "id" to "cs_own", "object" to "checkout.session", "mode" to "subscription",
                        "customer" to "cus_on_connected_account", "subscription" to "sub_own_account", "client_reference_id" to clinic.id,
                        "metadata" to mapOf("businessId" to clinic.id, "plan" to "business"),
                    ),
                    account,
                ),
            )
            s.worker.drain()
            val row = Fixtures.sqlOne(
                "SELECT plan::text, stripe_customer_id, stripe_subscription_id FROM businesses WHERE id = ?", UUID.fromString(clinic.id),
            ) {
                Triple(it.getString(1), it.getString(2), it.getString(3))
            }!!
            assertEquals(Triple("free", null, null), row)
        }
    }

    @Test
    fun `a checkout whose amount or currency differs from the payment does not confirm the booking`() {
        val s = StripeEnv()
        withApp(s.testEnv) { api ->
            val clinic = Fixtures.clinic(api)
            val account = connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", "${wed}T10:00:00+01:00")
            val bookingId = held["booking"]!!.s("id")
            val (paymentId, sessionId, _) = paymentRow(bookingId)
            send(
                api, s,
                StripeTest.event("checkout.session.completed", sessionCompleted(sessionId, paymentId, bookingId, 100, "pi_cheap"), account),
            )
            val wrongCurrency = sessionCompleted(sessionId, paymentId, bookingId, 5000, "pi_usd") + ("currency" to "usd")
            send(api, s, StripeTest.event("checkout.session.completed", wrongCurrency, account))
            s.worker.drain()
            val view = api.get("/v1/public/manage/${held.s("manageToken")}").obj()
            assertEquals("held", view.s("status"))
            assertEquals(0, view.i("amountPaidCents"))
            assertEquals("pending", paymentRow(bookingId).third)
        }
    }
}

/** A business row for provider unit tests (no database). */
internal fun sampleBusiness() = ie.bookanything.business.BusinessRow(
    id = UUID.randomUUID(), slug = "sample", name = "Sample Clinic", description = null, industry = "physio",
    zone = java.time.ZoneId.of("Europe/Dublin"), currency = "EUR", locale = "en-IE", country = "IE", status = "active",
    contactEmail = "hello@sample.test", contactPhone = null, address = ie.bookanything.business.Address(), websiteUrl = null,
    branding = ie.bookanything.business.Branding(), vocabulary = ie.bookanything.business.Vocabulary(),
    policies = ie.bookanything.business.Policies(),
    stripeAccountId = null, stripeChargesEnabled = false, stripeDetailsSubmitted = false, plan = Plan.FREE, planStatus = null,
    createdAt = Instant.now(),
)
