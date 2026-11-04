package ie.bookanything.assistant.actions

import ie.bookanything.assistant.tools.ActionResult
import ie.bookanything.assistant.tools.Proposal
import ie.bookanything.db.Jsonb
import ie.bookanything.db.StoredJson
import ie.bookanything.db.bool
import ie.bookanything.db.instant
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidOrNull
import ie.bookanything.http.ApiJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.serializer
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

/** SQL for pending and decided actions. */
object ActionRepository {
    private fun map(rs: ResultSet) = ActionRow(
        rs.uuid("id"), rs.uuidOrNull("thread_id"), rs.uuid("user_id"), rs.str("tool"), rs.strOrNull("tool_use_id"),
        StoredJson.decodeFromString(JsonObject.serializer(), rs.str("input")),
        StoredJson.decodeFromString(serializer<Proposal>(), rs.str("preview")),
        ActionStatus.parse(rs.str("status")),
        rs.strOrNull("result")?.let { StoredJson.decodeFromString(serializer<ActionResult>(), it) },
        rs.strOrNull("error"), rs.instant("expires_at"), rs.instant("created_at"), rs.instantOrNull("decided_at"),
        rs.uuidOrNull("oauth_grant_id"), rs.bool("needs_approval"),
        rs.strOrNull("app_client_id")?.let { ActionApp(it, rs.str("app_name"), rs.bool("app_revoked")) },
    )

    private const val COLUMNS = "a.id, a.thread_id, a.user_id, a.tool, a.tool_use_id, a.input::text AS input, " +
        "a.preview::text AS preview, a.status, a.result::text AS result, a.error, a.expires_at, a.created_at, a.decided_at, " +
        "a.oauth_grant_id, a.needs_approval, " +
        // The app behind an app's proposal (the oauth tables are not tenant-scoped).
        "g.client_id AS app_client_id, c.client_name AS app_name, g.revoked_at IS NOT NULL AS app_revoked"

    private const val FROM = "assistant_actions a LEFT JOIN oauth_grants g ON g.id = a.oauth_grant_id " +
        "LEFT JOIN oauth_clients c ON c.client_id = g.client_id"

    fun insert(conn: Connection, businessId: UUID, action: NewAction, now: Instant): ActionRow {
        val id = conn.queryOne(
            """
        INSERT INTO assistant_actions (business_id, thread_id, user_id, tool, tool_use_id, input, preview, status, expires_at, created_at,
            oauth_grant_id, needs_approval)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?) RETURNING id
            """.trimIndent(),
            businessId, action.threadId, action.userId, action.tool, action.toolUseId, Jsonb(action.input),
            Jsonb(ApiJson.encodeToString(serializer<Proposal>(), action.proposal)), action.expiresAt, now, action.oauthGrantId,
            action.needsApproval,
        ) { it.uuid("id") }!!
        return get(conn, businessId, id)!!
    }

    fun get(conn: Connection, businessId: UUID, id: UUID, forUpdate: Boolean = false): ActionRow? = conn.queryOne(
        "SELECT $COLUMNS FROM $FROM WHERE a.business_id = ? AND a.id = ?${if (forUpdate) " FOR UPDATE OF a" else ""}", businessId, id,
        map = ::map,
    )

    /** The member's apps' proposals here from the last [days] days, newest first. */
    fun forMemberApps(conn: Connection, businessId: UUID, userId: UUID, since: Instant, limit: Int): List<ActionRow> = conn.query(
        """
        SELECT $COLUMNS FROM $FROM
        WHERE a.business_id = ? AND a.user_id = ? AND a.oauth_grant_id IS NOT NULL AND a.created_at >= ?
        ORDER BY a.created_at DESC, a.id LIMIT ?
        """.trimIndent(),
        businessId, userId, since, limit,
        map = ::map,
    )

    /**
     * From now on the member must approve [id] on bookanything (the business's rules changed since it was proposed), until
     * [expiresAt].
     */
    fun requireApproval(conn: Connection, businessId: UUID, id: UUID, expiresAt: Instant) {
        conn.update(
            "UPDATE assistant_actions SET needs_approval = true, expires_at = ? WHERE business_id = ? AND id = ?",
            expiresAt, businessId, id,
        )
    }

    /** The preview of [id], prepared again. */
    fun updatePreview(conn: Connection, businessId: UUID, id: UUID, proposal: Proposal) {
        conn.update(
            "UPDATE assistant_actions SET preview = ? WHERE business_id = ? AND id = ?",
            Jsonb(ApiJson.encodeToString(serializer<Proposal>(), proposal)), businessId, id,
        )
    }

    /**
     * Which business a connected app's proposal is in, found across businesses (unscoped: the app names only the
     * proposal); null unless [grantId] made it.
     */
    fun businessOfGrantAction(conn: Connection, id: UUID, grantId: UUID): UUID? = conn.queryOne(
        "SELECT business_id FROM assistant_actions WHERE id = ? AND oauth_grant_id = ?", id, grantId,
    ) { it.uuid("business_id") }

    fun forThread(conn: Connection, businessId: UUID, threadId: UUID): List<ActionRow> = conn.query(
        "SELECT $COLUMNS FROM $FROM WHERE a.business_id = ? AND a.thread_id = ? ORDER BY a.created_at, a.id", businessId, threadId,
        map = ::map,
    )

    fun decide(conn: Connection, businessId: UUID, id: UUID, status: ActionStatus, result: ActionResult?, error: String?, now: Instant) {
        conn.update(
            "UPDATE assistant_actions SET status = ?, result = ?, error = ?, decided_at = ? WHERE business_id = ? AND id = ?",
            status.key, result?.let { Jsonb(ApiJson.encodeToString(serializer<ActionResult>(), it)) }, error, now, businessId, id,
        )
    }
}
