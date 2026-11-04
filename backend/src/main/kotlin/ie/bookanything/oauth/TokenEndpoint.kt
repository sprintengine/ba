package ie.bookanything.oauth

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Clock

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String = "Bearer",
    @SerialName("expires_in") val expiresIn: Long,
    @SerialName("refresh_token") val refreshToken: String,
    val scope: String,
)

/**
 * `POST /v1/oauth/token` (form-encoded): `authorization_code` with PKCE, and `refresh_token` with rotation.
 * Every client is public, so the client is identified by `client_id` and proves possession with PKCE (codes) or the
 * single-use refresh token. A replayed code or refresh token revokes the whole grant.
 */
class TokenEndpoint(
    private val config: OAuthConfig, private val clients: ClientRegistry, private val store: TokenStore, private val clock: Clock,
) {

    fun exchange(params: Map<String, String?>): TokenResponse = when (params["grant_type"]) {
        "authorization_code" -> authorizationCode(params)
        "refresh_token" -> refresh(params)
        null -> throw OAuthException.invalidRequest("grant_type is required")
        else -> throw OAuthException.unsupportedGrantType("Supported grant types: authorization_code, refresh_token")
    }

    private fun client(params: Map<String, String?>): OAuthClient {
        val id = params["client_id"]?.trim().orEmpty()
        if (id.isEmpty()) throw OAuthException.invalidClient("client_id is required")
        // Stored clients only: a metadata document client was stored when its user consented, and this unauthenticated
        // endpoint must never make us fetch a URL.
        return clients.findStored(id) ?: throw OAuthException.invalidClient("Unknown client")
    }

    /**
     * A `resource` sent to the token endpoint must be the one the grant is for (RFC 8707 2.2), and that resource must
     * still be served (the business MCP can be switched off).
     */
    private fun checkResource(raw: String?, issuedFor: String) {
        if (!config.isOurResource(issuedFor)) throw OAuthException.invalidTarget("$issuedFor is no longer available")
        if (!raw.isNullOrBlank() && (!config.isOurResource(raw) || OAuthConfig.canonical(raw) != OAuthConfig.canonical(issuedFor))) {
            throw OAuthException.invalidTarget("The token can only be issued for $issuedFor")
        }
    }

    private fun authorizationCode(params: Map<String, String?>): TokenResponse {
        val client = client(params)
        val code = params["code"]?.takeIf { it.isNotBlank() } ?: throw OAuthException.invalidRequest("code is required")
        val now = clock.instant()
        val record = when (val r = store.redeemCode(code, now)) {
            is Redemption.Valid -> r.record
            is Redemption.Replayed -> throw OAuthException.invalidGrant("This authorization code was already used; access was revoked")
            Redemption.Invalid -> throw OAuthException.invalidGrant("The authorization code is invalid or expired")
        }
        // The code is spent from here on: any mismatch below means a failed attempt, and the client must start again.
        if (record.clientId != client.clientId) throw OAuthException.invalidGrant("The code was issued to another client")
        if (params["redirect_uri"] != record.redirectUri) {
            throw OAuthException.invalidGrant(
                "redirect_uri does not match the authorization request",
            )
        }
        if (!Pkce.verify(params["code_verifier"], record.codeChallenge)) throw OAuthException.invalidGrant("PKCE verification failed")
        checkResource(params["resource"], record.resource)
        return issue(record.grantId, record.scopes, record.resource)
    }

    private fun refresh(params: Map<String, String?>): TokenResponse {
        val client = client(params)
        val token = params["refresh_token"]?.takeIf { it.isNotBlank() } ?: throw OAuthException.invalidRequest("refresh_token is required")
        val requested = params["scope"]
        // A refused scope or resource is the client's mistake, not theft: refuse it before the single-use token is spent,
        // so the client can retry with the same refresh token instead of being disconnected. (A replayed token still
        // reaches the replay detection below.)
        val current = store.findToken(token)
        val redeemable = TokenPolicy.classifyRefresh(current, clock.instant()) is Redemption.Valid
        if (current != null && redeemable && current.clientId == client.clientId) {
            scopesFor(current, requested)
            checkResource(params["resource"], current.resource)
        }
        val record = when (val r = store.redeemRefresh(token, clock.instant())) {
            is Redemption.Valid -> r.record
            is Redemption.Replayed -> throw OAuthException.invalidGrant("This refresh token was already used; access was revoked")
            Redemption.Invalid -> throw OAuthException.invalidGrant("The refresh token is invalid, expired or revoked")
        }
        if (record.clientId != client.clientId) {
            store.revokeGrant(record.grantId, clock.instant())
            throw OAuthException.invalidGrant("The refresh token was issued to another client")
        }
        val scopes = scopesFor(record, requested)
        checkResource(params["resource"], record.resource)
        return issue(record.grantId, scopes, record.resource)
    }

    /** A narrower scope of the grant's resource may be requested (RFC 6749 6); never a wider one. */
    private fun scopesFor(record: TokenRecord, raw: String?): Set<Scope> = when (
        val requested = raw?.let { ScopeRequest.parse(it, config.resourceFor(record.resource) ?: McpResource.CUSTOMER) }
    ) {
        null -> record.scopes
        is ScopeRequest.Unknown -> throw OAuthException.invalidScope("Unknown scope: ${requested.values.joinToString(" ")}")
        is ScopeRequest.OtherResource -> throw OAuthException.invalidScope("Scope exceeds the original grant")
        is ScopeRequest.Valid -> if (record.scopes.containsAll(requested.scopes)) {
            requested.scopes
        } else {
            throw OAuthException.invalidScope("Scope exceeds the original grant")
        }
    }

    private fun issue(grantId: java.util.UUID, scopes: Set<Scope>, resource: String): TokenResponse {
        val now = clock.instant()
        val t = store.issueTokens(grantId, scopes, resource, now.plus(config.accessTokenTtl), now.plus(config.refreshTokenTtl), now)
        return TokenResponse(t.accessToken, expiresIn = t.expiresInSeconds, refreshToken = t.refreshToken, scope = Scope.format(t.scopes))
    }

    /** RFC 7009: revoking a refresh token ends the whole grant; revoking an access token ends that token. Always succeeds. */
    fun revoke(params: Map<String, String?>) {
        val token = params["token"]?.takeIf { it.isNotBlank() } ?: throw OAuthException.invalidRequest("token is required")
        val record = store.findToken(token) ?: return
        val clientId = params["client_id"]?.trim()
        if (!clientId.isNullOrEmpty() && clientId != record.clientId) return
        if (record.kind == SecretKind.REFRESH) {
            store.revokeGrant(
                record.grantId, clock.instant(),
            )
        } else {
            store.revokeToken(token, clock.instant())
        }
    }
}
