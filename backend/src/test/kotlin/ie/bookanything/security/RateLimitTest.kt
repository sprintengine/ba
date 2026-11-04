package ie.bookanything.security

import ie.bookanything.auth.TokenService
import ie.bookanything.config.AppConfig
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.MutableClock
import ie.bookanything.support.SecurityFixtures
import ie.bookanything.support.SecurityFixtures.dublin
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.createBusiness
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.withApp
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.parameters
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/**
 * Rate limits (Postgres buckets per client address, IPv6 per /64; docs/architecture.md 6.1 and 20.4, backend README
 * "Behind a proxy"). Each test runs in its own week of the clock: buckets are shared by every test client.
 */
class RateLimitTest {
    private val setup get() = testBusiness("Limited") {
        val ana = person("Ana")
        service("Massage", 60) { needs("Therapist", ana) }
    }

    private fun env(weeks: Long, config: AppConfig = TestConfig.config(rateLimits = true)) =
        TestEnv(clock = SecurityFixtures.isolatedClock(weeks), config = config)

    /** A booking request that is refused (an unaligned start) after it has been counted: cheap and side-effect free. */
    private suspend fun Api.bookingAttempt(shop: Clinic, clock: MutableClock, forwardedFor: String? = null): HttpResponse =
        client.post("${shop.public}/bookings") {
            if (forwardedFor != null) header("X-Forwarded-For", forwardedFor)
            contentType(ContentType.Application.Json)
            setBody(SecurityFixtures.bookingBody(shop, "Massage", dublin(clock, 2, "10:07")))
        }

    private suspend fun limited(res: HttpResponse) = assertError(HttpStatusCode.TooManyRequests, "RATE_LIMITED", res)

    private data class Case(
        val name: String, val max: Int, val windowMinutes: Long, val weeks: Long, val hit: suspend (Api, Ctx) -> HttpResponse,
    )
    private data class Ctx(val shop: Clinic, val clock: MutableClock, val owner: TestUser)

    private val founder = TestUser.create("founder")

    private val cases = listOf(
        Case("public booking create", 20, 10, 62) { api, c -> api.bookingAttempt(c.shop, c.clock) },
        Case("public availability", 120, 1, 63) { api, c ->
            val day = dublin(c.clock, 2, "10:00").take(10)
            api.get("${c.shop.public}/availability?serviceId=${c.shop.service("Massage")}&from=$day&to=$day")
        },
        Case("manage actions", 30, 10, 64) { api, _ -> api.post("/v1/public/manage/${TokenService.randomToken()}/cancel", "{}") },
        Case("AI site generation", 60, 60, 65) { api, c ->
            api.post("${c.shop.base}/site/generate", jsonOf("prompt" to "x".repeat(2001)), c.owner.token)
        },
        Case("AI business draft", 20, 60, 66) { api, c -> api.post("/v1/ai/business-draft", jsonOf("description" to ""), c.owner.token) },
        Case("OAuth token", 600, 1, 67) { api, _ -> api.client.submitForm("/v1/oauth/token", parameters { append("grant_type", "nope") }) },
        // Per user (the shop's owner already created one business this hour, so another user tries).
        Case("business creation", 10, 60, 71) { api, _ -> api.post("/v1/businesses", "{}", founder.token) },
    )

    @Test
    fun `AI business drafts are limited per user too, whatever the address`() {
        val config = TestConfig.config(rateLimits = true).copy(trustForwardedFor = true, trustedProxyHops = 1)
        val env = env(72, config)
        withApp(env) { api ->
            val busy = TestUser.create("drafter")
            suspend fun draft(user: TestUser, ip: String) = api.client.post("/v1/ai/business-draft") {
                header("Authorization", "Bearer ${user.token}")
                header("X-Forwarded-For", ip)
                contentType(ContentType.Application.Json)
                setBody(jsonOf("description" to ""))
            }
            repeat(20) { n -> assertEquals(HttpStatusCode.BadRequest, draft(busy, "198.51.100.${n % 2}").status) }
            limited(draft(busy, "203.0.113.50"))
            assertEquals(HttpStatusCode.BadRequest, draft(TestUser.create("other"), "203.0.113.50").status, "another user there")
        }
    }

    @Test
    fun `each limit refuses at its ceiling with 429 and resets with the window`() {
        for (case in cases) {
            val env = env(case.weeks)
            withApp(env) { api ->
                val owner = TestUser.create("owner")
                val c = Ctx(api.createBusiness(setup, owner), env.clock, owner)
                repeat(case.max) { n ->
                    val status = case.hit(api, c).status
                    assertNotEquals(HttpStatusCode.TooManyRequests, status, "${case.name}: request ${n + 1} of ${case.max}")
                }
                val refused = case.hit(api, c)
                assertEquals(HttpStatusCode.TooManyRequests, refused.status, case.name)
                val code = if (case.name.startsWith("OAuth")) refused.obj().s("error") else refused.obj()["error"]!!.o.s("code")
                assertEquals(if (case.name.startsWith("OAuth")) "temporarily_unavailable" else "RATE_LIMITED", code, case.name)
                env.clock.advanceMinutes(case.windowMinutes)
                assertNotEquals(HttpStatusCode.TooManyRequests, case.hit(api, c).status, "${case.name}: a new window")
            }
        }
    }

    @Test
    fun `X-Forwarded-For is ignored unless the proxy is trusted`() {
        val env = env(68)
        withApp(env) { api ->
            val shop = api.createBusiness(setup)
            repeat(20) { n -> api.bookingAttempt(shop, env.clock, forwardedFor = "198.51.100.$n") }
            limited(api.bookingAttempt(shop, env.clock, forwardedFor = "203.0.113.77"))
            limited(api.bookingAttempt(shop, env.clock))
        }
    }

    @Test
    fun `behind a trusted proxy each client gets its own bucket, IPv6 per 64, and spoofed entries don't help`() {
        val config = TestConfig.config(rateLimits = true).copy(trustForwardedFor = true, trustedProxyHops = 1)
        val env = env(69, config)
        withApp(env) { api ->
            val shop = api.createBusiness(setup)
            // The proxy appends the real client last; whatever the client wrote before it is ignored.
            repeat(20) { n -> api.bookingAttempt(shop, env.clock, forwardedFor = "10.0.0.$n, 203.0.113.10") }
            limited(api.bookingAttempt(shop, env.clock, forwardedFor = "1.1.1.1, 203.0.113.10"))
            assertEquals(HttpStatusCode.Conflict, api.bookingAttempt(shop, env.clock, forwardedFor = "203.0.113.11").status)

            // IPv6: rotating addresses inside one /64 shares the bucket; the next /64 is someone else.
            repeat(20) { n -> api.bookingAttempt(shop, env.clock, forwardedFor = "2001:db8:aa:bb::${n + 1}") }
            limited(api.bookingAttempt(shop, env.clock, forwardedFor = "2001:db8:aa:bb:ffff:ffff:ffff:fffe"))
            limited(api.bookingAttempt(shop, env.clock, forwardedFor = "[2001:db8:aa:bb::abcd]"))
            assertEquals(HttpStatusCode.Conflict, api.bookingAttempt(shop, env.clock, forwardedFor = "2001:db8:aa:bc::1").status)
            // An IPv4-mapped address is the IPv4 client.
            limited(api.bookingAttempt(shop, env.clock, forwardedFor = "::ffff:203.0.113.10"))
        }
    }

    @Test
    fun `buckets are per address across businesses and across app instances`() {
        val clock = SecurityFixtures.isolatedClock(70)
        val first = TestEnv(clock = clock, config = TestConfig.config(rateLimits = true))
        withApp(first) { api ->
            val a = api.createBusiness(setup)
            val b = api.createBusiness(setup)
            repeat(10) { api.bookingAttempt(a, clock) }
            repeat(10) { api.bookingAttempt(b, clock) }
            limited(api.bookingAttempt(a, clock))
            limited(api.bookingAttempt(b, clock))
        }
        // Another instance on the same database sees the same buckets (stateless, horizontally scaled).
        val second = TestEnv(clock = MutableClock(clock.instant), config = TestConfig.config(rateLimits = true))
        withApp(second) { api ->
            limited(api.bookingAttempt(api.createBusiness(setup), second.clock))
        }
    }
}
