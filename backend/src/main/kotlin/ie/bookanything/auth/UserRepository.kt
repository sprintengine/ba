package ie.bookanything.auth

import ie.bookanything.db.bool
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import java.sql.Connection
import java.sql.ResultSet
import java.util.UUID

data class CurrentUser(
    val id: UUID,
    val clerkUserId: String,
    val email: String?,
    val emailVerified: Boolean,
    val name: String?,
) {
    /** The email to trust for linking customers and accepting invitations. */
    val verifiedEmail: String? get() = if (emailVerified) email?.lowercase() else null
}

object UserRepository {
    private fun map(rs: ResultSet) = CurrentUser(
        id = rs.uuid("id"),
        clerkUserId = rs.str("clerk_user_id"),
        email = rs.strOrNull("email"),
        emailVerified = rs.bool("email_verified"),
        name = rs.strOrNull("name"),
    )

    /**
     * The user for [identity] when their row already says what [upsert] would write (the usual case on every request),
     * else null. Lets the caller skip the upsert, which locks the row even when it changes nothing.
     */
    fun findUpToDate(conn: Connection, identity: VerifiedIdentity): CurrentUser? {
        val email = identity.email?.lowercase()
        return conn.queryOne(
            // The negation of upsert's WHERE clause, so both agree on what "changed" means (citext email comparison).
            """
            SELECT id, clerk_user_id, email::text AS email, email_verified, name FROM users
            WHERE clerk_user_id = ? AND deleted_at IS NULL
              AND NOT (?::citext IS NOT NULL AND (email IS DISTINCT FROM ?::citext OR email_verified <> ?))
              AND NOT (?::text IS NOT NULL AND name IS DISTINCT FROM ?::text)
            """.trimIndent(),
            identity.subject, email, email, identity.emailVerified, identity.name, identity.name,
            map = ::map,
        )
    }

    /**
     * Upserts the user row for a verified identity; writes only when something changed. A deleted user's row is never
     * written (Clerk never reuses a user id, so nothing may bring an anonymised account back): see [isDeleted].
     */
    fun upsert(conn: Connection, identity: VerifiedIdentity): CurrentUser {
        val email = identity.email?.lowercase()
        return conn.queryOne(
            """
            INSERT INTO users (clerk_user_id, email, email_verified, name) VALUES (?, ?, ?, ?)
            ON CONFLICT (clerk_user_id) DO UPDATE SET
                email = COALESCE(EXCLUDED.email, users.email),
                email_verified = CASE WHEN EXCLUDED.email IS NULL THEN users.email_verified ELSE EXCLUDED.email_verified END,
                name = COALESCE(EXCLUDED.name, users.name),
                updated_at = now()
            WHERE users.deleted_at IS NULL AND (
                (EXCLUDED.email IS NOT NULL AND (users.email IS DISTINCT FROM EXCLUDED.email OR users.email_verified <> EXCLUDED.email_verified))
                OR (EXCLUDED.name IS NOT NULL AND users.name IS DISTINCT FROM EXCLUDED.name)
            )
            RETURNING id, clerk_user_id, email::text AS email, email_verified, name
            """.trimIndent(),
            identity.subject, email, identity.emailVerified, identity.name,
            map = ::map,
        ) ?: findByClerkId(conn, identity.subject)!!
    }

    /** The user's id, locked for an update (a Clerk deletion), or null when we never saw them. */
    fun lockByClerkId(conn: Connection, clerkUserId: String): UUID? =
        conn.queryOne("SELECT id FROM users WHERE clerk_user_id = ? FOR UPDATE", clerkUserId) { it.uuid("id") }

    /** True when the Clerk user [clerkUserId] was deleted (and anonymised). */
    fun isDeleted(conn: Connection, clerkUserId: String): Boolean =
        conn.queryOne("SELECT deleted_at IS NOT NULL AS deleted FROM users WHERE clerk_user_id = ?", clerkUserId) { it.bool("deleted") }
            ?: false

    /** Removes personal data from a deleted user; the row stays so history keeps its references. */
    fun anonymise(conn: Connection, userId: UUID) {
        conn.update(
            "UPDATE users SET email = NULL, name = NULL, email_verified = false, deleted_at = COALESCE(deleted_at, now()), updated_at = " +
                "now() WHERE id = ?",
            userId,
        )
    }

    /** The user with [id] unless their account was deleted (anonymised). */
    fun findActiveById(conn: Connection, id: UUID): CurrentUser? = conn.queryOne(
        "SELECT id, clerk_user_id, email::text AS email, email_verified, name FROM users WHERE id = ? AND deleted_at IS NULL",
        id, map = ::map,
    )

    fun findByClerkId(conn: Connection, clerkUserId: String): CurrentUser? = conn.queryOne(
        "SELECT id, clerk_user_id, email::text AS email, email_verified, name FROM users WHERE clerk_user_id = ?",
        clerkUserId, map = ::map,
    )
}
