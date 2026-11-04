package ie.bookanything

import ie.bookanything.auth.DevTokenVerifier
import ie.bookanything.auth.TokenService
import ie.bookanything.config.AppConfig
import ie.bookanything.config.ConfigException
import ie.bookanything.config.DatabaseConfig
import ie.bookanything.http.ApiException
import ie.bookanything.http.parseDate
import ie.bookanything.http.parseInstant
import ie.bookanything.http.parseTime
import ie.bookanything.http.parseZone
import ie.bookanything.payments.CancelActor
import ie.bookanything.payments.RefundOverride
import ie.bookanything.payments.RefundPolicy
import ie.bookanything.templates.BusinessDraftRequest
import ie.bookanything.templates.TemplateDraftGenerator
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RefundPolicyTest {
    private val start = Instant.parse("2026-10-10T10:00:00Z")

    private fun decide(
        actor: CancelActor, hoursBefore: Long, paid: Int = 6000, refunded: Int = 0, pct: Int = 50,
        override: RefundOverride = RefundOverride.POLICY,
    ) =
        RefundPolicy.decide(actor, start.minusSeconds(hoursBefore * 3600), start, 24, pct, paid, refunded, override)

    @Test
    fun `customer cancelling with enough notice gets a full refund`() {
        assertEquals(6000, decide(CancelActor.CUSTOMER, 48).amountCents)
        assertEquals(6000, decide(CancelActor.CUSTOMER, 24).amountCents) // exactly at the notice boundary
    }

    @Test
    fun `late customer cancellation refunds the configured percentage`() {
        assertEquals(3000, decide(CancelActor.CUSTOMER, 23).amountCents)
        assertEquals(0, decide(CancelActor.CUSTOMER, 2, pct = 0).amountCents)
        assertEquals(6000, decide(CancelActor.CUSTOMER, 2, pct = 100).amountCents)
        assertEquals(1999, RefundPolicy.decide(CancelActor.CUSTOMER, start, start, 24, 50, 3999, 0).amountCents)
    }

    @Test
    fun `business cancellation always refunds in full and staff can override`() {
        assertEquals(6000, decide(CancelActor.BUSINESS, 1).amountCents)
        assertEquals(0, decide(CancelActor.BUSINESS, 48, override = RefundOverride.NONE).amountCents)
        assertEquals(6000, decide(CancelActor.CUSTOMER, 1, pct = 0, override = RefundOverride.FULL).amountCents)
    }

    @Test
    fun `refunds never exceed what remains refundable`() {
        assertEquals(1000, decide(CancelActor.BUSINESS, 1, paid = 6000, refunded = 5000).amountCents)
        assertEquals(0, decide(CancelActor.CUSTOMER, 48, paid = 0).amountCents)
        assertEquals(1000, decide(CancelActor.CUSTOMER, 1, paid = 6000, refunded = 5000, pct = 50).amountCents)
    }
}

class InputParsingTest {
    private val dublin = ZoneId.of("Europe/Dublin")

    private fun invalid(block: () -> Unit): ApiException = assertFailsWith<ApiException> { block() }.also {
        assertEquals(400, it.status.value)
    }

    @Test
    fun `dates must be strict ISO dates`() {
        assertEquals("2026-10-01", parseDate("2026-10-01", "from").toString())
        listOf("2026-13-01", "2026-02-30", "01/10/2026", "2026-1-1", "", "2026-10-01T00:00").forEach { invalid { parseDate(it, "from") } }
    }

    @Test
    fun `times must be HH mm`() {
        assertEquals("09:30", parseTime("09:30", "t").toString())
        assertEquals("23:59", parseTime("23:59:00", "t").toString())
        listOf("24:00", "9:30", "09:60", "noon", "", "09:30:15").forEach { invalid { parseTime(it, "t") } }
    }

    @Test
    fun `timezones must be region ids`() {
        assertEquals("Europe/Dublin", parseZone("Europe/Dublin").id)
        assertEquals("UTC", parseZone("UTC").id)
        listOf("Mars/Olympus", "+01:00", "GMT+1", "", "Europe/", "PST").forEach { raw ->
            val e = assertFailsWith<ApiException> { parseZone(raw) }
            assertEquals(400, e.status.value)
        }
        assertEquals("INVALID_TIMEZONE", assertFailsWith<ApiException> { parseZone("Mars/Olympus") }.code)
    }

    @Test
    fun `instants accept offsets or local times in the business zone`() {
        assertEquals(Instant.parse("2026-10-01T08:00:00Z"), parseInstant("2026-10-01T09:00:00+01:00", "start", dublin))
        assertEquals(Instant.parse("2026-10-01T08:00:00Z"), parseInstant("2026-10-01T08:00:00Z", "start", dublin))
        assertEquals(Instant.parse("2026-10-01T08:00:00Z"), parseInstant("2026-10-01T09:00:00", "start", dublin))
        listOf("tomorrow", "2026-10-01", "2026-10-01T25:00:00Z", "").forEach { invalid { parseInstant(it, "start", dublin) } }
    }
}

class AppConfigTest {
    private val base = mapOf("DATABASE_URL" to "jdbc:postgresql://localhost/x")

    @Test
    fun `dev auth is refused outside development`() {
        val e = assertFailsWith<ConfigException> {
            AppConfig.fromEnvironment(
                base + mapOf("APP_ENV" to "production", "AUTH_MODE" to "dev", "TOKEN_SECRET" to "a-very-long-production-secret"),
            )
        }
        assertTrue(e.message!!.contains("AUTH_MODE=dev"))
    }

    @Test
    fun `a missing or test APP_ENV never enables development behaviour`() {
        val prod = base + mapOf(
            "TOKEN_SECRET" to "a-very-long-production-secret", "CLERK_ISSUER" to "https://x.clerk.accounts.dev",
            "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
        )
        // Forgetting APP_ENV in a deployment must fail closed (no dev auth, dev payments or default token secret).
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(emptyMap()) }
        assertFailsWith<ConfigException> {
            AppConfig.fromEnvironment(base + mapOf("AUTH_MODE" to "dev", "TOKEN_SECRET" to "a-very-long-production-secret"))
        }
        assertEquals(ie.bookanything.config.AppEnv.PRODUCTION, AppConfig.fromEnvironment(prod).env)
        // "test" is only for the in-process test harness, never from the environment.
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(mapOf("APP_ENV" to "test")) }
    }

    @Test
    fun `production requires authorized parties for Clerk tokens`() {
        val e = assertFailsWith<ConfigException> {
            AppConfig.fromEnvironment(
                base + mapOf(
                    "APP_ENV" to "production", "TOKEN_SECRET" to "a-very-long-production-secret",
                    "CLERK_ISSUER" to "https://x.clerk.accounts.dev",
                ),
            )
        }
        assertTrue(e.message!!.contains("CLERK_AUTHORIZED_PARTIES"))
    }

    @Test
    fun `development defaults to dev auth and migrations on start`() {
        val c = AppConfig.fromEnvironment(mapOf("APP_ENV" to "development"))
        assertEquals(ie.bookanything.config.AuthMode.DEV, c.authMode)
        assertTrue(c.runMigrationsOnStart)
        assertEquals(DatabaseConfig.DEFAULT_URL, c.database.jdbcUrl)
    }

    @Test
    fun `production requires secrets and clerk issuer`() {
        assertFailsWith<ConfigException> {
            AppConfig.fromEnvironment(base + mapOf("APP_ENV" to "production", "CLERK_ISSUER" to "https://x.clerk.accounts.dev"))
        }
        assertFailsWith<ConfigException> {
            AppConfig.fromEnvironment(base + mapOf("APP_ENV" to "production", "TOKEN_SECRET" to "a-very-long-production-secret"))
        }
        val c = AppConfig.fromEnvironment(
            base + mapOf(
                "APP_ENV" to "production", "TOKEN_SECRET" to "a-very-long-production-secret",
                "CLERK_ISSUER" to "https://x.clerk.accounts.dev/",
                "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie, http://localhost:3000",
            ),
        )
        assertEquals("https://x.clerk.accounts.dev/.well-known/jwks.json", c.clerk.jwksUrl)
        assertEquals(setOf("https://bookanything.ie", "http://localhost:3000"), c.clerk.authorizedParties)
        assertTrue(!c.runMigrationsOnStart)
        assertTrue(!c.clerk.acceptNativeSessions, "web sessions only unless asked")
        assertEquals(ie.bookanything.config.PushMode.OFF, c.push.mode, "nothing is pushed unless configured")
    }

    @Test
    fun `the mobile app's sessions and push notifications are turned on explicitly, in production too`() {
        val prod = base + mapOf(
            "APP_ENV" to "production", "TOKEN_SECRET" to "a-very-long-production-secret", "CLERK_ISSUER" to "https://x.clerk.accounts.dev",
            "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
        )
        val c = AppConfig.fromEnvironment(
            prod + mapOf("CLERK_ACCEPT_NATIVE_SESSIONS" to "true", "PUSH_NOTIFICATIONS" to "expo", "EXPO_ACCESS_TOKEN" to "expo-token"),
        )
        assertTrue(c.clerk.acceptNativeSessions)
        assertEquals(setOf("https://bookanything.ie"), c.clerk.authorizedParties, "web origins still checked")
        assertEquals(ie.bookanything.config.PushMode.EXPO, c.push.mode)
        assertEquals("expo-token", c.push.expoAccessToken)
        assertEquals(ie.bookanything.config.PushMode.LOG, AppConfig.fromEnvironment(mapOf("APP_ENV" to "development")).push.mode)
        assertEquals(
            ie.bookanything.config.PushMode.OFF,
            AppConfig.fromEnvironment(mapOf("APP_ENV" to "development", "PUSH_NOTIFICATIONS" to "OFF")).push.mode,
        )
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(prod + mapOf("CLERK_ACCEPT_NATIVE_SESSIONS" to "sometimes")) }
        val e = assertFailsWith<ConfigException> { AppConfig.fromEnvironment(prod + mapOf("PUSH_NOTIFICATIONS" to "fcm")) }
        assertTrue(e.message!!.contains("PUSH_NOTIFICATIONS"))
    }

    @Test
    fun `postgres URLs are converted to JDBC with credentials`() {
        val (url, user, pass) = DatabaseConfig.parseUrl("postgres://app:s%40cret@db.example.com:5433/bookanything?sslmode=require")
        assertEquals("jdbc:postgresql://db.example.com:5433/bookanything?sslmode=require", url)
        assertEquals("app", user)
        assertEquals("s@cret", pass)
    }

    @Test
    fun `invalid values are configuration errors`() {
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(mapOf("APP_ENV" to "staging")) }
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(mapOf("PORT" to "eighty")) }
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(mapOf("JOBS_ENABLED" to "maybe")) }
    }
}

class TokenTest {
    @Test
    fun `dev tokens round trip and reject malformed input`() {
        val verifier = DevTokenVerifier()
        val id = verifier.verify(DevTokenVerifier.token("dev_alex", "Alex@Example.test", "Alex Morgan"))!!
        assertEquals("dev_alex", id.subject)
        assertEquals("alex@example.test", id.email)
        assertTrue(id.emailVerified)
        assertNull(verifier.verify("dev.not-base64!"))
        assertNull(verifier.verify(DevTokenVerifier.token("alex", "a@b.co", null))) // sub must start with dev_
        assertNull(verifier.verify(DevTokenVerifier.token("dev_alex", "not-an-email", null)))
        assertNull(verifier.verify("eyJhbGciOiJSUzI1NiJ9.e30.sig"))
    }

    @Test
    fun `derived tokens are stable, distinct per purpose and hashed for storage`() {
        val tokens = TokenService("0123456789abcdef0123456789abcdef")
        val id = UUID.randomUUID()
        assertEquals(tokens.manageToken(id), tokens.manageToken(id))
        assertNotEquals(tokens.manageToken(id), tokens.inviteToken(id))
        assertNotEquals(tokens.manageToken(id), TokenService("another-secret-of-sufficient-len").manageToken(id))
        assertTrue(TokenService.looksValid(tokens.manageToken(id)))
        assertEquals(64, TokenService.hash("x").length)
        assertTrue(!TokenService.looksValid("../../etc/passwd"))
    }
}

class DraftGeneratorTest {
    private val gen = TemplateDraftGenerator()

    @Test
    fun `descriptions match the best template and fall back to generic`() {
        assertEquals("car_wash", gen.generate(BusinessDraftRequest("We run a hand car wash and valeting service in Cork")).industry)
        assertEquals("physio", gen.generate(BusinessDraftRequest("Physiotherapy clinic for sports injuries")).industry)
        assertEquals("music_lessons", gen.generate(BusinessDraftRequest("I teach piano and guitar lessons to kids")).industry)
        assertEquals("gp_practice", gen.generate(BusinessDraftRequest("A family GP practice with two doctors and a nurse")).industry)
        assertEquals("generic", gen.generate(BusinessDraftRequest("Bespoke kite repairs")).industry)
        val draft = gen.generate(BusinessDraftRequest("We are Bright Pixel Studio, a photography studio"))
        assertEquals("template", draft.source)
        assertEquals("Bright Pixel Studio", draft.name)
    }
}

class MoneyFormattingTest {
    @Test
    fun `amounts are minor units of their own currency, not always cents`() {
        // Two decimals.
        assertEquals("€15.50", ie.bookanything.notifications.NotificationHandler.money(1550, "EUR", "en-IE"))
        assertEquals("€15.50", ie.bookanything.offers.OfferText.money(1550, "EUR"))
        assertEquals("€15.50", ie.bookanything.assistant.tools.ToolViews.money(1550, "EUR"))
        // No decimals (the frontend formats 1500 JPY as ¥1,500): 1500 minor units is 1,500 yen, not 15.
        for ((name, formatted) in listOf(
            "email" to ie.bookanything.notifications.NotificationHandler.money(1500, "JPY", "en-IE"),
            "offer label" to ie.bookanything.offers.OfferText.money(1500, "JPY"),
            "assistant" to ie.bookanything.assistant.tools.ToolViews.money(1500, "JPY"),
        )) {
            assertTrue(formatted.replace(",", "").contains("1500") && !formatted.contains("15."), "$name: $formatted")
        }
        assertEquals("JP¥1,500", ie.bookanything.notifications.NotificationHandler.money(1500, "JPY", "en-IE"))
        // Three decimals: 1500 minor units of the Kuwaiti dinar is 1.5 dinars.
        assertEquals("KWD1.500", ie.bookanything.notifications.NotificationHandler.money(1500, "KWD", "en-IE"))
    }
}
