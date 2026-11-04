package ie.bookanything.oauth

import ie.bookanything.auth.TokenService
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** Kinds of opaque OAuth secrets. The prefix makes leaked tokens recognisable (secret scanners) and routes revocation. */
enum class SecretKind(val prefix: String) {
    CODE("bac_"), ACCESS("bat_"), REFRESH("bar_");

    fun generate(): String = prefix + TokenService.randomToken(SECRET_BYTES)

    companion object {
        fun of(token: String): SecretKind? = entries.firstOrNull { token.startsWith(it.prefix) }
    }
}

/** A stored authorization code (looked up by hash). */
data class CodeRecord(
    val grantId: UUID,
    val clientId: String,
    val redirectUri: String,
    val codeChallenge: String,
    val scopes: Set<Scope>,
    val resource: String,
    val expiresAt: Instant,
    val usedAt: Instant?,
    val grantRevoked: Boolean,
)

/** A stored access or refresh token (looked up by hash). */
data class TokenRecord(
    val grantId: UUID,
    val userId: UUID,
    val clientId: String,
    val kind: SecretKind,
    val scopes: Set<Scope>,
    val resource: String,
    val expiresAt: Instant,
    val usedAt: Instant?,
    val revoked: Boolean,
)

/** Outcome of presenting a single-use secret (authorization code or refresh token). */
sealed interface Redemption<out T> {
    data class Valid<T>(val record: T) : Redemption<T>

    /** Presented again after use: a sign of theft, so the whole grant is revoked (OAuth 2.1 4.1.3 and 4.3.1). */
    data class Replayed(val grantId: UUID) : Redemption<Nothing>

    /**
     * A refresh token presented again within [TokenPolicy.REFRESH_REUSE_GRACE] of its rotation, before any of its
     * successors was used and at most [TokenPolicy.MAX_REFRESH_REUSES] times: a client that refreshed twice at once, or
     * retried after losing the response. With the same `client_id` it gets a new pair instead of being disconnected.
     */
    data class Reused<T>(val record: T) : Redemption<T>
    data object Invalid : Redemption<Nothing>
}

/** Pure rules for codes and tokens: expiry, single use, audience. */
object TokenPolicy {
    fun hash(secret: String): String = TokenService.hash(secret)

    fun classifyCode(record: CodeRecord?, now: Instant): Redemption<CodeRecord> = when {
        record == null || record.grantRevoked -> Redemption.Invalid
        record.usedAt != null -> Redemption.Replayed(record.grantId)
        !record.expiresAt.isAfter(now) -> Redemption.Invalid
        else -> Redemption.Valid(record)
    }

    /**
     * How long after rotation a refresh token may be presented again: MCP clients refresh from several requests at once,
     * and a response lost on the network leaves the client holding the old token. Within the window (and until a successor
     * is used, at most [MAX_REFRESH_REUSES] times) the same `client_id` gets a new pair; otherwise it is theft. Clients
     * are public, so a thief who sends the client's `client_id` within the window is not caught then: the price of not
     * disconnecting every client that races itself.
     */
    val REFRESH_REUSE_GRACE: Duration = Duration.ofSeconds(60)

    /** How many extra pairs one rotated refresh token can give within [REFRESH_REUSE_GRACE]. */
    const val MAX_REFRESH_REUSES = 5

    /** Time-based classification only: the store also ends the grace once a successor was used or reuses ran out. */
    fun classifyRefresh(record: TokenRecord?, now: Instant): Redemption<TokenRecord> = when {
        record == null || record.kind != SecretKind.REFRESH || record.revoked -> Redemption.Invalid
        record.usedAt != null && record.expiresAt.isAfter(now) && !record.usedAt.plus(REFRESH_REUSE_GRACE).isBefore(now) ->
            Redemption.Reused(record)
        record.usedAt != null -> Redemption.Replayed(record.grantId)
        !record.expiresAt.isAfter(now) -> Redemption.Invalid
        else -> Redemption.Valid(record)
    }

    /**
     * An access token is usable at [resource] when unrevoked, unexpired and issued for that resource (audience binding,
     * RFC 8707): a customer token never works on the business MCP, nor the other way round.
     */
    fun isUsableAccess(record: TokenRecord?, now: Instant, config: OAuthConfig, resource: McpResource): Boolean =
        record != null && record.kind == SecretKind.ACCESS && !record.revoked && record.expiresAt.isAfter(now) &&
            config.resourceFor(record.resource) == resource
}

/** 256 bits of randomness per secret. */
private const val SECRET_BYTES = 32
