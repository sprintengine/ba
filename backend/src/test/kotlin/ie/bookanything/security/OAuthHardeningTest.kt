package ie.bookanything.security

import ie.bookanything.auth.ClerkEventHandler
import ie.bookanything.auth.ClerkJwtVerifier
import ie.bookanything.auth.JwksServer
import ie.bookanything.config.AuthMode
import ie.bookanything.config.ClerkConfig
import ie.bookanything.oauth.ClientMetadataFetcher
import ie.bookanything.oauth.ClientRegistry
import ie.bookanything.oauth.OAuthConfig
import ie.bookanything.oauth.Pkce
import ie.bookanything.support.Api
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.Fixtures
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.arr
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.parse
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.parameters
import kotlinx.serialization.json.JsonObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * OAuth 2.1 attacks beyond the happy path (`oauth/OAuthFlowTest` covers the flow itself): PKCE downgrade and guessing,
 * codes and refresh tokens used by someone else, open redirects, revocation semantics, scope and audience escalation,
 * expiry, and grants whose user is gone.
 */
class OAuthHardeningTest {
    private val resource = "http://localhost:3000/mcp"

    private suspend fun Api.revoke(token: String?, clientId: String? = null): HttpResponse = client.submitForm(
        "/v1/oauth/revoke",
        parameters {
            if (token != null) append("token", token)
            if (clientId != null) append("client_id", clientId)
        },
    )

    private suspend fun OAuthClientSim.works(access: String) = mcp(access, "tools/list").status == HttpStatusCode.OK

    @Test
    fun `PKCE cannot be skipped, downgraded or guessed`() = withApp { api ->
        val user = TestUser.create("pkce")
        val sim = OAuthClientSim(api).register()
        fun redirectError(res: JsonObject) = sim.query(res.s("redirectTo"))["error"]
        // At the authorization endpoint: no challenge, plain, a verifier sent as the challenge, an unknown method.
        val noMethod = sim.authorizeParams() + ("codeChallengeMethod" to null)
        listOf(
            sim.authorizeParams(withChallenge = false),
            sim.authorizeParams(method = "plain"),
            sim.authorizeParams(method = "s256"),
            noMethod,
            sim.authorizeParams() + ("codeChallenge" to sim.verifier),
            sim.authorizeParams() + ("codeChallenge" to sim.challenge + "="),
        ).forEach { params -> assertEquals("invalid_request", redirectError(sim.check(user, params).obj()), params.toString()) }
        // Approving a request that fails validation never issues a code.
        val denied = sim.decide(user, sim.authorizeParams(method = "plain"))
        assertEquals(null, sim.query(denied)["code"], denied)

        // At the token endpoint: a missing, short, wrong or non-ASCII verifier fails and spends the code.
        val short = "a".repeat(42)
        val cases = listOf<String?>(null, "", short, sim.verifier.dropLast(1), sim.verifier.uppercase(), "${sim.verifier} ")
        for (verifier in cases) {
            val code = sim.code(user)
            val res = sim.token(
                "grant_type" to "authorization_code", "code" to code, "client_id" to sim.clientId, "redirect_uri" to sim.redirectUri,
                "code_verifier" to verifier, "resource" to resource,
            )
            assertEquals("invalid_grant", res.obj().s("error"), "verifier '$verifier'")
            // The right verifier afterwards is too late: the code was spent by the failed attempt.
            assertEquals("invalid_grant", sim.exchange(code).obj().s("error"))
        }
        // A challenge made for a short verifier is refused even when the verifier "matches" it.
        val shortSim = OAuthClientSim(api).register()
        val shortParams = shortSim.authorizeParams() + ("codeChallenge" to Pkce.challengeFor(short))
        val shortCode = shortSim.query(shortSim.decide(user, shortParams)).getValue("code")
        assertEquals("invalid_grant", shortSim.exchange(shortCode, verifier = short).obj().s("error"))
    }

    @Test
    fun `a replayed code revokes every token issued from it, access and refresh`() = withApp { api ->
        val user = TestUser.create("replay")
        val sim = OAuthClientSim(api).register()
        val code = sim.code(user)
        val tokens = sim.exchange(code).obj()
        assertTrue(sim.works(tokens.s("access_token")))
        assertEquals("invalid_grant", sim.exchange(code).obj().s("error"))
        assertEquals(HttpStatusCode.Unauthorized, sim.mcp(tokens.s("access_token"), "tools/list").status)
        assertEquals("invalid_grant", sim.refresh(tokens.s("refresh_token")).obj().s("error"))
        // The connected app is gone too: the user must approve again.
        assertTrue(api.get("/v1/me/connected-apps", user.token).arr().none { it.s("clientId") == sim.clientId })
    }

    @Test
    fun `codes are bound to their client and exact redirect, loopback port included`() = withApp { api ->
        val user = TestUser.create("bound")
        val app = OAuthClientSim(api, redirectUri = "http://127.0.0.1:5000/callback")
            .register(redirects = listOf("http://127.0.0.1/callback"))
        // Any loopback port may be requested at the authorization endpoint (RFC 8252)...
        val code = app.query(app.decide(user, app.authorizeParams())).getValue("code")
        // ...but the token request must repeat exactly the one the code was issued for.
        assertEquals("invalid_grant", app.exchange(code, redirect = "http://127.0.0.1:6000/callback").obj().s("error"))
        val code2 = app.query(app.decide(user, app.authorizeParams())).getValue("code")
        val noRedirect = app.token(
            "grant_type" to "authorization_code", "code" to code2, "client_id" to app.clientId, "code_verifier" to app.verifier,
        )
        assertEquals("invalid_grant", noRedirect.obj().s("error"), "redirect_uri is required when it was in the request")
        assertStatus(HttpStatusCode.OK, app.exchange(app.query(app.decide(user, app.authorizeParams())).getValue("code")))

        // Another registered client presenting this client's code and verifier.
        val thief = OAuthClientSim(api, redirectUri = app.redirectUri).register(redirects = listOf("http://127.0.0.1/callback"))
        val stolen = app.query(app.decide(user, app.authorizeParams())).getValue("code")
        assertEquals("invalid_grant", thief.exchange(stolen, verifier = app.verifier).obj().s("error"))
    }

    @Test
    fun `redirect URIs are matched exactly and never become open redirects`() = withApp { api ->
        val user = TestUser.create("redirect")
        val sim = OAuthClientSim(api).register() // https://client.example/callback
        listOf(
            "https://client.example/callback/", "https://client.example/callback?next=https://evil.example",
            "https://client.example/callback#frag", "https://client.example/Callback", "https://CLIENT.example/callback",
            "http://client.example/callback", "https://client.example:443/callback", "https://client.example/callback/../evil",
            "https://client.example/callback%2F..%2Fevil", "https://client.example@evil.example/callback",
            "https://client.example.evil.example/callback", "https://evil.example/https://client.example/callback",
            "//evil.example/callback", "/callback", "javascript:alert(1)//https://client.example/callback", "",
        ).forEach { redirect ->
            val res = sim.check(user, sim.authorizeParams(redirect = redirect))
            assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", res)
            assertEquals(null, res.headers[HttpHeaders.Location])
            assertError(
                HttpStatusCode.BadRequest, "INVALID_REQUEST",
                api.post(
                    "/v1/oauth/authorize",
                    jsonOf("request" to sim.authorizeParams(redirect = redirect), "approve" to true), user.token,
                ),
            )
        }
        // Registration refuses redirect URIs that hide another host or are not https/loopback.
        listOf(
            "https://good.example@evil.example/cb", "https://good.example:pw@evil.example/cb", "http://localhost@evil.example/cb",
            "http://localhost.evil.example/cb", "http://127.0.0.1.nip.io/cb", "//evil.example/cb", "https://good.example/cb#x",
            "data:text/html,<script>alert(1)</script>", "JAVASCRIPT:alert(1)",
        ).forEach { redirect ->
            val res = api.post(
                "/v1/oauth/register", jsonOf("client_name" to "Bad", "redirect_uris" to listOf(redirect)),
            )
            assertEquals(HttpStatusCode.BadRequest, res.status, redirect)
            assertEquals("invalid_redirect_uri", res.obj().s("error"), redirect)
        }
    }

    @Test
    fun `refresh tokens are bound to their client and are not access tokens`() = withApp { api ->
        val user = TestUser.create("refresh")
        val sim = OAuthClientSim(api).register()
        val other = OAuthClientSim(api).register()
        val tokens = sim.connect(user)
        // A refresh token is not a bearer token for the MCP, and an access token is not a refresh token.
        assertEquals(HttpStatusCode.Unauthorized, sim.mcp(tokens.s("refresh_token"), "tools/list").status)
        assertEquals("invalid_grant", sim.refresh(tokens.s("access_token")).obj().s("error"))
        assertTrue(sim.works(tokens.s("access_token")), "presenting the wrong kind of token does not revoke anything")
        // Another client presenting it: refused, and treated as theft (the whole grant ends).
        val stolen = other.token(
            "grant_type" to "refresh_token", "refresh_token" to tokens.s("refresh_token"),
            "client_id" to other.clientId,
        )
        assertEquals("invalid_grant", stolen.obj().s("error"))
        assertEquals(HttpStatusCode.Unauthorized, sim.mcp(tokens.s("access_token"), "tools/list").status)
        assertEquals("invalid_grant", sim.refresh(tokens.s("refresh_token")).obj().s("error"))
        // Missing client_id or refresh token.
        val fresh = sim.connect(user)
        assertEquals(
            "invalid_client", sim.token("grant_type" to "refresh_token", "refresh_token" to fresh.s("refresh_token")).obj().s("error"),
        )
        assertEquals("invalid_request", sim.token("grant_type" to "refresh_token", "client_id" to sim.clientId).obj().s("error"))
        assertTrue(sim.works(fresh.s("access_token")))
    }

    @Test
    fun `revoking a refresh token ends the grant, revoking an access token ends only that token`() = withApp { api ->
        val user = TestUser.create("revoke")
        val sim = OAuthClientSim(api).register()

        val a = sim.connect(user)
        assertStatus(HttpStatusCode.OK, api.revoke(a.s("access_token")))
        assertEquals(HttpStatusCode.Unauthorized, sim.mcp(a.s("access_token"), "tools/list").status)
        val rotated = sim.refresh(a.s("refresh_token")).obj()
        assertTrue(sim.works(rotated.s("access_token")), "the refresh token still works after revoking an access token")

        assertStatus(HttpStatusCode.OK, api.revoke(rotated.s("refresh_token")))
        assertEquals(HttpStatusCode.Unauthorized, sim.mcp(rotated.s("access_token"), "tools/list").status)
        assertEquals("invalid_grant", sim.refresh(rotated.s("refresh_token")).obj().s("error"))

        // RFC 7009 2.2: unknown, already revoked and malformed tokens still answer 200.
        listOf("bat_unknown", "bar_unknown", rotated.s("refresh_token"), "not-a-token", "x".repeat(500)).forEach {
            assertStatus(HttpStatusCode.OK, api.revoke(it))
        }
        assertEquals("invalid_request", api.revoke(null).obj().s("error"))
        // Another client naming itself cannot revoke this client's tokens.
        val b = sim.connect(user)
        val other = OAuthClientSim(api).register()
        assertStatus(HttpStatusCode.OK, api.revoke(b.s("refresh_token"), clientId = other.clientId))
        assertTrue(sim.works(b.s("access_token")))
        assertStatus(HttpStatusCode.OK, sim.refresh(b.s("refresh_token")))
    }

    @Test
    fun `refresh may narrow scopes but never widen them, even back to the original grant`() = withApp { api ->
        val user = TestUser.create("scopes")
        val sim = OAuthClientSim(api).register()
        val all = sim.connect(user)
        assertEquals("invalid_scope", sim.refresh(all.s("refresh_token"), scope = "bookings:read admin").obj().s("error"))
        val narrowed = sim.refresh(all.s("refresh_token"), scope = "marketplace:read")
        assertStatus(HttpStatusCode.OK, narrowed)
        val n = narrowed.obj()
        assertEquals("marketplace:read", n.s("scope"))
        val denied = sim.mcp(n.s("access_token"), "tools/call", parse("""{"name":"list_my_bookings","arguments":{}}""").o)
        assertEquals(HttpStatusCode.Forbidden, denied.status)
        assertEquals(
            "invalid_scope",
            sim.refresh(n.s("refresh_token"), scope = "marketplace:read bookings:write").obj().s("error"),
            "the narrowed refresh token cannot win back what it gave up",
        )
    }

    @Test
    fun `consenting again to fewer scopes takes the others back from earlier tokens and codes`() = withApp { api ->
        val user = TestUser.create("narrow")
        val sim = OAuthClientSim(api).register()
        val reader = sim.connect(user, scope = "bookings:read")
        // Consenting to more keeps earlier tokens: bookings:write covers bookings:read.
        val writer = sim.connect(user, scope = "bookings:write marketplace:read")
        assertTrue(sim.works(reader.s("access_token")))
        val pending = sim.code(user, scope = "bookings:write marketplace:read")
        val rotated = sim.refresh(writer.s("refresh_token")).obj()

        val narrow = sim.connect(user, scope = "marketplace:read")
        assertTrue(sim.works(narrow.s("access_token")))
        listOf(reader, writer, rotated).forEach { tokens ->
            assertEquals(false, sim.works(tokens.s("access_token")), tokens.s("scope"))
        }
        assertEquals("invalid_grant", sim.refresh(rotated.s("refresh_token")).obj().s("error"))
        assertEquals("invalid_grant", sim.exchange(pending).obj().s("error"), "an unused code from the wider consent")
        assertTrue(sim.works(narrow.s("access_token")), "the grant itself stays")
        assertEquals("marketplace:read", sim.refresh(narrow.s("refresh_token")).obj().s("scope"))
    }

    @Test
    fun `the consent screen warns about the redirect actually requested, not the client's other redirects`() = withApp { api ->
        val user = TestUser.create("consent")
        val sim = OAuthClientSim(api).register(redirects = listOf("https://client.example/callback", "http://127.0.0.1/callback"))
        fun localOnly(redirect: String) = suspend {
            val res = sim.check(user, sim.authorizeParams(redirect = redirect))
            assertStatus(HttpStatusCode.OK, res)
            res.obj()["client"]!!.o["localOnly"].toString()
        }
        assertEquals("false", localOnly("https://client.example/callback")())
        // Any program on the device can listen on a loopback port and pose as this app: the user is warned.
        assertEquals("true", localOnly("http://127.0.0.1:53682/callback")())
    }

    @Test
    fun `a JSON-RPC batch cannot call a tool the token has no scope for`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val user = TestUser.create("batch")
        val booked = Fixtures.book(api, clinic, "Consult", "2026-10-07T10:00:00+01:00", email = user.email, token = user.token)
        val sim = OAuthClientSim(api).register()
        val readOnly = sim.connect(user, scope = "marketplace:read").s("access_token")
        val call = """{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"cancel_booking",""" +
            """"arguments":{"bookingId":"${booked["booking"]!!.o.s("id")}","confirm":true}}}"""
        // A batch (a JSON array), and a body only a lenient parser reads (the tool name unquoted): the route's own scope
        // check can't see the tool in either, the MCP server runs it.
        for (body in listOf("[$call]", call.replace("\"cancel_booking\"", "cancel_booking"))) {
            val res = api.client.post("/v1/mcp/customer") {
                header(HttpHeaders.Authorization, "Bearer $readOnly")
                header("Accept", "application/json, text/event-stream")
                header("MCP-Protocol-Version", "2025-11-25")
                contentType(ContentType.Application.Json)
                setBody(body)
            }
            val text = res.bodyAsText()
            assertTrue(!text.contains("\"isError\":false"), "the call must not run: ${res.status} $text")
            assertEquals("confirmed", api.get("/v1/public/manage/${booked.s("manageToken")}").obj().s("status"), body)
        }
    }

    @Test
    fun `tokens are bound to our resource, at the token endpoint and the MCP guard`() {
        val ours = TestEnv()
        var tokens: JsonObject? = null
        withApp(ours) { api ->
            val user = TestUser.create("audience")
            val sim = OAuthClientSim(api).register()
            tokens = sim.connect(user)
            val other = sim.token(
                "grant_type" to "refresh_token", "refresh_token" to tokens!!.s("refresh_token"), "client_id" to sim.clientId,
                "resource" to "https://other.example/mcp",
            )
            assertEquals("invalid_target", other.obj().s("error"))
            // Same resource in another spelling is the same resource (RFC 8707 comparison).
            val same = sim.token(
                "grant_type" to "refresh_token", "refresh_token" to tokens!!.s("refresh_token"), "client_id" to sim.clientId,
                "resource" to "HTTP://LOCALHOST:3000/mcp/",
            )
            assertStatus(HttpStatusCode.OK, same)
            tokens = same.obj()
        }
        // The same database behind a resource server with another canonical URL: our tokens are not for it.
        val elsewhere = TestEnv(
            config = TestConfig.config().copy(
                oauth = OAuthConfig("https://other.example", "https://other.example/api", "https://other.example/mcp"),
            ),
        )
        withApp(elsewhere) { api ->
            val res = OAuthClientSim(api).mcp(tokens!!.s("access_token"), "tools/list")
            assertEquals(HttpStatusCode.Unauthorized, res.status)
            assertTrue(res.headers[HttpHeaders.WWWAuthenticate]!!.contains("invalid_token"))
        }
    }

    @Test
    fun `only consent fetches client metadata documents, and a failed one is not fetched again for 5 minutes`() {
        val fetched = mutableListOf<String>()
        val env = TestEnv(clientMetadataFetcher = ClientMetadataFetcher { url -> synchronized(fetched) { fetched += url }; null })
        withApp(env) { api ->
            val url = "https://unknown-${System.nanoTime()}.example/client.json"
            val sim = OAuthClientSim(api).also { it.clientId = url }
            // The token endpoint is unauthenticated: it knows stored clients only and never fetches.
            assertEquals("invalid_client", sim.exchange("some-code").obj().s("error"))
            assertEquals("invalid_client", sim.refresh("some-refresh-token").obj().s("error"))
            assertEquals(emptyList(), fetched)

            val user = TestUser.create("fetches")
            repeat(3) { assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", sim.check(user, sim.authorizeParams())) }
            assertEquals(listOf(url), fetched, "a failure is remembered")
            env.clock.instant = env.clock.instant.plus(ClientRegistry.FAILURE_TTL)
            assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", sim.check(user, sim.authorizeParams()))
            assertEquals(listOf(url, url), fetched, "and fetched again once it expires")
        }
    }

    @Test
    fun `client metadata documents are fetched a few at a time`() {
        val inFlight = AtomicInteger()
        val release = CountDownLatch(1)
        val fetched = AtomicInteger()
        val registry = ClientRegistry(
            TestEnv().db,
            ClientMetadataFetcher {
                fetched.incrementAndGet()
                inFlight.incrementAndGet()
                release.await(30, TimeUnit.SECONDS)
                inFlight.decrementAndGet()
                null
            },
        )
        val now = DEFAULT_NOW
        val busy = (1..ClientRegistry.MAX_CONCURRENT_FETCHES).map { i ->
            thread { registry.resolve("https://busy-$i-${System.nanoTime()}.example/client.json", now) }
        }
        try {
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30)
            while (inFlight.get() < ClientRegistry.MAX_CONCURRENT_FETCHES) {
                check(System.nanoTime() < deadline) { "the first fetches never started" }
                Thread.onSpinWait()
            }
            // Every turn is taken: one more waits for a turn, then gives up without fetching (or remembering a failure).
            val extra = "https://extra-${System.nanoTime()}.example/client.json"
            assertNull(registry.resolve(extra, now))
            assertEquals(ClientRegistry.MAX_CONCURRENT_FETCHES, fetched.get())
            release.countDown()
            busy.forEach { it.join(30_000) }
            assertNull(registry.resolve(extra, now))
            assertEquals(ClientRegistry.MAX_CONCURRENT_FETCHES + 1, fetched.get(), "fetched once a turn was free")
        } finally {
            release.countDown()
        }
    }

    @Test
    fun `codes expire after 5 minutes and refresh tokens after 30 days`() {
        val env = TestEnv()
        withApp(env) { api ->
            val user = TestUser.create("expiry")
            val sim = OAuthClientSim(api).register()
            val code = sim.code(user)
            env.clock.instant = env.clock.instant.plusSeconds(5 * 60)
            assertEquals("invalid_grant", sim.exchange(code).obj().s("error"))

            val tokens = sim.connect(user)
            env.clock.instant = env.clock.instant.plusSeconds(30L * 86_400 - 1)
            val last = sim.refresh(tokens.s("refresh_token"))
            assertStatus(HttpStatusCode.OK, last)
            env.clock.instant = env.clock.instant.plusSeconds(30L * 86_400)
            assertEquals("invalid_grant", sim.refresh(last.obj().s("refresh_token")).obj().s("error"))
        }
    }

    @Test
    fun `a deleted user's grants stop working, for access and refresh`() {
        val env = TestEnv()
        withApp(env) { api ->
            val user = TestUser.create("deleted")
            val sim = OAuthClientSim(api).register()
            val tokens = sim.connect(user)
            assertTrue(sim.works(tokens.s("access_token")))
            val clerkId = "dev_" + user.email.substringBefore('@')
            env.db.tx { conn -> ClerkEventHandler().delete(conn, clerkId) }

            assertEquals(HttpStatusCode.Unauthorized, sim.mcp(tokens.s("access_token"), "tools/list").status)
            assertEquals("invalid_grant", sim.refresh(tokens.s("refresh_token")).obj().s("error"))
            // A late "user.updated" for the deleted account (webhooks may arrive out of order) brings nothing back.
            env.db.tx { conn ->
                ClerkEventHandler().handle(
                    conn, "user.updated",
                    parse(
                        """{"id":"$clerkId","first_name":"Back","email_addresses":[{"id":"e1","email_address":"${user.email}"}],
                        "primary_email_address_id":"e1"}""",
                    ) as JsonObject,
                )
            }
            assertEquals(HttpStatusCode.Unauthorized, sim.mcp(tokens.s("access_token"), "tools/list").status)
            // Nor does their web session token, still valid for a minute after the deletion.
            assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", user.token))
            assertEquals(
                null,
                Fixtures.sqlOne("SELECT email::text FROM users WHERE clerk_user_id = ?", clerkId) {
                    it.getString(1)
                },
                "the anonymised account stays anonymised",
            )
        }
    }

    @Test
    fun `web session tokens, dev or Clerk, are never accepted by the customer MCP`() {
        val jwks = JwksServer()
        try {
            val clerk = ClerkConfig(jwks.issuer, "${jwks.issuer}/.well-known/jwks.json", setOf("http://localhost:3000"), null)
            val env = TestEnv(config = TestConfig.config(authMode = AuthMode.CLERK, clerk = clerk), verifier = ClerkJwtVerifier(clerk))
            withApp(env) { api ->
                val session = jwks.token(sub = "user_${System.nanoTime()}")
                assertStatus(HttpStatusCode.OK, api.get("/v1/me", session))
                val sim = OAuthClientSim(api)
                for (token in listOf(session, TestUser.create("web").token, "Bearer $session", "bat_$session")) {
                    val res = sim.mcp(token, "tools/list")
                    assertEquals(HttpStatusCode.Unauthorized, res.status, token.take(20))
                    assertTrue(res.headers[HttpHeaders.WWWAuthenticate]!!.contains("invalid_token"))
                }
            }
        } finally {
            jwks.stop()
        }
    }
}
