package ie.bookanything.payments

import ie.bookanything.auth.TokenService
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.Roles
import ie.bookanything.support.StripeTest
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.Url
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.util.Base64
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * "I already have a Stripe account" (docs/architecture.md section 7): Stripe Connect OAuth with a signed, single-use,
 * short-lived state bound to the business and its owner, completed by that owner signed in; only the account id is kept;
 * the account must fit the business; disconnecting never strands a payment or a refund.
 */
class ConnectExistingTest {
    /** The only page Stripe's answer may come back to: the business's own payments settings. */
    private fun page(clinic: Clinic) = "http://localhost:3000/dashboard/${clinic.slug}/settings/payments"
    private val dashboardInvalid = "http://localhost:3000/dashboard?stripe=connect_error&reason=invalid"

    /** Starts connecting [clinic] as [token] (its owner by default); returns the state Stripe would carry back. */
    private suspend fun start(api: Api, clinic: Clinic, token: String = clinic.owner.token): String {
        val res = api.post("${clinic.base}/payments/connect/existing", jsonOf("returnUrl" to page(clinic)), token)
        assertStatus(HttpStatusCode.OK, res)
        return Url(res.obj().s("url")).parameters["state"]!!
    }

    /** Stripe's redirect to our callback; returns where we send the browser. */
    private suspend fun callback(api: Api, query: String): String {
        val res = api.get("/v1/payments/stripe/callback?$query")
        assertEquals(HttpStatusCode.Found, res.status)
        return res.headers[HttpHeaders.Location]!!
    }

    private suspend fun complete(api: Api, clinic: Clinic, state: String, code: String, token: String = clinic.owner.token): JsonObject {
        val res = api.post("${clinic.base}/payments/connect/existing/complete", jsonOf("state" to state, "code" to code), token)
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()
    }

    /** The whole round trip for [account]: start, Stripe's redirect, and the owner's page completing it. Returns the outcome. */
    private suspend fun connect(s: StripeWorld, api: Api, clinic: Clinic, account: String, token: String = clinic.owner.token): JsonObject {
        val state = start(api, clinic, token)
        val back = Url(callback(api, "scope=read_write&code=${s.gateway.authorize(account)}&state=$state"))
        assertEquals("complete", back.parameters["stripe"])
        return complete(api, clinic, back.parameters["state"]!!, back.parameters["code"]!!, token)
    }

    private fun stripeColumns(clinic: Clinic): List<String?> = Fixtures.sqlOne(
        "SELECT stripe_account_id, stripe_connect_method, stripe_charges_enabled::text AS charges FROM businesses WHERE id = ?",
        UUID.fromString(clinic.id),
    ) { listOf(it.getString("stripe_account_id"), it.getString("stripe_connect_method"), it.getString("charges")) }!!

    private fun audits(clinic: Clinic, action: String): List<String> = Fixtures.sqlAll(
        "SELECT coalesce(summary->>'reason', summary->>'account', '-') FROM audit_events WHERE entity_id = ? AND action = ? " +
            "ORDER BY occurred_at, id",
        clinic.id, action,
    )

    private suspend fun createAccount(api: Api, clinic: Clinic) =
        api.post("${clinic.base}/payments/connect", jsonOf("returnUrl" to page(clinic)), clinic.owner.token)

    private fun bookingStatus(bookingId: String): String =
        Fixtures.sqlOne("SELECT status::text FROM bookings WHERE id = ?", UUID.fromString(bookingId)) { it.getString(1) }!!

    private fun demote(user: TestUser) =
        Fixtures.sql("UPDATE business_members SET role = 'admin' WHERE user_id = (SELECT id FROM users WHERE email = ?)", user.email)

    private fun deauthorized(account: String, created: Long): String {
        val application = mapOf("id" to StripeTest.CLIENT_ID, "object" to "application", "name" to "bookanything")
        return StripeTest.event("account.application.deauthorized", application, account)
            .replace(Regex("\"created\":\\d+"), "\"created\":$created")
    }

    @Test
    fun `the owner connects an existing account and only its id is kept`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val before = api.get("${clinic.base}/payments/status", clinic.owner.token).obj()
            assertEquals("true", before.s("canConnectExisting"))
            assertEquals("false", before.s("connected"))

            val res = api.post("${clinic.base}/payments/connect/existing", jsonOf("returnUrl" to page(clinic)), clinic.owner.token)
            assertStatus(HttpStatusCode.OK, res)
            val url = Url(res.obj().s("url"))
            assertEquals("connect.stripe.com", url.host)
            assertEquals("/oauth/authorize", url.encodedPath)
            assertEquals(StripeTest.CLIENT_ID, url.parameters["client_id"])
            assertEquals("code", url.parameters["response_type"])
            assertEquals("read_write", url.parameters["scope"])
            assertEquals("http://localhost:3000/api/v1/payments/stripe/callback", url.parameters["redirect_uri"])
            assertEquals("IE", url.parameters["stripe_user[country]"])
            val state = url.parameters["state"]!!

            // The callback connects nothing: it hands the code to the owner's page.
            val code = s.gateway.authorize("acct_existing1")
            val back = Url(callback(api, "scope=read_write&code=$code&state=$state"))
            assertEquals("/dashboard/${clinic.slug}/settings/payments", back.encodedPath)
            assertEquals(listOf(code, state), listOf(back.parameters["code"], back.parameters["state"]))
            assertTrue(s.gateway.oauthExchanges.isEmpty())
            assertEquals(listOf(null, null, "false"), stripeColumns(clinic))

            assertEquals("connected", complete(api, clinic, state, code).s("outcome"))
            assertEquals(listOf("acct_existing1", "oauth", "true"), stripeColumns(clinic))
            assertEquals(listOf(code), s.gateway.oauthExchanges)
            assertEquals(listOf("acct_existing1"), audits(clinic, "payments.connected"))

            val status = api.get("${clinic.base}/payments/status", clinic.owner.token).obj()
            assertEquals("oauth", status.s("connectMethod"))
            assertEquals("acct_existing1", status.s("accountId"))
            assertEquals("true", status.s("chargesEnabled"))

            // Account Links only onboard accounts we created.
            assertError(
                HttpStatusCode.Conflict, "CONFLICT",
                api.post("${clinic.base}/payments/connect", jsonOf("returnUrl" to page(clinic)), clinic.owner.token),
            )
            assertTrue(s.gateway.accountLinks.isEmpty())
            // Connected: starting again is refused until it is disconnected.
            assertError(
                HttpStatusCode.Conflict, "CONFLICT",
                api.post("${clinic.base}/payments/connect/existing", jsonOf("returnUrl" to page(clinic)), clinic.owner.token),
            )
            // Payments now go to that account, which each charge remembers.
            val held = Fixtures.book(api, clinic, "Paid consult", "2026-10-07T10:00:00+01:00")
            assertEquals("acct_existing1", s.gateway.sessions.single().options!!.stripeAccount)
            val chargeAccount = Fixtures.sqlOne(
                "SELECT provider_account FROM payments WHERE booking_id = ?", UUID.fromString(Money.bookingId(held)),
            ) { it.getString(1) }
            assertEquals("acct_existing1", chargeAccount)
        }
    }

    @Test
    fun `a state works once, for a short time, and only as signed`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val other = Fixtures.clinic(api)

            // Declined at Stripe: the state is spent.
            val state = start(api, clinic)
            assertEquals(
                "${page(clinic)}?stripe=connect_error&reason=denied",
                callback(api, "error=access_denied&error_description=The+user+denied+your+request&state=$state"),
            )
            val code = s.gateway.authorize("acct_replay")
            assertEquals("${page(clinic)}?stripe=connect_error&reason=expired", callback(api, "code=$code&state=$state"))
            assertEquals("expired", complete(api, clinic, state, code).s("outcome"))

            // Completed twice: the second finds it spent.
            val once = start(api, clinic)
            assertEquals("connected", complete(api, clinic, once, code).s("outcome"))
            assertEquals("expired", complete(api, clinic, once, s.gateway.authorize("acct_replay")).s("outcome"))
            assertStatus(HttpStatusCode.OK, api.post("${clinic.base}/payments/disconnect", "{}", clinic.owner.token))

            // Expired: ten minutes to come back.
            val late = start(api, clinic)
            s.clock.advanceMinutes(11)
            val lateCode = s.gateway.authorize("acct_late")
            assertEquals("${page(clinic)}?stripe=connect_error&reason=expired", callback(api, "code=$lateCode&state=$late"))
            assertEquals("expired", complete(api, clinic, late, lateCode).s("outcome"))

            // Tampered: the other business's id with this state's MAC.
            val fresh = start(api, clinic)
            val (payload, mac) = fresh.split('.')
            val forged = String(Base64.getUrlDecoder().decode(payload)).replace(clinic.id, other.id)
            val tampered = Base64.getUrlEncoder().withoutPadding().encodeToString(forged.toByteArray()) + "." + mac
            assertEquals(dashboardInvalid, callback(api, "code=$lateCode&state=$tampered"))
            assertEquals("invalid", complete(api, other, tampered, lateCode, other.owner.token).s("outcome"))
            // Signed with another key, garbage, or missing.
            val foreign = StripeConnectState.encode(
                TokenService("another-secret-entirely"),
                ConnectStateClaims(UUID.fromString(other.id), UUID.randomUUID(), "nonce", s.clock.instant().plusSeconds(60)),
            )
            assertEquals(dashboardInvalid, callback(api, "code=$lateCode&state=$foreign"))
            assertEquals(dashboardInvalid, callback(api, "code=$lateCode&state=not.a-state"))
            assertEquals(dashboardInvalid, callback(api, "code=$lateCode"))
            assertError(
                HttpStatusCode.BadRequest, "INVALID_REQUEST",
                api.post("${clinic.base}/payments/connect/existing/complete", jsonOf("state" to fresh), clinic.owner.token),
            )

            // Only the connections that completed exchanged a code; the untouched state still works.
            assertEquals(1, s.gateway.oauthExchanges.size)
            assertEquals(listOf(null, null, "false"), stripeColumns(other))
            assertEquals("connected", complete(api, clinic, fresh, lateCode).s("outcome"))
            assertEquals("acct_late", stripeColumns(clinic)[0])
            // Only decisions are audited; a replayed or stale state changes nothing to record.
            assertEquals(listOf("denied"), audits(clinic, "payments.connect_failed"))
        }
    }

    @Test
    fun `a link someone else started can't attach your Stripe account to their business`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val attacker = Fixtures.clinic(api)
            val victim = Fixtures.clinic(api)
            // The attacker's link, approved at Stripe by the victim: the code comes back to the attacker's page...
            val state = start(api, attacker)
            val back = Url(callback(api, "code=${s.gateway.authorize("acct_victim")}&state=$state"))
            val stolen = jsonOf("state" to back.parameters["state"], "code" to back.parameters["code"])
            // ...where the victim, signed in, is not a member of that business...
            assertEquals(
                HttpStatusCode.NotFound,
                api.post("${attacker.base}/payments/connect/existing/complete", stolen, victim.owner.token).status,
            )
            // ...nor can the victim's own business use it, nor a co-owner who isn't the person it was issued to.
            assertEquals("invalid", complete(api, victim, back.parameters["state"]!!, back.parameters["code"]!!).s("outcome"))
            val co = Roles.member(api, attacker, "owner")
            assertEquals(
                "invalid", complete(api, attacker, back.parameters["state"]!!, back.parameters["code"]!!, co.token).s("outcome"),
            )
            assertTrue(s.gateway.oauthExchanges.isEmpty())
            assertEquals(listOf(null, null, "false"), stripeColumns(attacker))
        }
    }

    @Test
    fun `the state is bound to an owner and to a business without an account`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val admin = Roles.member(api, clinic, "admin")
            assertError(
                HttpStatusCode.Forbidden, "FORBIDDEN",
                api.post("${clinic.base}/payments/connect/existing", jsonOf("returnUrl" to page(clinic)), admin.token),
            )
            // Not our app: refused before anything is stored.
            assertError(
                HttpStatusCode.BadRequest, "INVALID_REQUEST",
                api.post("${clinic.base}/payments/connect/existing", jsonOf("returnUrl" to "https://evil.example/x"), clinic.owner.token),
            )
            // Stripe's code comes back to the return page: only this business's own payments page will do.
            val elsewhere = "http://localhost:3000/dashboard/someone-else/settings/payments"
            assertError(
                HttpStatusCode.BadRequest, "INVALID_REQUEST",
                api.post("${clinic.base}/payments/connect/existing", jsonOf("returnUrl" to elsewhere), clinic.owner.token),
            )

            // A co-owner started, and was made an admin while at Stripe: completing needs an owner.
            val co = Roles.member(api, clinic, "owner")
            val state = start(api, clinic, co.token)
            demote(co)
            val code = s.gateway.authorize("acct_demoted")
            assertError(
                HttpStatusCode.Forbidden, "FORBIDDEN",
                api.post("${clinic.base}/payments/connect/existing/complete", jsonOf("state" to state, "code" to code), co.token),
            )

            // The business got an account meanwhile: the code is not even exchanged.
            val second = start(api, clinic)
            s.connect(clinic, "acct_meanwhile")
            assertEquals("already_connected", complete(api, clinic, second, code).s("outcome"))
            assertTrue(s.gateway.oauthExchanges.isEmpty())
            assertEquals("acct_meanwhile", stripeColumns(clinic)[0])
        }
    }

    @Test
    fun `an account used by another business, or in another currency, is not linked`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val other = Fixtures.clinic(api)
            s.connect(other, "acct_shared")

            assertEquals("account_in_use", connect(s, api, clinic, "acct_shared").s("outcome"))
            // The other business still takes payments on it: never deauthorized for this.
            assertTrue(s.gateway.deauthorized.isEmpty())
            assertEquals("acct_shared", stripeColumns(other)[0])

            s.gateway.accountStates["acct_gbp"] = StripeAccountState("acct_gbp", true, true, "GB", "gbp", "Pounds Ltd")
            val gbp = connect(s, api, clinic, "acct_gbp")
            assertEquals(listOf("currency", "GBP"), listOf(gbp.s("outcome"), gbp.s("currency")))
            // Stripe connected it when the code was exchanged: that is undone.
            assertEquals(listOf(StripeTest.CLIENT_ID to "acct_gbp"), s.gateway.deauthorized)
            assertEquals(listOf(null, null, "false"), stripeColumns(clinic))

            // Stripe couldn't be asked about the account after connecting it: undone too.
            s.gateway.failAccountReads.set(1)
            assertEquals("failed", connect(s, api, clinic, "acct_unread").s("outcome"))
            assertEquals(StripeTest.CLIENT_ID to "acct_unread", s.gateway.deauthorized.last())

            // A code Stripe no longer accepts (expired, used).
            assertEquals("expired", complete(api, clinic, start(api, clinic), "ac_unknown").s("outcome"))
            assertEquals(listOf("account_in_use", "currency"), audits(clinic, "payments.connect_failed"))

            // Euro accounts elsewhere are fine (only the currency matters).
            s.gateway.accountStates["acct_de"] = StripeAccountState("acct_de", false, true, "DE", "eur", "Praxis GmbH")
            assertEquals("connected", connect(s, api, clinic, "acct_de").s("outcome"))
            assertEquals(listOf("acct_de", "oauth", "false"), stripeColumns(clinic))
            val status = api.get("${clinic.base}/payments/status", clinic.owner.token).obj()
            assertEquals("Praxis GmbH", status.s("accountName"))
            assertEquals("false", status.s("chargesEnabled"))
        }
    }

    @Test
    fun `two tabs connecting the same account end connected, never undone`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val first = start(api, clinic)
            val second = start(api, clinic)
            assertEquals("connected", complete(api, clinic, first, s.gateway.authorize("acct_twice")).s("outcome"))
            // The second tab finds the business connected before it exchanges anything.
            assertEquals("already_connected", complete(api, clinic, second, s.gateway.authorize("acct_twice")).s("outcome"))
            assertTrue(s.gateway.deauthorized.isEmpty())
            assertEquals("acct_twice", stripeColumns(clinic)[0])
        }
    }

    @Test
    fun `disconnecting an OAuth account deauthorizes it after forgetting it, unless refunds may need it`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            assertEquals("connected", connect(s, api, clinic, "acct_mine").s("outcome"))

            // An upcoming booking paid on it: a cancellation would refund it there.
            val paid = Fixtures.book(api, clinic, "Paid consult", "2026-10-07T12:00:00+01:00")
            s.send(api, s.sessionCompleted(Money.bookingId(paid), "acct_mine", 5000, "pi_${unique("paid")}"))
            s.worker.drain()
            val refused = api.post("${clinic.base}/payments/disconnect", "{}", clinic.owner.token)
            assertError(HttpStatusCode.Conflict, "CONFLICT", refused)
            assertTrue("1 upcoming booking was paid online through this Stripe account" in refused.obj().toString())
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${paid.s("manageToken")}/cancel"))
            s.worker.drain()

            // A held booking's checkout is closed once the account is forgotten.
            val held = Fixtures.book(api, clinic, "Paid consult", "2026-10-07T10:00:00+01:00")
            val (_, session, _) = s.charge(Money.bookingId(held))
            val res = api.post("${clinic.base}/payments/disconnect", "{}", clinic.owner.token)
            assertStatus(HttpStatusCode.OK, res)
            assertEquals("false", res.obj().s("connected"))
            assertNull(res.obj().sOrNull("accountId"))
            assertEquals(listOf(StripeTest.CLIENT_ID to "acct_mine"), s.gateway.deauthorized)
            assertEquals(listOf(session), s.gateway.expired.map { it.params })
            assertEquals("acct_mine", s.gateway.expired.single().options!!.stripeAccount)
            assertEquals(listOf(null, null, "false"), stripeColumns(clinic))
            assertEquals(listOf("acct_mine"), audits(clinic, "payments.disconnected"))
            assertError(HttpStatusCode.Conflict, "CONFLICT", api.post("${clinic.base}/payments/disconnect", "{}", clinic.owner.token))

            // Stripe's deauthorization event for it comes after: nothing is left to change, and no alert.
            s.send(api, deauthorized("acct_mine", Instant.now().epochSecond + 60))
            s.worker.drain()
            assertEquals(listOf("acct_mine"), audits(clinic, "payments.disconnected"))
            assertFalse("payments_alert" in api.get("/v1/me/notifications", clinic.owner.token).obj().toString())
        }
    }

    @Test
    fun `an OAuth account is kept while money on it may still need it`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            assertEquals("connected", connect(s, api, clinic, "acct_busy").s("outcome"))

            // A checkout paid a moment ago: its confirmation is on its way.
            val held = Fixtures.book(api, clinic, "Paid consult", "2026-10-07T10:00:00+01:00")
            val (_, session, _) = s.charge(Money.bookingId(held))
            s.gateway.sessionStatus[session!!] = "complete"
            assertError(HttpStatusCode.Conflict, "CONFLICT", api.post("${clinic.base}/payments/disconnect", "{}", clinic.owner.token))
            s.send(api, s.sessionCompleted(Money.bookingId(held), "acct_busy", 5000, "pi_${unique("busy")}"))
            s.worker.drain()

            // Its cancellation's refund failed at Stripe and waits for a retry.
            s.gateway.failRefunds.set(100)
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${held.s("manageToken")}/cancel"))
            val pending = api.post("${clinic.base}/payments/disconnect", "{}", clinic.owner.token)
            assertError(HttpStatusCode.Conflict, "CONFLICT", pending)
            assertTrue("A refund on this Stripe account is still being made" in pending.obj().toString())
            assertEquals("acct_busy", stripeColumns(clinic)[0])
            assertTrue(s.gateway.deauthorized.isEmpty())
        }
    }

    @Test
    fun `an account is never deauthorized while another business's money is on it`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val first = Fixtures.clinic(api)
            val second = Fixtures.clinic(api)
            // The first business took a payment on an account we created, then forgot it.
            s.connect(first, "acct_handed_on")
            val paid = Fixtures.book(api, first, "Paid consult", "2026-10-07T12:00:00+01:00")
            s.send(api, s.sessionCompleted(Money.bookingId(paid), "acct_handed_on", 5000, "pi_${unique("first")}"))
            s.worker.drain()
            assertStatus(HttpStatusCode.OK, api.post("${first.base}/payments/disconnect", "{}", first.owner.token))

            // The same account offered to the second business, in another currency: not linked, and not deauthorized,
            // as the first business's upcoming booking could still be refunded on it.
            s.gateway.accountStates["acct_handed_on"] = StripeAccountState("acct_handed_on", true, true, "GB", "gbp", "Shared")
            assertEquals("currency", connect(s, api, second, "acct_handed_on").s("outcome"))
            assertTrue(s.gateway.deauthorized.isEmpty())
        }
    }

    @Test
    fun `an account we created is forgotten, keeps its payments and refunds, and the next one is new`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            assertStatus(HttpStatusCode.OK, createAccount(api, clinic))
            val created = stripeColumns(clinic)[0]!!
            Fixtures.sql("UPDATE businesses SET stripe_charges_enabled = true WHERE id = ?", UUID.fromString(clinic.id))
            val held = Fixtures.book(api, clinic, "Paid consult", "2026-10-07T10:00:00+01:00")
            val paid = Fixtures.book(api, clinic, "Paid consult", "2026-10-07T12:00:00+01:00")
            s.send(api, s.sessionCompleted(Money.bookingId(paid), created, 5000, "pi_${unique("paid")}"))
            s.worker.drain()

            // Nothing stops it: refunds keep working on an account we created.
            assertStatus(HttpStatusCode.OK, api.post("${clinic.base}/payments/disconnect", "{}", clinic.owner.token))
            assertTrue(s.gateway.deauthorized.isEmpty(), "an account we created stays the owner's")
            assertEquals(listOf(null, null, "false"), stripeColumns(clinic))

            // The held booking's customer paid just before its checkout closed: confirmed, by the account it used.
            s.send(api, s.sessionCompleted(Money.bookingId(held), created, 5000, "pi_${unique("late")}"))
            s.worker.drain()
            assertEquals("confirmed", bookingStatus(Money.bookingId(held)))
            // A cancellation still refunds on that account.
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${paid.s("manageToken")}/cancel"))
            s.worker.drain()
            assertEquals(created, s.gateway.refunds.single().options!!.stripeAccount)

            // "Create one for me" again: a new account, not a replay of the forgotten one.
            assertStatus(HttpStatusCode.OK, createAccount(api, clinic))
            assertEquals(
                listOf("bookanything-account-${clinic.id}", "bookanything-account-${clinic.id}-1"),
                s.gateway.accounts.map { it.options!!.idempotencyKey },
            )
        }
    }

    @Test
    fun `a deauthorization from Stripe stops payments and tells the owners`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic, "acct_gone", method = "oauth")

            // About an earlier link of the same account (the event predates this one): ignored.
            s.send(api, deauthorized(account, Instant.parse("2020-01-01T00:00:00Z").epochSecond))
            s.worker.drain()
            assertEquals("acct_gone", stripeColumns(clinic)[0])

            s.send(api, deauthorized(account, Instant.now().epochSecond + 60))
            s.send(api, deauthorized("acct_nobody", Instant.now().epochSecond + 60))
            s.worker.drain()
            assertEquals(listOf(null, null, "false"), stripeColumns(clinic))
            assertEquals(listOf("deauthorized"), audits(clinic, "payments.disconnected"))
            val inbox = api.get("/v1/me/notifications", clinic.owner.token).obj()
            assertTrue("payments_alert" in inbox.toString() && "Stripe was disconnected" in inbox.toString(), inbox.toString())
            assertFalse(api.get("${clinic.base}/payments/status", clinic.owner.token).obj().s("connected").toBoolean())
        }
    }

    @Test
    fun `without a Connect client id only the create path is offered`() {
        for (clientId in listOf(null, "sk_test_not_a_client_id")) {
            val s = StripeWorld(config = StripeTest.config.copy(connectClientId = clientId))
            withApp(s.env) { api ->
                val clinic = Fixtures.clinic(api)
                assertEquals("false", api.get("${clinic.base}/payments/status", clinic.owner.token).obj().s("canConnectExisting"))
                assertError(
                    HttpStatusCode.Conflict, "PAYMENTS_NOT_CONFIGURED",
                    api.post("${clinic.base}/payments/connect/existing", jsonOf("returnUrl" to page(clinic)), clinic.owner.token),
                )
            }
        }
    }

    @Test
    fun `the state round-trips and rejects any change`() {
        val tokens = TokenService(TestConfig.config().tokenSecret)
        val claims = ConnectStateClaims(
            UUID.randomUUID(), UUID.randomUUID(), TokenService.randomToken(), Instant.ofEpochSecond(1_800_000_000),
        )
        val state = StripeConnectState.encode(tokens, claims)
        assertEquals(claims, StripeConnectState.decode(tokens, state))
        assertNull(StripeConnectState.decode(tokens, state.dropLast(1) + if (state.last() == 'A') "B" else "A"))
        assertNull(StripeConnectState.decode(tokens, state + ".x"))
        assertNull(StripeConnectState.decode(tokens, "x".repeat(600)))
        assertNull(StripeConnectState.decode(tokens, null))
    }
}
