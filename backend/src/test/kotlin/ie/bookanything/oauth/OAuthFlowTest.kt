package ie.bookanything.oauth

import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.LogCapture
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
        // 2026-07-28 clients send Mcp-Method and Mcp-Name on every request: a refused preflight would fail before they can
        // fall back to an older protocol version.
        listOf("/v1/mcp", "/v1/mcp/customer", "/v1/mcp/business").forEach { path ->
            val res = preflight(path, "authorization,content-type,mcp-protocol-version,mcp-method,mcp-name")
            assertEquals(HttpStatusCode.OK, res.status, path)
            assertEquals("*", res.headers[HttpHeaders.AccessControlAllowOrigin], path)
            val allowed = res.headers[HttpHeaders.AccessControlAllowHeaders].orEmpty().lowercase()
            assertTrue("mcp-method" in allowed && "mcp-name" in allowed, "$path: $allowed")
        }
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
    fun `register, consent, exchange the code with PKCE and refresh with rotation`() {
        val env = TestEnv()
        withApp(env) { api -> registerConsentExchangeRefresh(api, env) }
    }

    private suspend fun registerConsentExchangeRefresh(api: ie.bookanything.support.Api, env: TestEnv) {
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
        env.clock.instant = env.clock.instant.plus(TokenPolicy.REFRESH_REUSE_GRACE).plusSeconds(1)
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

    @Test
    fun `scopes we don't have, or of the other server, are dropped instead of failing the connection`() = withApp { api ->
        val user = TestUser.create("customer")
        val sim = OAuthClientSim(api).register()
        fun scopeKeys(consent: kotlinx.serialization.json.JsonObject) = consent["scopes"]!!.a.map { it.s("key") }
        // OpenID scopes alone: the customer server's defaults.
        val oidc = sim.check(user, sim.authorizeParams(scope = "openid profile email offline_access")).obj()
        assertEquals("consent", oidc.s("type"))
        assertEquals(listOf("bookings:read", "bookings:write", "marketplace:read"), scopeKeys(oidc))
        // Every scope of the authorization server metadata: the customer ones are kept, the business ones dropped.
        val everything = "bookings:read bookings:write marketplace:read business:read business:write offline_access"
        assertEquals(
            listOf("bookings:read", "bookings:write", "marketplace:read"),
            scopeKeys(sim.check(user, sim.authorizeParams(scope = everything)).obj()),
        )
        // The token response says what was granted.
        assertEquals("bookings:read", sim.connect(user, scope = "openid bookings:read admin").s("scope"))
        assertEquals(
            "bookings:read bookings:write marketplace:read", sim.connect(user, scope = "openid business:read").s("scope"),
        )
        // The business server keeps only business scopes.
        val business = OAuthClientSim.business(api).register()
        val owner = ie.bookanything.support.Fixtures.clinic(api).owner
        assertEquals("business:read", business.connect(owner, scope = "openid business:read bookings:write").s("scope"))
    }

    @Test
    fun `a refresh token presented again within a minute of rotation gets a new pair, not a revoked grant`() {
        val env = TestEnv()
        withApp(env) { api ->
            val user = TestUser.create("customer")
            val sim = OAuthClientSim(api).register()
            val first = sim.connect(user).s("refresh_token")

            // Parallel refreshes with the same token (several requests of one client found the access token expired).
            val outcomes = ie.bookanything.support.race(3) { sim.refresh(first) }
            outcomes.forEach { assertEquals(HttpStatusCode.OK, it.status, it.body) }
            val pairs = outcomes.map { ie.bookanything.support.parse(it.body).o }
            assertEquals(3, pairs.map { it.s("refresh_token") }.toSet().size, "each gets a pair of its own")
            pairs.forEach { assertEquals(HttpStatusCode.OK, sim.mcp(it.s("access_token"), "tools/list").status) }

            // A retry after the response was lost on the network, 50 seconds later.
            env.clock.instant = env.clock.instant.plusSeconds(50)
            val retried = sim.refresh(first)
            assertStatus(HttpStatusCode.OK, retried)
            // Every successor works: the client may have kept any of them.
            val next = pairs.map { sim.refresh(it.s("refresh_token")).also { r -> assertStatus(HttpStatusCode.OK, r) }.obj() }
            // Once one of them was used the client has moved on: the old token again, even within the minute, is a replay.
            assertEquals("invalid_grant", sim.refresh(first).obj().s("error"))
            assertEquals(HttpStatusCode.Unauthorized, sim.mcp(next.last().s("access_token"), "tools/list").status)
            assertEquals("invalid_grant", sim.refresh(retried.obj().s("refresh_token")).obj().s("error"))

            // After the minute it is a replay too.
            val late = OAuthClientSim(api).register()
            val lateFirst = late.connect(user).s("refresh_token")
            val lateNext = late.refresh(lateFirst).obj()
            env.clock.instant = env.clock.instant.plus(TokenPolicy.REFRESH_REUSE_GRACE).plusSeconds(1)
            assertEquals("invalid_grant", late.refresh(lateFirst).obj().s("error"))
            assertEquals(HttpStatusCode.Unauthorized, late.mcp(lateNext.s("access_token"), "tools/list").status)

            // One rotated token gives at most a few extra pairs; past that it is a replay.
            val busy = OAuthClientSim(api).register()
            val busyFirst = busy.connect(user).s("refresh_token")
            repeat(1 + TokenPolicy.MAX_REFRESH_REUSES) { assertStatus(HttpStatusCode.OK, busy.refresh(busyFirst)) }
            assertEquals("invalid_grant", busy.refresh(busyFirst).obj().s("error"))

            // Within the minute, another client presenting it is theft all the same.
            val own = OAuthClientSim(api).register()
            val ownFirst = own.connect(user).s("refresh_token")
            assertStatus(HttpStatusCode.OK, own.refresh(ownFirst))
            val other = OAuthClientSim(api).register()
            val stolen = other.token("grant_type" to "refresh_token", "refresh_token" to ownFirst, "client_id" to other.clientId)
            assertEquals("invalid_grant", stolen.obj().s("error"))
            assertEquals("invalid_grant", own.refresh(ownFirst).obj().s("error"))
        }
    }

    @Test
    fun `the token and revocation endpoints also take client_id from HTTP Basic`() = withApp { api ->
        val user = TestUser.create("basic")
        val sim = OAuthClientSim(api).register()
        fun basic(id: String, secret: String = "") =
            "Basic " +
                java.util.Base64.getEncoder().encodeToString("${java.net.URLEncoder.encode(id, Charsets.UTF_8)}:$secret".toByteArray())
        suspend fun form(path: String, auth: String?, vararg fields: Pair<String, String?>) = api.client.submitForm(
            path, io.ktor.http.parameters { fields.forEach { (k, v) -> if (v != null) append(k, v) } },
        ) { if (auth != null) header(HttpHeaders.Authorization, auth) }

        // A code exchanged with the client named only in the header (a password, never issued, is ignored).
        val code = sim.code(user)
        val exchanged = form(
            "/v1/oauth/token", basic(sim.clientId, "ignored"), "grant_type" to "authorization_code", "code" to code,
            "redirect_uri" to sim.redirectUri, "code_verifier" to sim.verifier,
        )
        assertStatus(HttpStatusCode.OK, exchanged)
        val t = exchanged.obj()
        val refreshed = form(
            "/v1/oauth/token", basic(sim.clientId), "grant_type" to "refresh_token",
            "refresh_token" to t.s("refresh_token"),
        )
        assertStatus(HttpStatusCode.OK, refreshed)
        val r = refreshed.obj()

        // A client_id in the body wins over the header; with none there, a malformed header is invalid_client, with the
        // scheme to use (and nothing is spent).
        val other = OAuthClientSim(api).register()
        val bodyWins = form(
            "/v1/oauth/token", basic(other.clientId), "grant_type" to "refresh_token", "refresh_token" to r.s("refresh_token"),
            "client_id" to sim.clientId,
        )
        assertStatus(HttpStatusCode.OK, bodyWins)
        val r2 = bodyWins.obj()
        val malformed = form("/v1/oauth/token", "Basic !!!", "grant_type" to "refresh_token", "refresh_token" to r2.s("refresh_token"))
        assertEquals(HttpStatusCode.Unauthorized, malformed.status)
        assertEquals("invalid_client", malformed.obj().s("error"))
        assertTrue(malformed.headers[HttpHeaders.WWWAuthenticate].orEmpty().startsWith("Basic"))
        val viaHeader = form(
            "/v1/oauth/token", basic(sim.clientId), "grant_type" to "refresh_token", "refresh_token" to r2.s("refresh_token"),
        )
        assertStatus(HttpStatusCode.OK, viaHeader)
        val current = viaHeader.obj()

        // Revocation: another client named in the header can't revoke; this one can.
        assertStatus(HttpStatusCode.OK, form("/v1/oauth/revoke", basic(other.clientId), "token" to current.s("access_token")))
        assertEquals(HttpStatusCode.OK, sim.mcp(current.s("access_token"), "tools/list").status)
        assertStatus(HttpStatusCode.OK, form("/v1/oauth/revoke", basic(sim.clientId), "token" to current.s("access_token")))
        assertEquals(HttpStatusCode.Unauthorized, sim.mcp(current.s("access_token"), "tools/list").status)

        // Browser-based clients may send the header cross-origin.
        val preflight = api.client.options("/v1/oauth/token") {
            header(HttpHeaders.Origin, "https://inspector.example")
            header(HttpHeaders.AccessControlRequestMethod, "POST")
            header(HttpHeaders.AccessControlRequestHeaders, "authorization,content-type")
        }
        assertEquals(HttpStatusCode.OK, preflight.status)
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
            "https://secret.example/client.json" to
                """{"client_id":"https://secret.example/client.json","client_name":"Secretive","redirect_uris":["https://secret.example/cb"],
                "token_endpoint_auth_method":"client_secret_basic"}""",
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
            // A document that names another client_id, or wants client authentication, is rejected, and the log says why
            // (the user only sees that the app can't be connected).
            val logs = LogCapture.of(ClientRegistry::class.java)
            try {
                val liar = OAuthClientSim(api, "https://liar.example/cb").also { it.clientId = "https://liar.example/client.json" }
                assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", liar.check(user, liar.authorizeParams()))
                val secretive = OAuthClientSim(api, "https://secret.example/cb").also { it.clientId = "https://secret.example/client.json" }
                assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", secretive.check(user, secretive.authorizeParams()))
                assertTrue(
                    logs.messages().any { "https://liar.example/client.json rejected: its client_id is not the URL" in it },
                    logs.messages().toString(),
                )
                assertTrue(
                    logs.messages().any { "https://secret.example/client.json" in it && "client_secret_basic" in it },
                    logs.messages().toString(),
                )
            } finally {
                logs.close()
            }
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
