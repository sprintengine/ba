package ie.bookanything.security

import com.stripe.param.AccountCreateParams
import ie.bookanything.auth.ClerkJwtVerifier
import ie.bookanything.auth.DevTokenVerifier
import ie.bookanything.auth.SimulationTokens
import ie.bookanything.config.AppConfig
import ie.bookanything.config.AppEnv
import ie.bookanything.config.AuthMode
import ie.bookanything.config.StripeConfig
import ie.bookanything.payments.SimulationStripeAccounts
import ie.bookanything.payments.StripePaymentProvider
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.FakeStripeGateway
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.SecurityFixtures
import ie.bookanything.support.SecurityFixtures.dublin
import ie.bookanything.support.SimulationFixtures
import ie.bookanything.support.StripeTest
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.createBusiness
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * `POST /businesses/{id}/payments/simulation-account` (docs/simulation.md, "Payments on staging"): on staging, a
 * simulated business gets a platform-controlled Stripe test account and takes payments on it; nothing else can use it
 * to attach an account to a business. Production, staging without the simulation sign-in, a live key, a caller or a
 * business that isn't the simulation's: a 404 (or "not configured" for the simulation itself), and no Stripe call.
 */
class SimulationStripeAccountTest {
    private class World(config: AppConfig = SimulationFixtures.stagingConfig(), stripe: StripeConfig = StripeTest.config) {
        val clock = MutableClock(DEFAULT_NOW)
        val gateway = FakeStripeGateway()
        val env = TestEnv(
            clock = clock, config = config.copy(stripe = stripe),
            verifier = if (config.authMode == AuthMode.CLERK) ClerkJwtVerifier(config.clerk) else DevTokenVerifier(),
            payments = StripePaymentProvider(gateway, stripe, clock),
        )
        val tokens: SimulationTokens get() = env.ctx.simulation!!
    }

    private fun setup(slug: String = "sim-${unique("stripe").lowercase()}") = testBusiness("Sim Business") {
        val ana = person("Ana")
        service("Visit", 30) { needs("Staff", ana) }
        service("Consultation", 30) {
            price(5000)
            needs("Staff", ana)
        }
    }.copy(slug = slug)

    private suspend fun Api.simulationAccount(shop: Clinic, token: String?) = post("${shop.base}/payments/simulation-account", null, token)

    private fun stripeColumns(shop: Clinic): List<Any?> = Fixtures.sqlOne(
        "SELECT stripe_account_id, stripe_connect_method, stripe_charges_enabled FROM businesses WHERE id = ?", UUID.fromString(shop.id),
    ) { listOf(it.getString(1), it.getString(2), it.getBoolean(3)) }!!

    @Test
    fun `a simulated business gets a platform-controlled test account, once, and takes payments on it`() {
        val w = World()
        withApp(w.env) { api ->
            val owner = SimulationFixtures.user(w.tokens, "owner")
            val shop = api.createBusiness(setup(), owner)
            // Not yet enabled: Stripe is still checking the test values.
            w.gateway.accountState = w.gateway.accountState.copy(
                chargesEnabled = false, detailsSubmitted = true, requirementsDue = listOf("individual.verification.document"),
            )
            val pending = api.simulationAccount(shop, owner.token).also { assertStatus(HttpStatusCode.OK, it) }.obj()
            val account = pending.s("accountId")
            assertEquals(false, pending.b("chargesEnabled"))
            val due = pending["requirementsDue"]!!.jsonArray.map { it.jsonPrimitive.content }
            assertEquals(listOf("individual.verification.document"), due)
            assertEquals(listOf(account, "created", false), stripeColumns(shop))

            val created = w.gateway.accounts.single()
            assertEquals("bookanything-sim-account-${shop.id}-0", created.options!!.idempotencyKey)
            val params = created.params
            assertEquals("IE", params.country)
            assertEquals(AccountCreateParams.Controller.RequirementCollection.APPLICATION, params.controller.requirementCollection)
            assertEquals(AccountCreateParams.Controller.StripeDashboard.Type.NONE, params.controller.stripeDashboard.type)
            assertEquals(
                mapOf(SimulationStripeAccounts.MARKER to "true", "businessId" to shop.id, "slug" to shop.slug), params.metadata,
            )
            assertEquals("IE29AIBK93115212345678", (params.extraParams["external_account"] as Map<*, *>)["account_number"])
            // Terms "accepted" when the business was created: a retry sends exactly the same request (Stripe's idempotency).
            val createdAt = Fixtures.sqlOne(
                "SELECT floor(extract(epoch FROM created_at))::bigint FROM businesses WHERE id = ?", UUID.fromString(shop.id),
            ) { it.getLong(1) }
            assertEquals(createdAt, params.tosAcceptance.date)

            // Stripe enables it; the next call says so and stores it, without creating another account.
            w.gateway.accountState = w.gateway.accountState.copy(chargesEnabled = true, requirementsDue = emptyList())
            val ready = api.simulationAccount(shop, owner.token).also { assertStatus(HttpStatusCode.OK, it) }.obj()
            assertEquals(account to true, ready.s("accountId") to ready.b("chargesEnabled"))
            assertEquals(1, w.gateway.accounts.size)
            assertEquals(listOf(account, "created", true), stripeColumns(shop))
            assertEquals(
                1,
                Fixtures.sqlOne(
                    "SELECT count(*) FROM audit_events WHERE business_id = ? AND action = 'payments.simulation_account_created'",
                    UUID.fromString(shop.id),
                ) { it.getInt(1) },
            )

            // A paid booking is now a Stripe Checkout on that account.
            val booked = SecurityFixtures.book(api, shop, "Consultation", dublin(w.clock, 2, "10:00"), email = "guest@example.test")
            assertEquals("payment_required", booked["next"]!!.s("type"))
            assertEquals(account, w.gateway.sessions.single().options!!.stripeAccount)
        }
    }

    @Test
    fun `nothing but a simulation owner of a simulation business gets one, and the answer is the 404 of an unknown path`() {
        val w = World()
        withApp(w.env) { api ->
            val owner = SimulationFixtures.user(w.tokens, "owner")
            val shop = api.createBusiness(setup(), owner)
            val notFound: suspend (String?) -> Unit = { token ->
                assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.simulationAccount(shop, token))
            }
            // No sign-in, the guest header, another bot that isn't a member.
            notFound(null)
            assertError(
                HttpStatusCode.NotFound, "NOT_FOUND",
                api.client.post("${shop.base}/payments/simulation-account") { header(SimulationTokens.GUEST_HEADER, w.tokens.guest()) },
            )
            notFound(SimulationFixtures.user(w.tokens, "stranger").token)

            // A simulation owner whose business has no sim- slug.
            val plain = api.createBusiness(setup(unique("plain").lowercase()), owner)
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.simulationAccount(plain, owner.token))

            // A real person among the members: the business isn't only the simulation's any more.
            val mixed = api.createBusiness(setup(), owner)
            val real = Fixtures.sqlOne(
                "INSERT INTO users (clerk_user_id, email, email_verified, name) VALUES (?, ?, true, 'Real Tester') RETURNING id",
                "user_${unique("real")}", "${unique("tester")}@example.com",
            ) { it.getObject(1) as UUID }!!
            Fixtures.sql(
                "INSERT INTO business_members (business_id, user_id, role, status) VALUES (?, ?, 'staff', 'active')",
                UUID.fromString(mixed.id), real,
            )
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.simulationAccount(mixed, owner.token))

            // A business that already has an account of its own keeps it.
            val linked = api.createBusiness(setup(), owner)
            Fixtures.sql(
                "UPDATE businesses SET stripe_account_id = ?, stripe_connect_method = 'oauth', stripe_charges_enabled = true WHERE id = ?",
                "acct_${unique("owned")}", UUID.fromString(linked.id),
            )
            assertError(HttpStatusCode.Conflict, "CONFLICT", api.simulationAccount(linked, owner.token))
            assertEquals("oauth", stripeColumns(linked)[1])

            assertTrue(w.gateway.accounts.isEmpty(), "no account was created")
            assertNull(stripeColumns(shop)[0])
        }
    }

    @Test
    fun `with a live key the simulation is told payments aren't configured, and Stripe isn't called`() {
        val w = World(stripe = StripeTest.config.copy(secretKey = "sk_live_not_a_real_key"))
        assertNull(w.env.ctx.simulationStripe)
        withApp(w.env) { api ->
            val owner = SimulationFixtures.user(w.tokens, "owner")
            val shop = api.createBusiness(setup(), owner)
            assertError(HttpStatusCode.Conflict, "PAYMENTS_NOT_CONFIGURED", api.simulationAccount(shop, owner.token))
            // ...but only a simulation owner learns that: anyone else still gets a 404.
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.simulationAccount(shop, null))
        }
        assertTrue(w.gateway.accounts.isEmpty())
    }

    @Test
    fun `the route doesn't exist in production, nor on staging without the simulation sign-in, nor in development`() {
        val minted = SimulationTokens(SimulationFixtures.SECRET, MutableClock(DEFAULT_NOW), AppEnv.STAGING)
        val (sub, email) = SimulationFixtures.identity("owner")
        val owner = TestUser(minted.bearer(sub, email, "Sim Owner"), email)
        var shop: Clinic? = null
        // The business, made where the simulation sign-in works.
        val staging = World()
        withApp(staging.env) { api -> shop = api.createBusiness(setup(), owner) }

        val production = AppConfig.fromEnvironment(
            mapOf(
                "DATABASE_URL" to "jdbc:postgresql://db.internal/bookanything", "TOKEN_SECRET" to "a-very-long-production-secret",
                "CLERK_ISSUER" to "https://clerk.bookanything.test", "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
            ),
        ).copy(database = TestConfig.config().database, jobsEnabled = false, rateLimitsEnabled = false)
        val development = TestConfig.config().copy(simulationAuth = SimulationFixtures.stagingConfig().simulationAuth)
        for (config in listOf(production, SimulationFixtures.stagingConfig(simulation = null), development)) {
            val w = World(config)
            assertNull(w.env.ctx.simulationStripe, config.env.name)
            withApp(w.env) { api ->
                assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.simulationAccount(shop!!, owner.token))
            }
            assertTrue(w.gateway.accounts.isEmpty(), config.env.name)
        }
        assertNull(stripeColumns(shop!!)[0])
    }
}
