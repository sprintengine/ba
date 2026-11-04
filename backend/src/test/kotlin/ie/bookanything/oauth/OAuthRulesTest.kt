package ie.bookanything.oauth

import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class OAuthRulesTest {
    private val config = OAuthConfig(
        "https://bookanything.ie", "https://bookanything.ie/api", "https://bookanything.ie/mcp", "https://bookanything.ie/mcp/business",
    )
    private val customerScopes = Scope.of(McpResource.CUSTOMER)
    private val now = Instant.parse("2026-10-05T08:00:00Z")

    @Test
    fun `PKCE S256 verifies the matching verifier only`() {
        val verifier = "dBjftJeZ4CVP-mJ92K9x5nHxLFf9Mt8h8qrDz3kSSHA"
        val challenge = Pkce.challengeFor(verifier)
        assertEquals("01wj8-yUYQtctjQTgmCGfcEWBKTuUSBNht4Cgofhjls", challenge)
        assertTrue(Pkce.isValidChallenge(challenge))
        assertTrue(Pkce.verify(verifier, challenge))
        assertFalse(Pkce.verify(verifier.dropLast(1) + "B", challenge), "wrong verifier")
        assertFalse(Pkce.verify(null, challenge))
        assertFalse(Pkce.verify("short", Pkce.challengeFor("short")), "verifiers are 43-128 characters")
        assertFalse(Pkce.verify("a".repeat(129), Pkce.challengeFor("a".repeat(129))))
        assertFalse(Pkce.verify("${"a".repeat(42)}!", Pkce.challengeFor("${"a".repeat(42)}!")), "unreserved characters only")
        assertFalse(Pkce.isValidChallenge("plain-verifier-used-as-challenge"))
        assertFalse(Pkce.isValidChallenge(null))
    }

    @Test
    fun `redirect URIs must match exactly, except the port of loopback redirects`() {
        val registered = listOf("https://claude.ai/api/mcp/auth_callback", "http://localhost/callback", "http://127.0.0.1/callback")
        assertTrue(RedirectUris.matches(registered, "https://claude.ai/api/mcp/auth_callback"))
        assertFalse(RedirectUris.matches(registered, "https://claude.ai/api/mcp/auth_callback/"), "no trailing slash leniency")
        assertFalse(RedirectUris.matches(registered, "https://claude.ai/api/mcp/auth_callback?x=1"))
        assertFalse(RedirectUris.matches(registered, "https://evil.example/api/mcp/auth_callback"))
        assertFalse(RedirectUris.matches(registered, "HTTPS://claude.ai/api/mcp/auth_callback"))
        assertTrue(RedirectUris.matches(registered, "http://localhost:3118/callback"), "RFC 8252 7.3: any loopback port")
        assertTrue(RedirectUris.matches(registered, "http://127.0.0.1:50000/callback"))
        assertFalse(RedirectUris.matches(registered, "http://localhost:3118/other"))
        assertFalse(RedirectUris.matches(listOf("https://app.example/cb"), "http://localhost:3118/cb"), "loopback only matches loopback")
    }

    @Test
    fun `registration accepts https, loopback http and app schemes`() {
        listOf(
            "https://chatgpt.com/connector_platform_oauth_redirect", "http://localhost:8080/cb", "http://127.0.0.1/cb",
            "http://[::1]:9/cb",
            "com.example.app:/oauth", "cursor://anysphere/oauth",
        ).forEach { assertEquals(null, RedirectUris.problem(it), it) }
        listOf(
            "http://example.com/cb", "https://example.com/cb#frag", "javascript:alert(1)", "data:text/html,x", "/relative",
            "https://user:pw@example.com/cb", "file:///etc/passwd",
        ).forEach { assertTrue(RedirectUris.problem(it) != null, it) }
        assertEquals("claude.ai", RedirectUris.displayHost("https://claude.ai/api/mcp/auth_callback"))
        assertTrue(RedirectUris.displayHost("http://localhost:3118/callback").contains("this device"))
        assertEquals(
            "https://a.example/cb?x=1&code=c&state=s+1",
            RedirectUris.withParams("https://a.example/cb?x=1", listOf("code" to "c", "state" to "s 1", "iss" to null)),
        )
    }

    @Test
    fun `scopes parse, default and honour the hierarchy`() {
        assertEquals(ScopeRequest.Valid(customerScopes), ScopeRequest.parse(null))
        assertEquals(ScopeRequest.Valid(customerScopes), ScopeRequest.parse("offline_access"))
        assertEquals(ScopeRequest.Valid(setOf(Scope.BOOKINGS_READ)), ScopeRequest.parse("bookings:read offline_access"))
        assertEquals(ScopeRequest.Unknown(listOf("admin")), ScopeRequest.parse("bookings:read admin"))
        assertTrue(Scope.satisfies(setOf(Scope.BOOKINGS_WRITE), Scope.BOOKINGS_READ), "write implies read")
        assertFalse(Scope.satisfies(setOf(Scope.BOOKINGS_READ), Scope.BOOKINGS_WRITE))
        assertFalse(Scope.satisfies(setOf(Scope.BOOKINGS_WRITE), Scope.MARKETPLACE_READ))
        assertEquals("bookings:read bookings:write marketplace:read", Scope.format(customerScopes.reversed()))
    }

    @Test
    fun `each scope belongs to one resource, and a request may only hold its resource's scopes`() {
        assertEquals(setOf(Scope.BUSINESS_READ, Scope.BUSINESS_WRITE), Scope.of(McpResource.BUSINESS))
        assertEquals(ScopeRequest.Valid(Scope.of(McpResource.BUSINESS)), ScopeRequest.parse(null, McpResource.BUSINESS))
        assertEquals(ScopeRequest.Valid(setOf(Scope.BUSINESS_READ)), ScopeRequest.parse("business:read", McpResource.BUSINESS))
        assertEquals(
            ScopeRequest.OtherResource(listOf("bookings:read")), ScopeRequest.parse("business:read bookings:read", McpResource.BUSINESS),
        )
        assertEquals(ScopeRequest.OtherResource(listOf("business:write")), ScopeRequest.parse("business:write"))
        assertTrue(Scope.satisfies(setOf(Scope.BUSINESS_WRITE), Scope.BUSINESS_READ), "write implies read")
        assertFalse(Scope.satisfies(setOf(Scope.BUSINESS_WRITE), Scope.BOOKINGS_READ))
        assertFalse(Scope.satisfies(setOf(Scope.BOOKINGS_WRITE), Scope.BUSINESS_READ))
        // A request that names no resource is for the business one only when it asks for business scopes alone.
        assertEquals(McpResource.BUSINESS, ScopeRequest.impliedResource("business:read business:write offline_access"))
        assertEquals(McpResource.CUSTOMER, ScopeRequest.impliedResource("business:read bookings:read"))
        assertEquals(McpResource.CUSTOMER, ScopeRequest.impliedResource(null))
    }

    private val grant = UUID.randomUUID()
    private fun code(usedAt: Instant? = null, expiresAt: Instant = now.plusSeconds(60), revoked: Boolean = false) =
        CodeRecord(grant, "client", "https://a.example/cb", "c", customerScopes, config.resource, expiresAt, usedAt, revoked)
    private fun token(
        kind: SecretKind, usedAt: Instant? = null, expiresAt: Instant = now.plusSeconds(60), revoked: Boolean = false,
        resource: String = config.resource,
    ) =
        TokenRecord(grant, UUID.randomUUID(), "client", kind, customerScopes, resource, expiresAt, usedAt, revoked)

    @Test
    fun `codes are single use and short lived, and a replay is detected`() {
        assertIs<Redemption.Valid<CodeRecord>>(TokenPolicy.classifyCode(code(), now))
        assertEquals(Redemption.Replayed(grant), TokenPolicy.classifyCode(code(usedAt = now.minusSeconds(5)), now))
        assertEquals(Redemption.Invalid, TokenPolicy.classifyCode(code(expiresAt = now), now))
        assertEquals(Redemption.Invalid, TokenPolicy.classifyCode(code(revoked = true), now))
        assertEquals(Redemption.Invalid, TokenPolicy.classifyCode(null, now))
    }

    @Test
    fun `refresh tokens rotate, and presenting a rotated one is a replay`() {
        assertIs<Redemption.Valid<TokenRecord>>(TokenPolicy.classifyRefresh(token(SecretKind.REFRESH), now))
        assertEquals(Redemption.Replayed(grant), TokenPolicy.classifyRefresh(token(SecretKind.REFRESH, usedAt = now), now))
        assertEquals(Redemption.Invalid, TokenPolicy.classifyRefresh(token(SecretKind.REFRESH, expiresAt = now.minusSeconds(1)), now))
        assertEquals(Redemption.Invalid, TokenPolicy.classifyRefresh(token(SecretKind.REFRESH, revoked = true), now))
        assertEquals(
            Redemption.Invalid, TokenPolicy.classifyRefresh(token(SecretKind.ACCESS), now), "an access token is not a refresh token",
        )
    }

    @Test
    fun `access tokens are only usable unexpired, unrevoked and for the resource they were issued for`() {
        val customer = McpResource.CUSTOMER
        assertTrue(TokenPolicy.isUsableAccess(token(SecretKind.ACCESS), now, config, customer))
        assertTrue(TokenPolicy.isUsableAccess(token(SecretKind.ACCESS, resource = "HTTPS://BookAnything.ie/mcp/"), now, config, customer))
        assertFalse(TokenPolicy.isUsableAccess(token(SecretKind.ACCESS, expiresAt = now), now, config, customer))
        assertFalse(TokenPolicy.isUsableAccess(token(SecretKind.ACCESS, revoked = true), now, config, customer))
        assertFalse(
            TokenPolicy.isUsableAccess(token(SecretKind.ACCESS, resource = "https://other.example/mcp"), now, config, customer),
            "audience binding",
        )
        assertFalse(TokenPolicy.isUsableAccess(token(SecretKind.REFRESH), now, config, customer))
        // A customer token never works on the business MCP, nor a business token on the customer one.
        assertFalse(TokenPolicy.isUsableAccess(token(SecretKind.ACCESS), now, config, McpResource.BUSINESS))
        val business = token(SecretKind.ACCESS, resource = "https://bookanything.ie/mcp/business")
        assertTrue(TokenPolicy.isUsableAccess(business, now, config, McpResource.BUSINESS))
        assertFalse(TokenPolicy.isUsableAccess(business, now, config, customer))
        // Switched off, the business resource's tokens stop working.
        assertFalse(TokenPolicy.isUsableAccess(business, now, config.copy(businessResource = null), McpResource.BUSINESS))
    }

    @Test
    fun `secrets are prefixed by kind and unguessable`() {
        val a = SecretKind.ACCESS.generate()
        assertTrue(a.startsWith("bat_") && a.length > 40)
        assertEquals(SecretKind.REFRESH, SecretKind.of(SecretKind.REFRESH.generate()))
        assertEquals(null, SecretKind.of("dev.eyJ..."))
        assertTrue(SecretKind.CODE.generate() != SecretKind.CODE.generate())
    }

    @Test
    fun `resource and metadata URLs derive from the configuration`() {
        assertEquals("/mcp", config.resourcePath)
        assertEquals("https://bookanything.ie/.well-known/oauth-protected-resource/mcp", config.resourceMetadataUrl)
        assertEquals("https://bookanything.ie/api/v1/oauth/token", config.tokenEndpoint)
        assertTrue(config.isOurResource("https://bookanything.ie/mcp"))
        assertFalse(config.isOurResource("https://bookanything.ie/mcp#frag"))
        assertFalse(config.isOurResource("https://bookanything.ie/api/v1/mcp"))
        assertFalse(config.isOurResource(null))
        val env = mapOf("MCP_RESOURCE_URL" to "https://mcp.example.ie/")
        assertEquals("https://mcp.example.ie", OAuthConfig.fromEnvironment(env::get, "https://app.example.ie").resource)
        assertEquals("https://app.example.ie/api", OAuthConfig.fromEnvironment(env::get, "https://app.example.ie").apiBaseUrl)
    }

    @Test
    fun `the business resource has its own URL and metadata, and is served only when switched on`() {
        assertEquals("/mcp/business", config.path(McpResource.BUSINESS))
        assertEquals("https://bookanything.ie/.well-known/oauth-protected-resource/mcp/business", config.metadataUrl(McpResource.BUSINESS))
        assertEquals(McpResource.BUSINESS, config.resourceFor("https://BOOKANYTHING.ie/mcp/business/"))
        assertEquals(McpResource.CUSTOMER, config.resourceFor("https://bookanything.ie/mcp"))
        assertEquals(McpResource.BUSINESS, config.resourceAtPath("/mcp/business"))
        assertEquals(null, config.resourceAtPath("/mcp/other"))

        val app = "https://app.example.ie"
        fun business(env: Map<String, String>) = OAuthConfig.fromEnvironment(env::get, app).businessResource
        assertEquals("$app/mcp/business", business(emptyMap()), "on unless switched off")
        assertEquals("$app/mcp/business", business(mapOf("BUSINESS_MCP_ENABLED" to "true")))
        assertEquals(null, business(mapOf("BUSINESS_MCP_ENABLED" to "false")), "the kill switch")
        assertEquals(
            "https://b.example.ie/mcp",
            business(
                mapOf(
                    "BUSINESS_MCP_ENABLED" to "true",
                    "MCP_BUSINESS_RESOURCE_URL" to "https://b.example.ie/mcp/",
                ),
            ),
        )
        val off = OAuthConfig.fromEnvironment(mapOf("BUSINESS_MCP_ENABLED" to "false")::get, app)
        assertEquals(null, off.resourceFor("$app/mcp/business"))
        assertEquals(listOf(McpResource.CUSTOMER), off.resources)
        assertTrue(off.scopes.none { it.resource == McpResource.BUSINESS })
    }

    @Test
    fun `metadata document client ids are https URLs with a path`() {
        assertTrue(ClientRegistry.isMetadataDocumentId("https://claude.ai/oauth/claude-code-client-metadata"))
        assertFalse(ClientRegistry.isMetadataDocumentId("https://example.com/"))
        assertFalse(ClientRegistry.isMetadataDocumentId("http://example.com/client.json"))
        assertFalse(ClientRegistry.isMetadataDocumentId("https://example.com/a/../client.json"))
        assertFalse(ClientRegistry.isMetadataDocumentId("https://user@example.com/client.json"))
        assertFalse(ClientRegistry.isMetadataDocumentId("dyn_abc"))
    }
}
