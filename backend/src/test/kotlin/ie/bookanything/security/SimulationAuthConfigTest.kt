package ie.bookanything.security

import ie.bookanything.auth.SimulationTokens
import ie.bookanything.config.AppConfig
import ie.bookanything.config.AppEnv
import ie.bookanything.config.ConfigException
import ie.bookanything.config.SimulationAuthConfig
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.MutableClock
import ie.bookanything.support.TestConfig
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The simulation sign-in (`SIMULATION_AUTH_SECRET`) is a way to sign in without Clerk, so it must be impossible to switch
 * on in production: every spelling of production (a missing APP_ENV included) refuses to start with it set, in code as
 * from the environment, and the token verifier refuses to be built there. Staging accepts it; development and tests may
 * use it too.
 */
class SimulationAuthConfigTest {
    private val production = mapOf(
        "DATABASE_URL" to "jdbc:postgresql://db.internal/bookanything", "TOKEN_SECRET" to "a-very-long-production-secret",
        "CLERK_ISSUER" to "https://clerk.bookanything.test", "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
    )
    private val secret = "s".repeat(SimulationAuthConfig.MIN_SECRET_BYTES)
    private val simulation = mapOf("SIMULATION_AUTH_SECRET" to secret)
    private val productionSpellings: List<Map<String, String>> = listOf(
        emptyMap(), mapOf("APP_ENV" to ""), mapOf("APP_ENV" to "  "), mapOf("APP_ENV" to "production"), mapOf("APP_ENV" to "prod"),
        mapOf("APP_ENV" to " Production "), mapOf("APP_ENV" to "PROD"),
    )
    private val staging = mapOf("APP_ENV" to "staging")

    private fun refused(env: Map<String, String>, message: String) {
        val e = assertFailsWith<ConfigException>(env.keys.toString()) { AppConfig.fromEnvironment(env) }
        assertTrue(e.message!!.contains(message), "${e.message} should mention $message")
    }

    @Test
    fun `production refuses to start with the simulation secret, however production is spelled`() {
        productionSpellings.forEach { spelling ->
            refused(production + spelling + simulation, "SIMULATION_AUTH_SECRET is refused in production")
            refused(production + spelling + simulation + ("SIMULATION_RATE_LIMIT_MULTIPLIER" to "10"), "refused in production")
            // The multiplier alone is refused too, so it can't sit in an environment waiting for a secret.
            refused(production + spelling + ("SIMULATION_RATE_LIMIT_MULTIPLIER" to "10"), "SIMULATION_RATE_LIMIT_MULTIPLIER")
            assertNull(AppConfig.fromEnvironment(production + spelling).simulationAuth)
        }
        // Built in code, the same rule holds: no copy of a production config can carry it.
        val prod = AppConfig.fromEnvironment(production)
        assertFailsWith<ConfigException> { prod.copy(simulationAuth = SimulationAuthConfig(secret)) }
        assertFailsWith<ConfigException> {
            TestConfig.config().copy(env = AppEnv.PRODUCTION, simulationAuth = SimulationAuthConfig(secret))
        }
        // And the verifier can't be built for production at all.
        assertFailsWith<IllegalArgumentException> { SimulationTokens(secret, MutableClock(DEFAULT_NOW), AppEnv.PRODUCTION) }
    }

    @Test
    fun `staging accepts the simulation secret, with its own rate-limit allowance`() {
        listOf(staging, mapOf("APP_ENV" to " Staging "), mapOf("APP_ENV" to "STAGING")).forEach { spelling ->
            val config = AppConfig.fromEnvironment(production + spelling + simulation)
            assertEquals(AppEnv.STAGING, config.env)
            val sim = assertNotNull(config.simulationAuth)
            assertEquals(secret, sim.secret)
            assertEquals(SimulationAuthConfig.DEFAULT_RATE_LIMIT_MULTIPLIER, sim.rateLimitMultiplier)
            // Staging stays production in every other check: the development multiplier is still refused.
            refused(production + spelling + simulation + ("RATE_LIMIT_MULTIPLIER" to "50"), "RATE_LIMIT_MULTIPLIER")
        }
        val tuned = AppConfig.fromEnvironment(production + staging + simulation + ("SIMULATION_RATE_LIMIT_MULTIPLIER" to " 20 "))
        assertEquals(20, tuned.simulationAuth!!.rateLimitMultiplier)
        // Without the secret staging has no simulation sign-in.
        assertNull(AppConfig.fromEnvironment(production + staging).simulationAuth)
        assertNull(AppConfig.fromEnvironment(production + staging + ("SIMULATION_AUTH_SECRET" to "   ")).simulationAuth)
        // Development and the test harness may use it (the tests of the sign-in itself).
        assertNotNull(AppConfig.fromEnvironment(mapOf("APP_ENV" to "development") + simulation).simulationAuth)
        assertNotNull(TestConfig.config().copy(simulationAuth = SimulationAuthConfig(secret)).simulationAuth)
        listOf(AppEnv.STAGING, AppEnv.DEVELOPMENT, AppEnv.TEST).forEach { assertTrue(it.allowsSimulationAuth, it.name) }
        assertFalse(AppEnv.PRODUCTION.allowsSimulationAuth)
    }

    @Test
    fun `a short secret, the token secret reused or an allowance out of range is refused in staging too`() {
        refused(production + staging + ("SIMULATION_AUTH_SECRET" to "s".repeat(31)), "at least 32 bytes")
        // Bytes, not characters: 16 two-byte characters are 32 bytes.
        assertNotNull(AppConfig.fromEnvironment(production + staging + ("SIMULATION_AUTH_SECRET" to "é".repeat(16))).simulationAuth)
        val reused = "a-very-long-production-secret-of-32b"
        refused(production + staging + ("TOKEN_SECRET" to reused) + ("SIMULATION_AUTH_SECRET" to reused), "must differ from TOKEN_SECRET")
        listOf("0", "-1", "1001").forEach {
            refused(production + staging + simulation + ("SIMULATION_RATE_LIMIT_MULTIPLIER" to it), "between 1 and 1000")
        }
        refused(production + staging + simulation + ("SIMULATION_RATE_LIMIT_MULTIPLIER" to "lots"), "must be an integer")
        refused(production + staging + ("SIMULATION_RATE_LIMIT_MULTIPLIER" to "10"), "unless SIMULATION_AUTH_SECRET is set")
        assertFailsWith<IllegalArgumentException> { SimulationTokens("short", MutableClock(DEFAULT_NOW), AppEnv.STAGING) }
    }

    @Test
    fun `the secret never appears where the configuration is printed`() {
        val config = AppConfig.fromEnvironment(production + staging + simulation)
        assertFalse(secret in config.toString(), "AppConfig.toString")
        assertFalse(secret in config.simulationAuth.toString())
        assertTrue("[redacted]" in config.simulationAuth.toString())
    }
}
