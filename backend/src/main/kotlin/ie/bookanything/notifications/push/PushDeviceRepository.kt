package ie.bookanything.notifications.push

import ie.bookanything.db.exists
import ie.bookanything.db.instant
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

/** A phone the person gets push notifications on. */
data class PushDeviceRow(
    val id: UUID,
    val token: String,
    val platform: String,
    val appVariant: String,
    val createdAt: Instant,
    val lastSeenAt: Instant,
)

/** Why a device stopped getting notifications (`push_devices.revoked_reason`). */
enum class PushRevokeReason(val key: String) {
    /** The person signed out on it. */
    SIGNED_OUT("signed_out"),

    /** Expo said the app is gone (uninstalled, or its token expired). */
    NOT_REGISTERED("not_registered"),

    /** The person has more than [PushDeviceRepository.MAX_ACTIVE] phones: the one seen longest ago goes. */
    REPLACED("replaced"),
}

/** SQL for push devices: per user, never about a business (no RLS; always by user_id or the token). */
object PushDeviceRepository {
    /** Phones per person that get notifications. */
    const val MAX_ACTIVE = 20

    private const val COLUMNS = "id, token, platform, app_variant, created_at, last_seen_at"

    private fun map(rs: ResultSet) = PushDeviceRow(
        rs.uuid("id"), rs.str("token"), rs.str("platform"), rs.str("app_variant"), rs.instant("created_at"), rs.instant("last_seen_at"),
    )

    /**
     * Registers [token] for [userId], or refreshes it: a token already known is theirs from now on (whoever signed in on
     * that phone last) and gets notifications again. Beyond [MAX_ACTIVE] phones, the ones seen longest ago are revoked.
     */
    fun register(conn: Connection, userId: UUID, token: String, platform: String, appVariant: String, now: Instant): PushDeviceRow {
        val row = conn.queryOne(
            """
            INSERT INTO push_devices (user_id, token, platform, app_variant, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (token) DO UPDATE SET
                created_at = CASE WHEN push_devices.user_id = EXCLUDED.user_id THEN push_devices.created_at ELSE EXCLUDED.created_at END,
                user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, app_variant = EXCLUDED.app_variant,
                last_seen_at = EXCLUDED.last_seen_at, revoked_at = NULL, revoked_reason = NULL
            RETURNING $COLUMNS
            """.trimIndent(),
            userId, token, platform, appVariant, now, now,
            map = ::map,
        )!!
        conn.update(
            """
            UPDATE push_devices SET revoked_at = ?, revoked_reason = ? WHERE id IN (
                SELECT id FROM push_devices WHERE user_id = ? AND revoked_at IS NULL AND id <> ?
                ORDER BY last_seen_at DESC, created_at DESC, id OFFSET ?
            )
            """.trimIndent(),
            now, PushRevokeReason.REPLACED.key, userId, row.id, MAX_ACTIVE - 1,
        )
        return row
    }

    /** Stops notifications to [token] if it is [userId]'s (signing out there); someone else's is left alone. */
    fun unregister(conn: Connection, userId: UUID, token: String, now: Instant) {
        conn.update(
            "UPDATE push_devices SET revoked_at = ?, revoked_reason = ? WHERE token = ? AND user_id = ? AND revoked_at IS NULL",
            now, PushRevokeReason.SIGNED_OUT.key, token, userId,
        )
    }

    /**
     * Revokes device [id] unless it registered again after [sentAt] (a fresh token, perhaps someone else's now): Expo's
     * answer was about what we sent before.
     */
    fun revoke(conn: Connection, id: UUID, reason: PushRevokeReason, sentAt: Instant, now: Instant): Boolean = conn.update(
        "UPDATE push_devices SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL AND last_seen_at <= ?",
        now, reason.key, id, sentAt,
    ) > 0

    /** [userId]'s phones that get notifications, oldest first. */
    fun active(conn: Connection, userId: UUID): List<PushDeviceRow> = conn.query(
        "SELECT $COLUMNS FROM push_devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at, id", userId, map = ::map,
    )

    fun hasActive(conn: Connection, userId: UUID): Boolean =
        conn.exists("SELECT 1 FROM push_devices WHERE user_id = ? AND revoked_at IS NULL", userId)

    /** A deleted account: its phones go with it. */
    fun forgetUser(conn: Connection, userId: UUID) {
        conn.update("DELETE FROM push_devices WHERE user_id = ?", userId)
    }

    /** Deletes up to [batch] devices revoked before [revokedBefore] or not seen since [unseenSince]. */
    fun purgeStale(conn: Connection, revokedBefore: Instant, unseenSince: Instant, batch: Int): Int = conn.update(
        "DELETE FROM push_devices WHERE id IN (SELECT id FROM push_devices WHERE revoked_at < ? OR last_seen_at < ? LIMIT ?)",
        revokedBefore, unseenSince, batch,
    )
}
