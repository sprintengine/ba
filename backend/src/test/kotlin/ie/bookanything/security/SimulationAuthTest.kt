package ie.bookanything.security

import ie.bookanything.auth.ClerkJwtVerifier
import ie.bookanything.auth.SimulationTokens
import ie.bookanything.config.AppConfig
import ie.bookanything.config.AppEnv
import ie.bookanything.config.SimulationAuthConfig
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.Fixtures
import ie.bookanything.support.LogCapture
import ie.bookanything.support.MutableClock
import ie.bookanything.support.SecurityFixtures
import ie.bookanything.support.SecurityFixtures.dublin
import ie.bookanything.support.SimulationFixtures
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.count
import ie.bookanything.support.createBusiness
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.withApp
import ie.bookanything.support.withTelemetry
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The simulation sign-in on a running staging app (docs/simulation.md, "On staging"): bots sign in as ordinary users in
 * the reserved namespace, real sign-ins and dev tokens are unaffected, nothing of it exists without the secret or in
 * production, and the guest header moves anonymous requests into a bucket of their own, never switching limits off.
 */
class SimulationAuthTest {
    private fun stagingEnv(config: AppConfig = SimulationFixtures.stagingConfig(), clock: MutableClock = MutableClock(DEFAULT_NOW)) =
        TestEnv(clock = clock, config = config, verifier = ClerkJwtVerifier(config.clerk))

    private val TestEnv.tokens: SimulationTokens get() = ctx.simulation!!

    @Test
    fun `on staging a simulation token signs a bot in as an ordinary user, told apart by its email`() {
        val env = stagingEnv()
        withApp(env) { api ->
            val (sub, email) = SimulationFixtures.identity("owner")
            val owner = TestUser(env.tokens.bearer(sub, email, "Sim Owner"), email)
            val me = api.get("/v1/me", owner.token)
            assertStatus(HttpStatusCode.OK, me)
            assertEquals(email, me.obj()["user"]!!.s("email"))
            assertEquals(
                email to true,
                Fixtures.sqlOne("SELECT email::text, email_verified FROM users WHERE clerk_user_id = ?", sub) {
                    it.getString(1) to it.getBoolean(2)
                },
            )
            // It goes through the real code paths: onboarding a business and booking at it.
            val shop = api.createBusiness(testBusiness("Sim Shop") { service("Visit", 30) { needs("Staff", person("Ana")) } }, owner)
            val customer = SimulationFixtures.user(env.tokens, "customer")
            SecurityFixtures.book(api, shop, "Visit", dublin(env.clock, 2, "10:00"), email = customer.email, token = customer.token)
            assertStatus(HttpStatusCode.OK, api.get("/v1/me/bookings", customer.token))

            // Dev tokens are still not sessions on staging, and a bad simulation token is a 401, never a guest.
            assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", TestUser.create("sneaky").token))
            val (other, otherEmail) = SimulationFixtures.identity()
            val now = env.clock.instant.epochSecond
            val forged = mapOf(
                "a real user's address" to """{"sub":"$other","email":"owner@bookanything.ie","iat":$now,"exp":${now + 60}}""",
                "a real subject" to """{"sub":"user_2abc","email":"$otherEmail","iat":$now,"exp":${now + 60}}""",
                "expired" to """{"sub":"$other","email":"$otherEmail","iat":${now - 900},"exp":${now - 60}}""",
                "too long-lived" to """{"sub":"$other","email":"$otherEmail","iat":$now,"exp":${now + 3600}}""",
            )
            forged.forEach { (_, claims) ->
                assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", SimulationFixtures.forge(claims)))
            }
            val wrongKey = SimulationFixtures.forge(
                """{"sub":"$other","email":"$otherEmail","iat":$now,"exp":${now + 60}}""", secret = "another-secret-entirely-0123456789ab",
            )
            assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", wrongKey))
            assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", env.tokens.guest()))
            val tampered = owner.token.split('.').let { (k, _, sig) -> "$k.${customer.token.split('.')[1]}.$sig" }
            assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", tampered))
            // A token stops working once it expires.
            env.clock.instant = env.clock.instant.plusSeconds(SimulationTokens.MAX_LIFETIME_SECONDS + SimulationTokens.CLOCK_SKEW_SECONDS)
            assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", owner.token))
            assertNull(Fixtures.sqlOne("SELECT id FROM users WHERE clerk_user_id IN (?, 'user_2abc')", other) { it.getString(1) })
        }
    }

    @Test
    fun `without the secret, and in production, simulation tokens and the guest header mean nothing`() {
        val minted = SimulationTokens(SimulationFixtures.SECRET, MutableClock(DEFAULT_NOW), AppEnv.STAGING)
        val (sub, email) = SimulationFixtures.identity()
        val token = minted.bearer(sub, email, null)
        val production = AppConfig.fromEnvironment(
            mapOf(
                "DATABASE_URL" to "jdbc:postgresql://db.internal/bookanything", "TOKEN_SECRET" to "a-very-long-production-secret",
                "CLERK_ISSUER" to "https://clerk.bookanything.test", "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
            ),
        ).copy(database = TestConfig.config().database, jobsEnabled = false, rateLimitsEnabled = false)
        for (config in listOf(SimulationFixtures.stagingConfig(simulation = null), production)) {
            val env = stagingEnv(config)
            assertNull(env.ctx.simulation, config.env.name)
            withApp(env) { api ->
                assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", token))
            }
        }
        assertNull(Fixtures.sqlOne("SELECT id FROM users WHERE clerk_user_id = ?", sub) { it.getString(1) })
    }

    private val setup get() = testBusiness("Limited") { service("Massage", 60) { needs("Therapist", person("Ana")) } }

    /** A business to book at, made in a development-style app on the same database (staging has no dev sign-in). */
    private fun shop(): Clinic {
        var shop: Clinic? = null
        withApp(TestEnv()) { api -> shop = api.createBusiness(setup) }
        return shop!!
    }

    /** A booking request that is refused (an unaligned start) after it has been counted. */
    private suspend fun Api.attempt(shop: Clinic, clock: MutableClock, guestToken: String? = null, bearer: String? = null): HttpResponse =
        client.post("${shop.public}/bookings") {
            guestToken?.let { header(SimulationTokens.GUEST_HEADER, it) }
            bearer?.let { header("Authorization", "Bearer $it") }
            contentType(ContentType.Application.Json)
            setBody(SecurityFixtures.bookingBody(shop, "Massage", dublin(clock, 2, "10:07")))
        }

    private fun HttpResponse.notLimited(what: String) = assertNotEquals(HttpStatusCode.TooManyRequests, status, what)
    private suspend fun limited(res: HttpResponse) = assertError(HttpStatusCode.TooManyRequests, "RATE_LIMITED", res)

    @Test
    fun `a valid guest header moves a guest into the simulation's bucket, with its allowance and still a limit`() {
        // The public booking limit is 20 per 10 minutes per address; the simulation's allowance here is 3 times that.
        val env = stagingEnv(SimulationFixtures.stagingConfig(rateLimits = true), SecurityFixtures.isolatedClock(80))
        val shop = shop()
        withApp(env) { api ->
            repeat(20) { api.attempt(shop, env.clock).notLimited("visitor ${it + 1}") }
            limited(api.attempt(shop, env.clock))
            // Invalid headers count as the visitor they are: expired, forged, a bearer token, or garbage.
            val expired = SimulationFixtures.forge(
                """{"iat":${env.clock.instant.epochSecond - 900},"exp":${env.clock.instant.epochSecond - 60}}""", kind = "simg",
            )
            val forged = SimulationFixtures.forge("""{"iat":0,"exp":1}""", kind = "simg", secret = "another-secret-entirely-0123456789ab")
            val (sub, email) = SimulationFixtures.identity()
            listOf(expired, forged, env.tokens.bearer(sub, email, null), "simg.x.y", "").forEach {
                limited(api.attempt(shop, env.clock, it))
            }

            // The simulation's own bucket: 3 x 20, then refused like anyone else.
            val guest = env.tokens.guest()
            repeat(60) { api.attempt(shop, env.clock, guest).notLimited("simulation guest ${it + 1}") }
            limited(api.attempt(shop, env.clock, env.tokens.guest()))
            // A new window resets it, as any bucket.
            env.clock.advanceMinutes(10)
            api.attempt(shop, env.clock, env.tokens.guest()).notLimited("a new window")
        }
    }

    @Test
    fun `signed-in bots are limited per identity, and the guest header does nothing for a signed-in user`() {
        // Development-style sign-in beside the simulation's (the test harness allows both), so a real user can sign in.
        val config = TestConfig.config(rateLimits = true).copy(simulationAuth = SimulationAuthConfig(SimulationFixtures.SECRET, 3))
        val env = TestEnv(clock = SecurityFixtures.isolatedClock(81), config = config)
        withApp(env) { api ->
            val shop = api.createBusiness(setup)
            val a = SimulationFixtures.user(env.tokens, "a")
            val b = SimulationFixtures.user(env.tokens, "b")
            repeat(60) { api.attempt(shop, env.clock, bearer = a.token).notLimited("bot a ${it + 1}") }
            limited(api.attempt(shop, env.clock, bearer = a.token))
            limited(api.attempt(shop, env.clock, env.tokens.guest(), bearer = a.token))
            api.attempt(shop, env.clock, bearer = b.token).notLimited("another bot has its own bucket")
            // A signed-in user who isn't a bot is counted at their address, guest header or not; bots never used it up.
            val user = TestUser.create("visitor")
            repeat(20) { api.attempt(shop, env.clock, env.tokens.guest(), bearer = user.token).notLimited("visitor ${it + 1}") }
            limited(api.attempt(shop, env.clock, env.tokens.guest(), bearer = user.token))
            limited(api.attempt(shop, env.clock))
            // The guest bucket is untouched by all of it.
            api.attempt(shop, env.clock, env.tokens.guest()).notLimited("simulation guest")
        }
    }

    @Test
    fun `outside the simulation sign-in the guest header is ignored`() {
        val withoutSecret = SimulationFixtures.stagingConfig(rateLimits = true, simulation = null)
        val env = stagingEnv(withoutSecret, SecurityFixtures.isolatedClock(82))
        val guest = SimulationTokens(SimulationFixtures.SECRET, env.clock, AppEnv.STAGING).guest()
        val shop = shop()
        withApp(env) { api ->
            repeat(20) { api.attempt(shop, env.clock, guest).notLimited("request ${it + 1}") }
            limited(api.attempt(shop, env.clock, guest))
        }
    }

    @Test
    fun `the simulation's requests are labelled in metrics and logs, and nobody else's are`() = withTelemetry { registry, _ ->
        val env = stagingEnv()
        LogCapture.root().use { logs ->
            withApp(env) { api ->
                val bot = SimulationFixtures.user(env.tokens)
                assertStatus(HttpStatusCode.OK, api.get("/v1/me", bot.token))
                assertStatus(HttpStatusCode.OK, api.get("/v1/me", bot.token))
                api.client.post("/v1/public/businesses/nowhere/bookings") {
                    header(SimulationTokens.GUEST_HEADER, env.tokens.guest())
                    contentType(ContentType.Application.Json)
                    setBody("{}")
                }
                assertStatus(HttpStatusCode.OK, api.get("/v1/health"))
            }
            assertEquals(2.0, registry.count("http.server.requests", "route", "/v1/me", "simulation", "true"))
            assertEquals(1.0, registry.count("http.server.requests", "route", "/v1/health", "simulation", "false"))
            assertEquals(0.0, registry.count("http.server.requests", "route", "/v1/health", "simulation", "true"))
            assertTrue(registry.find("http.server.requests").tags("simulation", "true").counters().sumOf { it.count() } >= 3.0)
            assertEquals(setOf("true", "false"), registry.find("http.server.duration").meters().map { it.id.getTag("simulation") }.toSet())
            val requestLines = logs.events().filter { (message, _) -> message.startsWith("GET /v1/me") || message.contains("/bookings ->") }
            assertTrue(requestLines.size >= 3, requestLines.toString())
            assertTrue(requestLines.all { (_, mdc) -> mdc["simulation"] == "true" }, requestLines.toString())
        }
    }
}
