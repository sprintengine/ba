package ie.bookanything.oauth

import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.MutableClock
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.arr
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.header
import io.ktor.client.request.options
import io.ktor.client.request.post
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OAuthFlowTest {
    @Test
    fun `metadata endpoints advertise what MCP clients need`() = withApp { api ->
        val asMeta = api.get("/.well-known/oauth-authorization-server")
        assertStatus(HttpStatusCode.OK, asMeta)
        assertEquals("no-store", asMeta.headers[HttpHeaders.CacheControl])
        val m = asMeta.obj()
        assertEquals("http://localhost:3000", m.s("issuer"))
        assertEquals("http://localhost:3000/oauth/authorize", m.s("authorization_endpoint"))
        assertEquals("http://localhost:3000/api/v1/oauth/token", m.s("token_endpoint"))
        assertEquals("http://localhost:3000/api/v1/oauth/register", m.s("registration_endpoint"))
        assertEquals(listOf("S256"), m["code_challenge_methods_supported"]!!.a.map { it.toString().trim('"') })
        assertEquals(listOf("none"), m["token_endpoint_auth_methods_supported"]!!.a.map { it.toString().trim('"') })
        assertEquals(true, m.b("client_id_metadata_document_supported"))
        assertEquals(true, m.b("authorization_response_iss_parameter_supported"))

        val prm = api.get("/.well-known/oauth-protected-resource/mcp").obj()
        assertEquals("http://localhost:3000/mcp", prm.s("resource"))
        assertEquals(listOf("http://localhost:3000"), prm["authorization_servers"]!!.a.map { it.toString().trim('"') })
        assertEquals(
            listOf("bookings:read", "bookings:write", "marketplace:read"), prm["scopes_supported"]!!.a.map { it.toString().trim('"') },
        )
        assertEquals(prm, api.get("/.well-known/oauth-protected-resource").obj())
        assertEquals(HttpStatusCode.NotFound, api.get("/.well-known/oauth-protected-resource/other").status)

        // Browser-based MCP clients call the metadata, token endpoint and MCP server cross-origin.
        suspend fun preflight(path: String, headers: String = "content-type") = api.client.options(path) {
            header(HttpHeaders.Origin, "https://inspector.example")
            header(HttpHeaders.AccessControlRequestMethod, if (path.startsWith("/.well-known")) "GET" else "POST")
            header(HttpHeaders.AccessControlRequestHeaders, headers)
        }
        listOf("/.well-known/oauth-authorization-server", "/v1/oauth/token", "/v1/oauth/register").forEach { path ->
            val res = preflight(path)
            assertEquals(HttpStatusCode.OK, res.status, path)
            assertEquals("*", res.headers[HttpHeaders.AccessControlAllowOrigin], path)
        }
        assertEquals(HttpStatusCode.OK, preflight("/v1/mcp/customer", "authorization,content-type,mcp-protocol-version").status)
        val cross = api.client.post("/v1/mcp/customer") { header(HttpHeaders.Origin, "https://inspector.example") }
        assertTrue(cross.headers[HttpHeaders.AccessControlExposeHeaders]!!.contains(HttpHeaders.WWWAuthenticate, ignoreCase = true))
        // The consent API (our own page, the user's session) is not opened up.
        assertEquals(null, preflight("/v1/oauth/authorize").headers[HttpHeaders.AccessControlAllowOrigin])
    }

    @Test
    fun `the customer MCP answers 401 with a pointer to its resource metadata`() = withApp { api ->
        val sim = OAuthClientSim(api)
        val anonymous = sim.mcp(null, "tools/list")
        assertEquals(HttpStatusCode.Unauthorized, anonymous.status)
        val challenge = anonymous.headers[HttpHeaders.WWWAuthenticate]!!
        assertTrue(challenge.startsWith("Bearer "), challenge)
        assertTrue(challenge.contains("resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\""), challenge)
        assertTrue(challenge.contains("scope=\"bookings:read bookings:write marketplace:read\""), challenge)
        val bogus = sim.mcp("bat_not-a-real-token", "tools/list")
        assertEquals(HttpStatusCode.Unauthorized, bogus.status)
        assertTrue(bogus.headers[HttpHeaders.WWWAuthenticate]!!.contains("error=\"invalid_token\""))
        // Our web sessions are not MCP tokens (no token passthrough).
        assertEquals(HttpStatusCode.Unauthorized, sim.mcp(TestUser.create("c").token, "tools/list").status)
        assertEquals(HttpStatusCode.Unauthorized, api.get("/v1/mcp/customer").status)
    }

    @Test
    fun `register, consent, exchange the code with PKCE and refresh with rotation`() = withApp { api ->
        val user = TestUser.create("customer", "Riley Customer")
        val sim = OAuthClientSim(api).register("Helpful Assistant")
        assertTrue(sim.clientId.startsWith("dyn_"))

        val consent = sim.check(user, sim.authorizeParams()).obj()
        assertEquals("consent", consent.s("type"))
        assertEquals("Helpful Assistant", consent["client"]!!.o.s("name"))
        assertEquals("client.example", consent["client"]!!.o.s("redirectHost"))
        assertEquals(false, consent["client"]!!.o.b("localOnly"))
        assertEquals(3, consent["scopes"]!!.a.size)
        assertEquals(false, consent.b("previouslyApproved"))
        // A registered client_uri is self-asserted: only shown when it is on the redirect host.
        val claimed = api.post(
            "/v1/oauth/register",
            jsonOf(
                "client_name" to "Totally Your Bank", "client_uri" to "https://bank.example",
                "redirect_uris" to listOf("https://client.example/callback"),
            ),
        ).obj().s("client_id")
        assertEquals(
            kotlinx.serialization.json.JsonNull,
            sim.check(user, sim.authorizeParams() + ("clientId" to claimed)).obj()["client"]!!.o["uri"],
        )

        val redirect = sim.decide(user, sim.authorizeParams())
        assertTrue(redirect.startsWith("https://client.example/callback?code=bac_"), redirect)
        val q = sim.query(redirect)
        assertEquals("state-123", q["state"])
        assertEquals("http://localhost:3000", q["iss"], "RFC 9207 issuer in the response")

        val tokens = sim.exchange(q.getValue("code"))
        assertStatus(HttpStatusCode.OK, tokens)
        assertEquals("no-store", tokens.headers[HttpHeaders.CacheControl])
        val t = tokens.obj()
        assertEquals("Bearer", t.s("token_type"))
        assertEquals(3600, t.i("expires_in"))
        assertEquals("bookings:read bookings:write marketplace:read", t.s("scope"))
        assertTrue(t.s("access_token").startsWith("bat_") && t.s("refresh_token").startsWith("bar_"))
        assertEquals(HttpStatusCode.OK, sim.mcp(t.s("access_token"), "tools/list").status)

        // The same code again: rejected, and the whole grant (including the tokens above) is revoked.
        assertEquals("invalid_grant", sim.exchange(q.getValue("code")).obj().s("error"))
        assertEquals(HttpStatusCode.Unauthorized, sim.mcp(t.s("access_token"), "tools/list").status)

        // Refresh rotation: the new pair works, the old refresh token is single use, and replaying it revokes the grant.
        val second = sim.connect(user)
        assertEquals(true, sim.check(user, sim.authorizeParams()).obj().b("previouslyApproved"))
        val rotated = sim.refresh(second.s("refresh_token"))
        assertStatus(HttpStatusCode.OK, rotated)
        val r = rotated.obj()
        assertTrue(r.s("refresh_token") != second.s("refresh_token"))
        assertEquals(HttpStatusCode.OK, sim.mcp(r.s("access_token"), "tools/list").status)
        assertEquals("invalid_grant", sim.refresh(second.s("refresh_token")).obj().s("error"))
        assertEquals(HttpStatusCode.Unauthorized, sim.mcp(r.s("access_token"), "tools/list").status)
        assertEquals("invalid_grant", sim.refresh(r.s("refresh_token")).obj().s("error"))
    }

    @Test
    fun `authorization errors never redirect to unregistered places and are reported to the client otherwise`() = withApp { api ->
        val user = TestUser.create("customer")
        val sim = OAuthClientSim(api).register()
        // Unknown client or unregistered redirect: shown on our page, never redirected.
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST", sim.check(user, sim.authorizeParams(redirect = "https://evil.example/callback")),
        )
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", sim.check(user, sim.authorizeParams() + ("clientId" to "dyn_unknown")))
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.post(
                "/v1/oauth/authorize",
                jsonOf("request" to sim.authorizeParams(redirect = "https://evil.example/cb"), "approve" to true), user.token,
            ),
        )
        // Everything else goes back to the client with the error, the state and the issuer.
        fun expectRedirectError(res: kotlinx.serialization.json.JsonObject, error: String) {
            assertEquals("redirect", res.s("type"))
            val q = sim.query(res.s("redirectTo"))
            assertEquals(error, q["error"])
            assertEquals("state-123", q["state"])
            assertEquals("http://localhost:3000", q["iss"])
        }
        expectRedirectError(sim.check(user, sim.authorizeParams(withChallenge = false)).obj(), "invalid_request")
        expectRedirectError(sim.check(user, sim.authorizeParams(method = "plain")).obj(), "invalid_request")
        expectRedirectError(sim.check(user, sim.authorizeParams(scope = "bookings:read admin")).obj(), "invalid_scope")
        expectRedirectError(sim.check(user, sim.authorizeParams(resource = "https://other.example/mcp")).obj(), "invalid_target")
        expectRedirectError(sim.check(user, sim.authorizeParams() + ("responseType" to "token")).obj(), "unsupported_response_type")
        assertEquals("access_denied", sim.query(sim.decide(user, sim.authorizeParams(), approve = false))["error"])
        // The consent page needs a signed-in user.
        assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/oauth/authorize?client_id=${sim.clientId}"))

        // Token endpoint: wrong verifier, wrong redirect, wrong client, unknown client, bad grant type, JSON body.
        assertEquals("invalid_grant", sim.exchange(sim.code(user), verifier = "x".repeat(50)).obj().s("error"))
        assertEquals("invalid_grant", sim.exchange(sim.code(user), redirect = "https://client.example/other").obj().s("error"))
        val other = OAuthClientSim(api).register()
        val code = sim.code(user)
        assertEquals("invalid_grant", other.exchange(code, verifier = sim.verifier, redirect = sim.redirectUri).obj().s("error"))
        val unknown = sim.token("grant_type" to "authorization_code", "code" to sim.code(user), "client_id" to "dyn_nope")
        assertEquals(HttpStatusCode.Unauthorized, unknown.status)
        assertEquals("invalid_client", unknown.obj().s("error"))
        assertEquals("unsupported_grant_type", sim.token("grant_type" to "password", "client_id" to sim.clientId).obj().s("error"))
        assertEquals("invalid_request", api.post("/v1/oauth/token", jsonOf("grant_type" to "authorization_code")).obj().s("error"))
        assertEquals(
            "invalid_target",
            sim.token(
                "grant_type" to "authorization_code", "code" to sim.code(user), "client_id" to sim.clientId,
                "redirect_uri" to sim.redirectUri, "code_verifier" to sim.verifier, "resource" to "https://other.example/mcp",
            ).obj().s("error"),
        )

        // Registration rejects unsafe redirect URIs.
        val bad = api.post("/v1/oauth/register", jsonOf("client_name" to "Bad", "redirect_uris" to listOf("http://evil.example/cb")))
        assertEquals(HttpStatusCode.BadRequest, bad.status)
        assertEquals("invalid_redirect_uri", bad.obj().s("error"))
        assertEquals(
            "invalid_client_metadata",
            api.post(
                "/v1/oauth/register",
                jsonOf(
                    "redirect_uris" to listOf("https://a.example/cb"),
                    "grant_types" to listOf("client_credentials"),
                ),
            ).obj().s("error"),
        )
    }

    @Test
    fun `tokens expire, can be revoked, and connected apps can be disconnected`() {
        val env = TestEnv()
        withApp(env) { api ->
            val user = TestUser.create("customer")
            val sim = OAuthClientSim(api).register("Expiring Assistant")
            val t = sim.connect(user)
            env.clock.advanceMinutes(61)
            val expired = sim.mcp(t.s("access_token"), "tools/list")
            assertEquals(HttpStatusCode.Unauthorized, expired.status)
            assertTrue(expired.headers[HttpHeaders.WWWAuthenticate]!!.contains("invalid_token"))
            val fresh = sim.refresh(t.s("refresh_token")).obj()
            assertEquals(HttpStatusCode.OK, sim.mcp(fresh.s("access_token"), "tools/list").status)

            // RFC 7009 revocation of the access token.
            assertStatus(HttpStatusCode.OK, api.client.submitFormRevoke(fresh.s("access_token")))
            assertEquals(HttpStatusCode.Unauthorized, sim.mcp(fresh.s("access_token"), "tools/list").status)
            // Unknown tokens are accepted silently.
            assertStatus(HttpStatusCode.OK, api.client.submitFormRevoke("bat_unknown"))

            // Connected apps: listed, then disconnected, which ends every token of the grant.
            val again = sim.connect(user)
            val apps = api.get("/v1/me/connected-apps", user.token).arr()
            val app = apps.single { it.s("clientId") == sim.clientId }.o
            assertEquals("Expiring Assistant", app.s("name"))
            assertEquals(3, app["scopes"]!!.a.size)
            assertError(
                HttpStatusCode.NotFound, "NOT_FOUND", api.delete("/v1/me/connected-apps/${app.s("id")}", TestUser.create("other").token),
            )
            assertStatus(HttpStatusCode.NoContent, api.delete("/v1/me/connected-apps/${app.s("id")}", user.token))
            assertEquals(HttpStatusCode.Unauthorized, sim.mcp(again.s("access_token"), "tools/list").status)
            assertEquals("invalid_grant", sim.refresh(again.s("refresh_token")).obj().s("error"))
            assertTrue(api.get("/v1/me/connected-apps", user.token).arr().none { it.s("clientId") == sim.clientId })
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.delete("/v1/me/connected-apps/${app.s("id")}", user.token))
        }
    }

    private suspend fun io.ktor.client.HttpClient.submitFormRevoke(token: String) =
        submitForm("/v1/oauth/revoke", io.ktor.http.parameters { append("token", token) })

    @Test
    fun `scopes are enforced per tool with an insufficient_scope challenge`() = withApp { api ->
        val user = TestUser.create("customer")
        val sim = OAuthClientSim(api).register()
        val readOnly = sim.connect(user, scope = "marketplace:read").s("access_token")
        val search = sim.call(readOnly, "search_marketplace", jsonObj("query" to "zz-nothing"))
        assertEquals(false, OAuthClientSim.isError(search), OAuthClientSim.text(search))
        val denied = sim.mcp(readOnly, "tools/call", jsonObj("name" to "list_my_bookings", "arguments" to emptyMap<String, String>()))
        assertEquals(HttpStatusCode.Forbidden, denied.status)
        val challenge = denied.headers[HttpHeaders.WWWAuthenticate]!!
        assertTrue(challenge.contains("error=\"insufficient_scope\"") && challenge.contains("bookings:read"), challenge)
        assertTrue(challenge.contains("marketplace:read"), "keeps the scopes already granted: $challenge")
        assertEquals(
            HttpStatusCode.Forbidden,
            sim.mcp(readOnly, "tools/call", jsonObj("name" to "book", "arguments" to emptyMap<String, String>())).status,
        )

        // bookings:write implies bookings:read; a refresh may narrow scopes but never widen them.
        val writer = sim.connect(user, scope = "bookings:write")
        assertEquals(false, OAuthClientSim.isError(sim.call(writer.s("access_token"), "list_my_bookings")))
        assertEquals("invalid_scope", sim.refresh(writer.s("refresh_token"), scope = "bookings:write marketplace:read").obj().s("error"))
    }

    @Test
    fun `client ID metadata documents are fetched, validated and used`() {
        val docUrl = "https://assistant.example/oauth/client.json"
        val documents = mapOf(
            docUrl to
                """{"client_id":"$docUrl","client_name":"Metadata Assistant","redirect_uris":["http://localhost/callback","http://127.0.0.1/callback"],
                "token_endpoint_auth_method":"none"}""",
            "https://liar.example/client.json" to
                """{"client_id":"https://honest.example/client.json","client_name":"Liar","redirect_uris":["https://liar.example/cb"]}""",
        )
        val fetched = mutableListOf<String>()
        val env = TestEnv(
            clientMetadataFetcher = ClientMetadataFetcher { url -> fetched += url; documents[url]?.let { FetchedDocument(it, 600) } },
        )
        withApp(env) { api ->
            val user = TestUser.create("customer")
            val sim = OAuthClientSim(api, redirectUri = "http://localhost:53682/callback").also { it.clientId = docUrl }
            val consent = sim.check(user, sim.authorizeParams()).obj()
            assertEquals("Metadata Assistant", consent["client"]!!.o.s("name"))
            assertEquals("metadata_document", consent["client"]!!.o.s("kind"))
            assertEquals("https://assistant.example", consent["client"]!!.o.s("uri"), "the document's own host is verified")
            assertEquals(true, consent["client"]!!.o.b("localOnly"), "loopback-only clients get a warning")
            val tokens = sim.connect(user)
            assertTrue(tokens.s("access_token").startsWith("bat_"))
            assertEquals(1, fetched.count { it == docUrl }, "cached for the document's max-age")
            // A document that names another client_id is rejected.
            val liar = OAuthClientSim(api, "https://liar.example/cb").also { it.clientId = "https://liar.example/client.json" }
            assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", liar.check(user, liar.authorizeParams()))
        }
    }

    @Test
    fun `token and registration endpoints are rate limited`() {
        val env = TestEnv(clock = MutableClock(DEFAULT_NOW.plusSeconds(86_400L * 401 + 11)), config = TestConfig.config(rateLimits = true))
        withApp(env) { api ->
            repeat(OAUTH_REGISTER_LIMIT.max) {
                assertStatus(
                    HttpStatusCode.Created, api.post("/v1/oauth/register", jsonOf("redirect_uris" to listOf("https://a.example/cb"))),
                )
            }
            val limited = api.post("/v1/oauth/register", jsonOf("redirect_uris" to listOf("https://a.example/cb")))
            assertEquals(HttpStatusCode.TooManyRequests, limited.status, limited.bodyAsText())
            assertEquals("temporarily_unavailable", limited.obj().s("error"))
            val sim = OAuthClientSim(api)
            repeat(OAUTH_TOKEN_LIMIT.max) { assertEquals(HttpStatusCode.BadRequest, sim.token("grant_type" to "nope").status) }
            assertEquals(HttpStatusCode.TooManyRequests, sim.token("grant_type" to "nope").status)
        }
    }

    @Test
    fun `the customer MCP is rate limited per connected app, not per IP`() {
        // AI platforms call from a few shared addresses for all their users: one busy user must not block the others.
        val env = TestEnv(clock = MutableClock(DEFAULT_NOW.plusSeconds(86_400L * 403 + 17)), config = TestConfig.config(rateLimits = true))
        withApp(env) { api ->
            val first = OAuthClientSim(api).register("Busy")
            val second = OAuthClientSim(api).register("Quiet")
            val busy = first.connect(TestUser.create("busy")).s("access_token")
            val quiet = second.connect(TestUser.create("quiet")).s("access_token")
            repeat(ie.bookanything.http.RateLimiter.MCP.max) { assertEquals(HttpStatusCode.OK, first.mcp(busy, "tools/list").status) }
            assertEquals(HttpStatusCode.TooManyRequests, first.mcp(busy, "tools/list").status)
            assertEquals(HttpStatusCode.OK, second.mcp(quiet, "tools/list").status, "same IP, another grant")
        }
    }
}

internal fun jsonObj(vararg pairs: Pair<String, Any?>) = ie.bookanything.support.parse(jsonOf(*pairs)).o
