package ie.bookanything.assistant

import ie.bookanything.ai.ChatBlock
import ie.bookanything.ai.ChatRole
import ie.bookanything.db.Jsonb
import ie.bookanything.db.instant
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.long
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

/**
 * What a stored message is. Only [MESSAGE], [TOOL_RESULTS] and [EVENT] are part of the model's history; the others are
 * notices shown in the chat ([notice]).
 */
enum class MessageKind(val key: String, val forModel: Boolean, val notice: NoticeKind? = null) {
    MESSAGE("message", true),
    TOOL_RESULTS("tool_results", true),

    /** A system note in the user's turn, e.g. that a proposal was confirmed. */
    EVENT("event", true),
    REFUSAL("refusal", false, NoticeKind.REFUSAL),
    TRUNCATED("truncated", false, NoticeKind.TRUNCATED),
    ERROR("error", false, NoticeKind.ERROR),
    ;

    companion object {
        fun parse(key: String) = entries.first { it.key == key }

        /** How a notice of [kind] is stored. */
        fun of(kind: NoticeKind) = entries.first { it.notice == kind }
    }
}

data class ThreadRow(
    val id: UUID, val userId: UUID, val title: String, val contextHash: String?, val createdAt: Instant, val updatedAt: Instant,
    /** A turn is running until then (see [ConversationRepository.claim]). */
    val busyUntil: Instant? = null,
)

data class StoredMessage(
    val id: UUID, val seq: Long, val role: ChatRole, val kind: MessageKind, val blocks: List<ChatBlock>, val createdAt: Instant,
)

/** SQL for assistant threads and messages. Callers hold the (tenant-scoped) transaction. */
object ConversationRepository {
    private val json = Json { classDiscriminator = "type" }
    private val blocks = ListSerializer(serializer<ChatBlock>())

    private fun thread(rs: ResultSet) = ThreadRow(
        rs.uuid("id"), rs.uuid("user_id"), rs.str("title"), rs.strOrNull("context_hash"), rs.instant("created_at"),
        rs.instant("updated_at"), rs.instantOrNull("busy_until"),
    )

    private fun message(rs: ResultSet) = StoredMessage(
        rs.uuid("id"), rs.long("seq"), if (rs.str("role") == "user") ChatRole.USER else ChatRole.ASSISTANT,
        MessageKind.parse(rs.str("kind")),
        json.decodeFromString(blocks, rs.str("content")), rs.instant("created_at"),
    )

    fun createThread(conn: Connection, businessId: UUID, userId: UUID, title: String, now: Instant): ThreadRow = conn.queryOne(
        "INSERT INTO assistant_threads (business_id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING *",
        businessId, userId, title, now, now, map = ::thread,
    )!!

    fun threads(conn: Connection, businessId: UUID, userId: UUID, limit: Int): List<ThreadRow> = conn.query(
        "SELECT * FROM assistant_threads WHERE business_id = ? AND user_id = ? ORDER BY updated_at DESC, id LIMIT ?",
        businessId, userId, limit, map = ::thread,
    )

    fun thread(conn: Connection, businessId: UUID, id: UUID): ThreadRow? =
        conn.queryOne("SELECT * FROM assistant_threads WHERE business_id = ? AND id = ?", businessId, id, map = ::thread)

    fun deleteThread(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("DELETE FROM assistant_threads WHERE business_id = ? AND id = ?", businessId, id)
    }

    /**
     * Marks the thread busy until [until]; false when another turn is still running. [until] is also the claim's token:
     * [extend] and [release] only act while the thread still holds it, so a turn never frees or prolongs another's claim.
     */
    fun claim(conn: Connection, businessId: UUID, id: UUID, now: Instant, until: Instant): Boolean = conn.update(
        "UPDATE assistant_threads SET busy_until = ? WHERE business_id = ? AND id = ? AND (busy_until IS NULL OR busy_until < ?)",
        until, businessId, id, now,
    ) > 0

    /** Moves the claim [held] on to [until]; false when it was lost (it ran out and another turn claimed the thread). */
    fun extend(conn: Connection, businessId: UUID, id: UUID, held: Instant, until: Instant): Boolean = conn.update(
        "UPDATE assistant_threads SET busy_until = ? WHERE business_id = ? AND id = ? AND busy_until = ?", until, businessId, id, held,
    ) > 0

    /** Frees the thread if [held] is still its claim. */
    fun release(conn: Connection, businessId: UUID, id: UUID, held: Instant) {
        conn.update(
            "UPDATE assistant_threads SET busy_until = NULL WHERE business_id = ? AND id = ? AND busy_until = ?", businessId, id, held,
        )
    }

    fun touch(conn: Connection, businessId: UUID, id: UUID, title: String?, contextHash: String?, now: Instant) {
        conn.update(
            "UPDATE assistant_threads SET title = COALESCE(?, title), context_hash = COALESCE(?, context_hash), updated_at = ? WHERE " +
                "business_id = ? AND id = ?",
            title, contextHash, now, businessId, id,
        )
    }

    fun append(
        conn: Connection, businessId: UUID, threadId: UUID, role: ChatRole, kind: MessageKind, content: List<ChatBlock>, now: Instant,
    ): StoredMessage =
        conn.queryOne(
            """
            INSERT INTO assistant_messages (business_id, thread_id, role, kind, content, created_at) VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id, seq, role, kind, content::text AS content, created_at
            """.trimIndent(),
            businessId, threadId, role.name.lowercase(), kind.key, Jsonb(json.encodeToString(blocks, content)), now, map = ::message,
        )!!

    fun messages(conn: Connection, businessId: UUID, threadId: UUID): List<StoredMessage> = messagesFrom(conn, businessId, threadId, 0)

    /** Every message of the thread without its content (to choose the model's [Window] before loading any). */
    fun heads(conn: Connection, businessId: UUID, threadId: UUID): List<MessageHead> = conn.query(
        "SELECT seq, role, kind FROM assistant_messages WHERE business_id = ? AND thread_id = ? ORDER BY seq", businessId, threadId,
    ) {
        MessageHead(
            it.long("seq"),
            if (it.str("role") ==
                "user"
            ) {
                ChatRole.USER
            } else {
                ChatRole.ASSISTANT
            },
            MessageKind.parse(it.str("kind")),
        )
    }

    /** The thread's messages from [seq] on (a turn's, or the model's window), not the whole thread. */
    fun messagesFrom(conn: Connection, businessId: UUID, threadId: UUID, seq: Long): List<StoredMessage> = conn.query(
        "SELECT id, seq, role, kind, content::text AS content, created_at FROM assistant_messages WHERE business_id = ? AND thread_id = " +
            "? AND seq >= ? ORDER BY seq",
        businessId, threadId, seq, map = ::message,
    )
}
