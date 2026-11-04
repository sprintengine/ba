package ie.bookanything.security

import ie.bookanything.AppContext
import ie.bookanything.auth.ClerkJwtVerifier
import ie.bookanything.config.AiConfig
import ie.bookanything.config.AppConfig
import ie.bookanything.config.AppEnv
import ie.bookanything.config.AuthMode
import ie.bookanything.config.ConfigException
import ie.bookanything.payments.DevPaymentProvider
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.payments.PaymentProviders
import ie.bookanything.storage.AssetStorages
import ie.bookanything.support.Fixtures
import ie.bookanything.support.SecurityFixtures
import ie.bookanything.support.SecurityFixtures.dublin
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.createBusiness
import ie.bookanything.support.jsonOf
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Development conveniences (dev auth, dev payments, the default token secret, the fake model, email previews) must never be
 * reachable in production, and a missing APP_ENV means production. `UnitTests.AppConfigTest` covers the basic refusals;
 * this adds every spelling of production, the remaining dev-only settings and the running app's routes.
 */
class ProductionConfigTest {
    /** Everything production needs, valid: Clerk with authorized parties, a real secret, a database URL. */
    private val production = mapOf(
        "DATABASE_URL" to "jdbc:postgresql://db.internal/bookanything", "TOKEN_SECRET" to "a-very-long-production-secret",
        "CLERK_ISSUER" to "https://clerk.bookanything.test", "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
    )
    private val productionSpellings: List<Map<String, String>> = listOf(
        emptyMap(), mapOf("APP_ENV" to ""), mapOf("APP_ENV" to "   "), mapOf("APP_ENV" to "production"), mapOf("APP_ENV" to "prod"),
        mapOf("APP_ENV" to " Production "), mapOf("APP_ENV" to "PROD"),
    )

    private fun refused(env: Map<String, String>, message: String) {
        val e = assertFailsWith<ConfigException>(env.toString()) { AppConfig.fromEnvironment(env) }
        assertTrue(e.message!!.contains(message), "${e.message} should mention $message")
    }

    @Test
    fun `every spelling of production, including a missing APP_ENV, is production`() {
        productionSpellings.forEach { spelling ->
            val config = AppConfig.fromEnvironment(production + spelling)
            assertEquals(AppEnv.PRODUCTION, config.env, spelling.toString())
            assertEquals(AuthMode.CLERK, config.authMode)
            assertTrue(config.isProduction && !config.isDevelopment)
            assertEquals("none", PaymentProviders.select(config).name, "no dev payment provider without Stripe")
            assertNull(config.storage.localDir, "no local upload directory by default")
            assertEquals("off", AssetStorages.fromConfig(config).name)
            assertEquals(false, config.runMigrationsOnStart)
            assertEquals(true, config.rateLimitsEnabled)
            assertNull(AppContext.modelClient(config), "no model without a key, never the fake")
        }
    }

    @Test
    fun `dev auth, the dev token secret and the fake model are refused in production`() {
        productionSpellings.forEach { spelling ->
            refused(production + spelling + ("AUTH_MODE" to "dev"), "AUTH_MODE=dev")
            refused(production + spelling + ("TOKEN_SECRET" to AppConfig.DEV_TOKEN_SECRET), "TOKEN_SECRET")
            refused(production + spelling - "TOKEN_SECRET", "TOKEN_SECRET")
            refused(production + spelling + ("TOKEN_SECRET" to "short"), "TOKEN_SECRET")
            refused(production + spelling + ("AI_FAKE_SCRIPT" to "demo"), "AI_FAKE_SCRIPT")
            refused(production + spelling - "CLERK_AUTHORIZED_PARTIES", "CLERK_AUTHORIZED_PARTIES")
            refused(production + spelling - "DATABASE_URL", "DATABASE_URL")
        }
        // Constructed in code (not from the environment) the same rules hold.
        assertFailsWith<ConfigException> { TestConfig.config(env = AppEnv.PRODUCTION) }
        val prod = AppConfig.fromEnvironment(production)
        assertFailsWith<ConfigException> { prod.copy(authMode = AuthMode.DEV) }
        assertFailsWith<ConfigException> { prod.copy(tokenSecret = AppConfig.DEV_TOKEN_SECRET) }
        assertFailsWith<ConfigException> { prod.copy(ai = prod.ai.copy(fakeScript = "demo")) }
        // Only an explicit development environment turns the conveniences on.
        val dev = AppConfig.fromEnvironment(mapOf("APP_ENV" to "development"))
        assertEquals(AuthMode.DEV, dev.authMode)
        assertEquals("dev", PaymentProviders.select(dev).name)
    }

    @Test
    fun `with a model, production requires the AI credit settings rather than using the placeholders`() {
        val credits = mapOf(
            "AI_CREDIT_MICRO_CENTS" to "7", "AI_CREDITS_FREE" to "11", "AI_CREDITS_PRO" to "13", "AI_CREDITS_BUSINESS" to "17",
        )
        val withModel = production + ("ANTHROPIC_API_KEY" to "sk-test")
        productionSpellings.forEach { spelling ->
            refused(withModel + spelling, "AI_CREDIT_MICRO_CENTS, AI_CREDITS_FREE, AI_CREDITS_PRO, AI_CREDITS_BUSINESS")
            credits.keys.forEach { key -> refused(withModel + spelling + credits - key, "$key must be set in production") }
            refused(withModel + spelling + credits + ("AI_CREDITS_PRO" to " "), "AI_CREDITS_PRO must be set")
        }
        val ai = AppConfig.fromEnvironment(withModel + credits).ai
        assertEquals(
            listOf(7L, 11L, 13L, 17L), listOf(ai.creditValue.microCents, ai.allowances.free, ai.allowances.pro, ai.allowances.business),
        )
        refused(withModel + credits + ("AI_CREDIT_MICRO_CENTS" to "0"), "AI_CREDIT_MICRO_CENTS")
        refused(withModel + credits + ("AI_CREDITS_BUSINESS" to Long.MAX_VALUE.toString()), "too large")
        // Without a model nothing is metered, so nothing is required; development keeps its placeholders.
        AppConfig.fromEnvironment(production)
        val dev = AppConfig.fromEnvironment(mapOf("APP_ENV" to "development", "ANTHROPIC_API_KEY" to "sk-test")).ai
        assertEquals(AiConfig().creditValue to AiConfig().allowances, dev.creditValue to dev.allowances)
    }

    /** The production config pointed at the test database, run in-process like the real server. */
    private fun productionConfig() =
        AppConfig.fromEnvironment(production).copy(database = TestConfig.config().database, jobsEnabled = false, rateLimitsEnabled = false)

    private fun productionEnv(payments: PaymentProvider): TestEnv {
        val config = productionConfig()
        return TestEnv(config = config, verifier = ClerkJwtVerifier(config.clerk), payments = payments)
    }

    @Test
    fun `the development routes are not there in production, even with the dev payment provider wired in`() {
        // A real held payment, made in a development-like app on the same database.
        val dev = TestEnv()
        var paymentId = ""
        withApp(dev) { api ->
            val setup = testBusiness {
                val ana = person("Ana")
                service("Paid", 60) { price(4000); needs("Therapist", ana) }
            }
            val shop = api.createBusiness(setup)
            val booking = SecurityFixtures.book(api, shop, "Paid", dublin(dev.clock, 2, "10:00"))
            paymentId =
                Fixtures.sqlOne("SELECT id::text FROM payments WHERE booking_id = ?", booking["booking"]!!.s("id")) { it.getString(1) }!!
            assertStatus(HttpStatusCode.OK, api.get("/v1/public/dev-payments/$paymentId"))
            assertStatus(HttpStatusCode.OK, api.get("/v1/dev/emails"))
            assertStatus(HttpStatusCode.OK, api.get("/v1/dev/emails/booking_confirmed"))
        }

        // What production selects (no payments without Stripe), and the dev provider wired in by mistake.
        for (payments in listOf(PaymentProviders.select(productionConfig()), DevPaymentProvider("http://localhost:3000"))) {
            withApp(productionEnv(payments)) { api ->
                assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/public/dev-payments/$paymentId"))
                assertError(
                    HttpStatusCode.NotFound, "NOT_FOUND",
                    api.post("/v1/public/dev-payments/$paymentId/complete", jsonOf("outcome" to "succeeded")),
                )
                assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/dev/emails"))
                assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/dev/emails/booking_confirmed?format=text"))
                // Dev tokens are not sessions here.
                assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", TestUser.create("sneaky").token))
                assertStatus(HttpStatusCode.OK, api.get("/v1/health"))
            }
        }
        assertEquals(
            "pending",
            Fixtures.sqlOne("SELECT status::text FROM payments WHERE id = ?", paymentId) { it.getString(1) },
            "nothing completed the payment",
        )
    }
}
