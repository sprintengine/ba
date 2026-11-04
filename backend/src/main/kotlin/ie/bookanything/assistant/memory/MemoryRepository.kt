package ie.bookanything.assistant.memory

import ie.bookanything.db.count
import ie.bookanything.db.instant
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

/** SQL for business memory entries. */
object MemoryRepository {
    private fun map(rs: ResultSet) = MemoryRow(
        rs.uuid("id"), rs.str("text"), rs.strOrNull("created_by"), rs.instant("created_at"), rs.instant("updated_at"),
    )

    private const val SELECT = "SELECT m.id, m.text, u.name AS created_by, m.created_at, m.updated_at FROM assistant_memory m LEFT JOIN " +
        "users u ON u.id = m.created_by_user_id"

    fun list(conn: Connection, businessId: UUID): List<MemoryRow> =
        conn.query("$SELECT WHERE m.business_id = ? ORDER BY m.created_at, m.id", businessId, map = ::map)

    fun get(conn: Connection, businessId: UUID, id: UUID): MemoryRow? =
        conn.queryOne("$SELECT WHERE m.business_id = ? AND m.id = ?", businessId, id, map = ::map)

    fun count(conn: Connection, businessId: UUID): Int = conn.count(
        "SELECT count(*) FROM assistant_memory WHERE business_id = ?", businessId,
    ).toInt()

    fun insert(conn: Connection, businessId: UUID, text: String, userId: UUID?, now: Instant): UUID = conn.queryOne(
        "INSERT INTO assistant_memory (business_id, text, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
        businessId, text, userId, now, now,
    ) { it.uuid("id") }!!

    fun update(conn: Connection, businessId: UUID, id: UUID, text: String, now: Instant): Boolean =
        conn.update("UPDATE assistant_memory SET text = ?, updated_at = ? WHERE business_id = ? AND id = ?", text, now, businessId, id) > 0

    fun delete(conn: Connection, businessId: UUID, id: UUID): Boolean =
        conn.update("DELETE FROM assistant_memory WHERE business_id = ? AND id = ?", businessId, id) > 0
}
