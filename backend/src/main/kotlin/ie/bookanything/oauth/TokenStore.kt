package ie.bookanything.oauth

import java.time.Instant
import java.util.UUID

data class IssuedTokens(val accessToken: String, val refreshToken: String, val scopes: Set<Scope>, val expiresInSeconds: Long)

/** A connected app as the user sees it (one active grant per user, client and resource). */
data class GrantView(
    val id: UUID,
    val clientId: String,
    /** The resource URI the grant is for. */
    val resource: String,
    val clientName: String,
    val clientUri: String?,
    val clientKind: String,
    val redirectUri: String,
    val scopes: Set<Scope>,
    val consentedAt: Instant,
    val lastUsedAt: Instant?,
)

/**
 * Persistence of grants (consent records), authorization codes and tokens. Secrets are only ever stored hashed;
 * every multi-step operation (redeem + mark used, rotate a refresh token) is atomic in the implementation.
 */
interface TokenStore {
    /** Creates or updates the user's active grant for [clientId] and [resource] with what they just approved. */
    fun recordConsent(userId: UUID, clientId: String, scopes: Set<Scope>, resource: String, redirectUri: String, now: Instant): UUID

    /** Whether the user already has an active grant for [clientId] and [resource] covering [scopes]. */
    fun hasConsent(userId: UUID, clientId: String, scopes: Set<Scope>, resource: String): Boolean

    fun issueCode(
        grantId: UUID, redirectUri: String, codeChallenge: String, scopes: Set<Scope>, resource: String, expiresAt: Instant,
    ): String

    /** Marks the code used and returns it; a second presentation is [Redemption.Replayed]. */
    fun redeemCode(code: String, now: Instant): Redemption<CodeRecord>

    fun issueTokens(
        grantId: UUID, scopes: Set<Scope>, resource: String, accessExpiresAt: Instant, refreshExpiresAt: Instant, now: Instant,
    ): IssuedTokens

    /** Marks the refresh token used and returns it; presenting a used one is [Redemption.Replayed]. */
    fun redeemRefresh(refreshToken: String, now: Instant): Redemption<TokenRecord>

    fun findToken(token: String): TokenRecord?

    fun revokeToken(token: String, now: Instant)

    fun revokeGrant(grantId: UUID, now: Instant)

    /** Records use of a grant (at most once per few minutes). */
    fun touchGrant(grantId: UUID, now: Instant)

    fun activeGrants(userId: UUID): List<GrantView>

    /** Revokes the user's grant [grantId]; false when it isn't theirs or already revoked. */
    fun revokeUserGrant(userId: UUID, grantId: UUID, now: Instant): Boolean
}
