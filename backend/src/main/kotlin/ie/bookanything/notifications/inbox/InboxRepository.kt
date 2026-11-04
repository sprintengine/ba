package ie.bookanything.notifications.inbox

import ie.bookanything.db.UuidArray
import ie.bookanything.db.bool
import ie.bookanything.db.instant
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.int
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidOrNull
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

/** A stored notification, with the name of the business it is about. */
data class NotificationRow(
    val id: UUID,
    val userId: UUID,
    val kind: String,
    val title: String,
    val body: String?,
    val link: String,
    val businessId: UUID?,
    val businessName: String?,
    val createdAt: Instant,
    val readAt: Instant?,
    val emailedAt: Instant?,
)

/** SQL for notifications and their email preferences: per user, across businesses (no RLS; always by user_id). */
object InboxRepository {
    private const val COLUMNS = "n.id, n.user_id, n.kind, n.title, n.body, n.link, n.business_id, b.name AS business_name, n.created_at, " +
        "n.read_at, n.emailed_at"
    private const val FROM = "notifications n LEFT JOIN businesses b ON b.id = n.business_id"

    private fun map(rs: ResultSet) = NotificationRow(
        rs.uuid("id"), rs.uuid("user_id"), rs.str("kind"), rs.str("title"), rs.strOrNull("body"), rs.str("link"),
        rs.uuidOrNull("business_id"), rs.strOrNull("business_name"), rs.instant("created_at"), rs.instantOrNull("read_at"),
        rs.instantOrNull("emailed_at"),
    )

    /** Stores [n]; null when one with the same dedupe key was stored already. */
    fun insert(conn: Connection, n: NewNotification): UUID? = conn.queryOne(
        """
        INSERT INTO notifications (user_id, business_id, kind, title, body, link, entity_id, dedupe_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id
        """.trimIndent(),
        n.userId, n.businessId, n.kind.key, n.title.take(MAX_TITLE), n.body?.take(MAX_BODY), n.link, n.entityId, n.dedupeKey,
    ) { it.uuid("id") }

    fun get(conn: Connection, id: UUID): NotificationRow? = conn.queryOne("SELECT $COLUMNS FROM $FROM WHERE n.id = ?", id, map = ::map)

    fun recent(conn: Connection, userId: UUID, limit: Int): List<NotificationRow> = conn.query(
        "SELECT $COLUMNS FROM $FROM WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id LIMIT ?", userId, limit, map = ::map,
    )

    fun unreadCount(conn: Connection, userId: UUID): Int =
        conn.queryOne("SELECT count(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", userId) { it.int("n") } ?: 0

    /** Marks one of [userId]'s notifications read; false when it isn't theirs. */
    fun markRead(conn: Connection, userId: UUID, id: UUID, now: Instant): Boolean = conn.update(
        "UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND id = ?", now, userId, id,
    ) > 0

    fun markAllRead(conn: Connection, userId: UUID, now: Instant) {
        conn.update("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", now, userId)
    }

    fun markReadByKey(conn: Connection, userId: UUID, dedupeKey: String, now: Instant) {
        conn.update("UPDATE notifications SET read_at = ? WHERE user_id = ? AND dedupe_key = ? AND read_at IS NULL", now, userId, dedupeKey)
    }

    fun markEmailed(conn: Connection, id: UUID, now: Instant) {
        conn.update("UPDATE notifications SET emailed_at = ? WHERE id = ?", now, id)
    }

    /** The account email of [userId]. */
    fun email(conn: Connection, userId: UUID): String? =
        conn.queryOne("SELECT email::text AS email FROM users WHERE id = ?", userId) { it.strOrNull("email") }

    /**
     * Who on the business's team hears about a booking on [resourceIds]: active owners and admins, and staff whose own
     * resource it is on.
     */
    fun teamFor(conn: Connection, businessId: UUID, resourceIds: Collection<UUID>): List<UUID> = conn.query(
        """
        SELECT DISTINCT m.user_id FROM business_members m
        WHERE m.business_id = ? AND m.status = 'active' AND m.user_id IS NOT NULL
          AND (m.role IN ('owner', 'admin') OR EXISTS (
            SELECT 1 FROM resources r WHERE r.business_id = m.business_id AND r.member_id = m.id AND r.id = ANY(?)
          ))
        """.trimIndent(),
        businessId, UuidArray(resourceIds),
    ) { it.uuid("user_id") }

    /**
     * GDPR erasure: forgets the team's notifications that name a customer ([name], as it was before erasure): about
     * their bookings, and AI agents' changes whose summary names them.
     */
    fun forgetCustomer(conn: Connection, businessId: UUID, customerId: UUID, name: String) {
        conn.update(
            """
            DELETE FROM notifications WHERE business_id = ? AND (
                entity_id IN (SELECT id FROM bookings WHERE business_id = ? AND customer_id = ?)
                OR (kind = ? AND (strpos(title, ?) > 0 OR strpos(coalesce(body, ''), ?) > 0))
            )
            """.trimIndent(),
            businessId, businessId, customerId, InboxKind.AGENT_APPROVAL.key, name, name,
        )
    }

    /** A deleted account: its notifications and choices go with it. */
    fun forgetUser(conn: Connection, userId: UUID) {
        conn.update("DELETE FROM notifications WHERE user_id = ?", userId)
        conn.update("DELETE FROM notification_preferences WHERE user_id = ?", userId)
    }

    /** Deletes up to [batch] notifications created before [before]. */
    fun purgeOld(conn: Connection, before: Instant, batch: Int): Int = conn.update(
        "DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE created_at < ? LIMIT ?)", before, batch,
    )

    // --- Email preferences ---

    /** The kinds [userId] changed from their default: kind → emailed. */
    fun emailChoices(conn: Connection, userId: UUID): Map<String, Boolean> = conn.query(
        "SELECT kind, email FROM notification_preferences WHERE user_id = ?", userId,
    ) { it.str("kind") to it.bool("email") }.toMap()

    fun setEmail(conn: Connection, userId: UUID, kind: InboxKind, email: Boolean) {
        conn.update(
            "INSERT INTO notification_preferences (user_id, kind, email) VALUES (?, ?, ?) ON CONFLICT (user_id, kind) DO UPDATE SET email = ?",
            userId, kind.key, email, email,
        )
    }

    fun wantsEmail(conn: Connection, userId: UUID, kind: InboxKind): Boolean = emailChoices(conn, userId)[kind.key] ?: kind.emailByDefault

    private const val MAX_TITLE = 200
    private const val MAX_BODY = 500
}
