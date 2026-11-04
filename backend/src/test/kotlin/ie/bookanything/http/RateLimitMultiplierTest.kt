package ie.bookanything.http

import ie.bookanything.config.AppConfig
import ie.bookanything.config.ConfigException
import ie.bookanything.db.Db
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.TestDatabase
import ie.bookanything.support.unique
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** RATE_LIMIT_MULTIPLIER lets an e2e suite book repeatedly through one address in development, and never anywhere else. */
class RateLimitMultiplierTest {
    private val production = mapOf(
        "DATABASE_URL" to "jdbc:postgresql://localhost/x", "TOKEN_SECRET" to "a-very-long-production-secret",
        "CLERK_ISSUER" to "https://x.clerk.accounts.dev", "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
    )

    @Test
    fun `the multiplier is refused unless APP_ENV is development`() {
        listOf(production, production + ("APP_ENV" to "production")).forEach { env ->
            val e = assertFailsWith<ConfigException> { AppConfig.fromEnvironment(env + ("RATE_LIMIT_MULTIPLIER" to "50")) }
            assertEquals("RATE_LIMIT_MULTIPLIER is refused unless APP_ENV=development.", e.message)
            assertEquals(1, AppConfig.fromEnvironment(env).rateLimitMultiplier)
        }
        val dev = mapOf("APP_ENV" to "development")
        assertEquals(50, AppConfig.fromEnvironment(dev + ("RATE_LIMIT_MULTIPLIER" to "50")).rateLimitMultiplier)
        listOf("0", "1001").forEach { bad ->
            assertFailsWith<ConfigException> { AppConfig.fromEnvironment(dev + ("RATE_LIMIT_MULTIPLIER" to bad)) }
        }
    }

    @Test
    fun `a multiplied limit still refuses past its new max`() = runBlocking {
        val limiter = RateLimiter(Db(TestDatabase.dataSource), true, ClientIpResolver(false, emptyList(), null), multiplier = 3)
        val limit = RateLimiter.Limit(unique("multiplied"), max = 2, windowSeconds = 600)
        repeat(6) { limiter.checkKey("203.0.113.9", limit, DEFAULT_NOW) }
        val refused = assertFailsWith<ApiException> { limiter.checkKey("203.0.113.9", limit, DEFAULT_NOW) }
        assertEquals("RATE_LIMITED", refused.code)
    }
}
