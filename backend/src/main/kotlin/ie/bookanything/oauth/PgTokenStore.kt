package ie.bookanything.oauth

import ie.bookanything.db.Db
import ie.bookanything.db.TextArray
import ie.bookanything.db.bool
import ie.bookanything.db.exists
import ie.bookanything.db.instant
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.stringList
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import java.sql.Connection
import java.sql.ResultSet
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** [TokenStore] in Postgres (`oauth_grants`, `oauth_codes`, `oauth_tokens`). */
class PgTokenStore(private val db: Db) : TokenStore {
    private fun scopes(rs: ResultSet, col: String = "scopes") = rs.stringList(col).mapNotNull(Scope::byValue).toSet()
    private fun values(scopes: Set<Scope>) = TextArray(scopes.sortedBy { it.ordinal }.map { it.value })

    override fun recordConsent(
        userId: UUID, clientId: String, scopes: Set<Scope>, resource: String, redirectUri: String, now: Instant,
    ): UUID =
        db.txBlocking { conn ->
            val grantId = conn.queryOne(
                """
                INSERT INTO oauth_grants (user_id, client_id, scopes, resource, consented_redirect_uri, consented_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, client_id, resource) WHERE revoked_at IS NULL DO UPDATE SET scopes = EXCLUDED.scopes,
                    consented_redirect_uri = EXCLUDED.consented_redirect_uri, consented_at = EXCLUDED.consented_at
                RETURNING id
                """.trimIndent(),
                userId, clientId, values(scopes), resource, redirectUri, now,
            ) { it.uuid("id") }!!
            // Consenting again to fewer scopes takes the others back: tokens and unused codes holding any scope the new
            // consent does not cover stop working (the client gets new ones from this consent's code). Spent refresh tokens
            // are left as they are, so replaying one still revokes the grant.
            val covered = values(Scope.covered(scopes))
            conn.update(
                "UPDATE oauth_tokens SET revoked_at = ? WHERE grant_id = ? AND revoked_at IS NULL AND used_at IS NULL AND NOT (scopes <@ ?)",
                now, grantId, covered,
            )
            conn.update("DELETE FROM oauth_codes WHERE grant_id = ? AND used_at IS NULL AND NOT (scopes <@ ?)", grantId, covered)
            grantId
        }

    override fun hasConsent(userId: UUID, clientId: String, scopes: Set<Scope>, resource: String): Boolean =
        db.txBlocking(readOnly = true) { conn ->
            // Implied scopes count: a grant holding business:write already covers a request for business:read.
            val granted = conn.queryOne(
                "SELECT scopes FROM oauth_grants WHERE user_id = ? AND client_id = ? AND resource = ? AND revoked_at IS NULL",
                userId, clientId, resource,
            ) { scopes(it) } ?: return@txBlocking false
            Scope.covered(granted).containsAll(scopes)
        }

    override fun issueCode(
        grantId: UUID, redirectUri: String, codeChallenge: String, scopes: Set<Scope>, resource: String, expiresAt: Instant,
    ): String {
        val code = SecretKind.CODE.generate()
        db.txBlocking { conn ->
            conn.update(
                "INSERT INTO oauth_codes (code_hash, grant_id, redirect_uri, code_challenge, scopes, resource, expires_at) VALUES (?, ?, " +
                    "?, ?, ?, ?, ?)",
                TokenPolicy.hash(code), grantId, redirectUri, codeChallenge, values(scopes), resource, expiresAt,
            )
        }
        return code
    }

    override fun redeemCode(code: String, now: Instant): Redemption<CodeRecord> = db.txBlocking { conn ->
        val hash = TokenPolicy.hash(code)
        val record = conn.queryOne(
            """
            SELECT c.grant_id, g.client_id, c.redirect_uri, c.code_challenge, c.scopes, c.resource, c.expires_at, c.used_at,
                g.revoked_at IS NOT NULL AS revoked
            FROM oauth_codes c JOIN oauth_grants g ON g.id = c.grant_id WHERE c.code_hash = ? FOR UPDATE OF c
            """.trimIndent(),
            hash,
        ) {
            CodeRecord(
                it.uuid("grant_id"), it.str("client_id"), it.str("redirect_uri"), it.str("code_challenge"), scopes(it),
                it.str("resource"), it.instant("expires_at"), it.instantOrNull("used_at"), it.bool("revoked"),
            )
        }
        val outcome = TokenPolicy.classifyCode(record, now)
        if (outcome is Redemption.Valid) conn.update("UPDATE oauth_codes SET used_at = ? WHERE code_hash = ?", now, hash)
        if (outcome is Redemption.Replayed) revokeGrant(conn, outcome.grantId, now)
        outcome
    }

    override fun issueTokens(
        grantId: UUID, scopes: Set<Scope>, resource: String, accessExpiresAt: Instant, refreshExpiresAt: Instant, now: Instant,
    ): IssuedTokens =
        db.txBlocking { conn -> insertPair(conn, grantId, scopes, resource, accessExpiresAt, refreshExpiresAt, now) }

    private fun insertPair(
        conn: Connection, grantId: UUID, scopes: Set<Scope>, resource: String, accessExpiresAt: Instant, refreshExpiresAt: Instant,
        now: Instant,
    ): IssuedTokens {
        val access = SecretKind.ACCESS.generate()
        val refresh = SecretKind.REFRESH.generate()
        val insert = "INSERT INTO oauth_tokens (token_hash, grant_id, kind, scopes, resource, expires_at, created_at) VALUES (?, ?, ?, " +
            "?, ?, ?, ?)"
        conn.update(insert, TokenPolicy.hash(access), grantId, "access", values(scopes), resource, accessExpiresAt, now)
        conn.update(insert, TokenPolicy.hash(refresh), grantId, "refresh", values(scopes), resource, refreshExpiresAt, now)
        return IssuedTokens(access, refresh, scopes, Duration.between(now, accessExpiresAt).seconds)
    }

    private val tokenSelect = """
        SELECT t.grant_id, g.user_id, g.client_id, t.kind, t.scopes, t.resource, t.expires_at, t.used_at,
            (t.revoked_at IS NOT NULL OR g.revoked_at IS NOT NULL) AS revoked
        FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id WHERE t.token_hash = ?
    """.trimIndent()

    private fun mapToken(rs: ResultSet) = TokenRecord(
        rs.uuid("grant_id"), rs.uuid("user_id"), rs.str("client_id"),
        if (rs.str("kind") == "access") SecretKind.ACCESS else SecretKind.REFRESH,
        scopes(rs), rs.str("resource"), rs.instant("expires_at"), rs.instantOrNull("used_at"), rs.bool("revoked"),
    )

    override fun redeemRefresh(refreshToken: String, now: Instant): Redemption<TokenRecord> = db.txBlocking { conn ->
        val hash = TokenPolicy.hash(refreshToken)
        val record = conn.queryOne("$tokenSelect FOR UPDATE OF t", hash, map = ::mapToken)
        val outcome = TokenPolicy.classifyRefresh(record, now)
        if (outcome is Redemption.Valid) conn.update("UPDATE oauth_tokens SET used_at = ? WHERE token_hash = ?", now, hash)
        if (outcome is Redemption.Replayed) revokeGrant(conn, outcome.grantId, now)
        outcome
    }

    override fun findToken(token: String): TokenRecord? =
        db.txBlocking(readOnly = true) { it.queryOne(tokenSelect, TokenPolicy.hash(token), map = ::mapToken) }

    override fun revokeToken(token: String, now: Instant) {
        db.txBlocking { conn ->
            conn.update("UPDATE oauth_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL", now, TokenPolicy.hash(token))
        }
    }

    override fun revokeGrant(grantId: UUID, now: Instant) {
        db.txBlocking { conn -> revokeGrant(conn, grantId, now) }
    }

    private fun revokeGrant(conn: Connection, grantId: UUID, now: Instant) {
        conn.update("UPDATE oauth_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", now, grantId)
        conn.update("UPDATE oauth_tokens SET revoked_at = ? WHERE grant_id = ? AND revoked_at IS NULL", now, grantId)
    }

    override fun touchGrant(grantId: UUID, now: Instant) {
        db.txBlocking { conn ->
            conn.update(
                "UPDATE oauth_grants SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)",
                now, grantId, now.minus(LAST_USED_RESOLUTION),
            )
        }
    }

    override fun activeGrants(userId: UUID): List<GrantView> = db.txBlocking(readOnly = true) { conn ->
        conn.query(
            """
            SELECT g.id, g.client_id, g.resource, c.client_name, c.client_uri, c.kind, g.consented_redirect_uri, g.scopes, g.consented_at,
                g.last_used_at
            FROM oauth_grants g JOIN oauth_clients c ON c.client_id = g.client_id
            WHERE g.user_id = ? AND g.revoked_at IS NULL ORDER BY g.consented_at DESC, g.id
            """.trimIndent(),
            userId,
        ) {
            GrantView(
                it.uuid("id"), it.str("client_id"), it.str("resource"), it.str("client_name"), it.strOrNull("client_uri"), it.str("kind"),
                it.str("consented_redirect_uri"), scopes(it), it.instant("consented_at"), it.instantOrNull("last_used_at"),
            )
        }
    }

    override fun revokeUserGrant(userId: UUID, grantId: UUID, now: Instant): Boolean = db.txBlocking { conn ->
        val owned = conn.exists("SELECT 1 FROM oauth_grants WHERE id = ? AND user_id = ? AND revoked_at IS NULL", grantId, userId)
        if (owned) revokeGrant(conn, grantId, now)
        owned
    }

    companion object {
        /** Revokes every grant of [userId] and all their tokens, in the caller's transaction (the account was deleted). */
        fun revokeAllForUser(conn: Connection, userId: UUID) {
            conn.update(
                "UPDATE oauth_tokens SET revoked_at = now() WHERE revoked_at IS NULL AND grant_id IN (SELECT id FROM oauth_grants WHERE " +
                    "user_id = ?)",
                userId,
            )
            conn.update("UPDATE oauth_grants SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL", userId)
        }

        /**
         * Deletes up to [limit] authorization codes and up to [limit] tokens that expired before [before] (the daily
         * `jobs/Retention`). A used refresh token is kept until it expires, since presenting it again revokes the grant;
         * after that it is refused anyway. Returns the rows deleted.
         */
        fun purgeExpired(conn: Connection, before: Instant, limit: Int): Int =
            conn.update(
                "DELETE FROM oauth_codes WHERE code_hash IN (SELECT code_hash FROM oauth_codes WHERE expires_at < ? LIMIT ?)",
                before, limit,
            ) + conn.update(
                "DELETE FROM oauth_tokens WHERE token_hash IN (SELECT token_hash FROM oauth_tokens WHERE expires_at < ? LIMIT ?)",
                before, limit,
            )
    }
}

/** `last_used_at` is only rewritten when it is older than this, so busy grants do not write on every request. */
private val LAST_USED_RESOLUTION: Duration = Duration.ofMinutes(5)
