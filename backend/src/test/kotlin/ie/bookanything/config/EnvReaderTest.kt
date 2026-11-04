package ie.bookanything.config

import ie.bookanything.ai.Effort
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class EnvReaderTest {
    private val env = EnvReader(
        mapOf(
            "S" to "  x  ", "BLANK" to "   ", "YES" to "Yes", "NO" to "0", "N" to "42", "BAD" to "4x", "NEG" to "-1",
            "LIST" to " a/, ,b ,/", "EFFORT" to "HIGH",
        ),
    )

    @Test
    fun `values are trimmed and blank means unset`() {
        assertEquals("x", env.str("S"))
        assertNull(env.str("BLANK"))
        assertNull(env.str("MISSING"))
    }

    @Test
    fun `typed values parse or name the variable`() {
        assertEquals(true, env.bool("YES", false))
        assertEquals(false, env.bool("NO", true))
        assertEquals(true, env.bool("MISSING", true))
        assertEquals("S must be true or false.", assertFailsWith<ConfigException> { env.bool("S", true) }.message)
        assertEquals(42, env.int("N", 1))
        assertEquals(7, env.int("BLANK", 7))
        assertEquals("BAD must be an integer.", assertFailsWith<ConfigException> { env.int("BAD", 1) }.message)
        assertEquals(42L, env.long("N", 1))
        assertEquals("NEG must be a whole number ≥ 0.", assertFailsWith<ConfigException> { env.long("NEG", 1) }.message)
    }

    @Test
    fun `lists drop empty entries after cleaning, and choices map names`() {
        assertEquals(listOf("a/", "b", "/"), env.list("LIST"))
        assertEquals(listOf("a", "b"), env.list("LIST") { it.trimEnd('/') })
        assertNull(env.list("MISSING"))
        val effort = mapOf(null to Effort.LOW, "high" to Effort.HIGH)
        assertEquals(Effort.HIGH, env.choice("EFFORT", effort, "bad"))
        assertEquals(Effort.LOW, env.choice("MISSING", effort, "bad"))
        assertEquals("bad", assertFailsWith<ConfigException> { env.choice("S", effort, "bad") }.message)
    }

    @Test
    fun `email, SMS and AI settings are read into their sections`() {
        val c = AppConfig.fromEnvironment(
            mapOf(
                "APP_ENV" to "development", "RESEND_API_KEY" to "re_1", "TWILIO_ACCOUNT_SID" to "AC1", "TWILIO_AUTH_TOKEN" to "t",
                "TWILIO_FROM" to "+353", "ANTHROPIC_API_KEY" to "sk", "ANTHROPIC_MODEL" to "m", "ASSISTANT_EFFORT" to "medium",
                "AI_CREDITS_PRO" to "9",
            ),
        )
        assertEquals(EmailConfig("re_1", EmailConfig.DEFAULT_FROM), c.email)
        assertEquals(SmsConfig("AC1", "t", "+353"), c.sms)
        assertEquals("sk", c.ai.anthropicApiKey)
        assertEquals("m", c.ai.anthropicModel)
        assertEquals(Effort.MEDIUM, c.ai.assistantEffort)
        assertEquals(9L, c.ai.allowances.pro)
        assertEquals(EmailConfig(), AppConfig.fromEnvironment(mapOf("APP_ENV" to "development")).email)
    }

    @Test
    fun `Bo is off unless ASSISTANT_ENABLED switches it on, in every environment`() {
        assertEquals(false, AppConfig.fromEnvironment(mapOf("APP_ENV" to "development", "ANTHROPIC_API_KEY" to "sk")).assistantEnabled)
        val production = mapOf(
            "APP_ENV" to "production", "DATABASE_URL" to "jdbc:postgresql://localhost/x", "TOKEN_SECRET" to "a-very-long-production-secret",
            "CLERK_ISSUER" to "https://x.clerk.accounts.dev", "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
        )
        assertEquals(false, AppConfig.fromEnvironment(production).assistantEnabled)
        assertEquals(true, AppConfig.fromEnvironment(production + ("ASSISTANT_ENABLED" to "true")).assistantEnabled)
        assertEquals(true, AppConfig.fromEnvironment(mapOf("APP_ENV" to "development", "ASSISTANT_ENABLED" to "true")).assistantEnabled)
    }
}
