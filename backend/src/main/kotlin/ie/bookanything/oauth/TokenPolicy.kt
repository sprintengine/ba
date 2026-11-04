package ie.bookanything.oauth

import ie.bookanything.auth.TokenService
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

    fun classifyRefresh(record: TokenRecord?, now: Instant): Redemption<TokenRecord> = when {
        record == null || record.kind != SecretKind.REFRESH || record.revoked -> Redemption.Invalid
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
