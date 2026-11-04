package ie.bookanything.resources

import ie.bookanything.db.bool
import ie.bookanything.db.exists
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
import java.util.UUID

object ResourceRepository {
    private const val COLS = "id, kind::text AS kind, name, description, color, capacity, member_id, is_active, sort_order"

    fun map(rs: ResultSet) = ResourceDto(
        id = rs.uuid("id").toString(), kind = rs.str("kind"), name = rs.str("name"), description = rs.strOrNull("description"),
        color = rs.str("color"), capacity = rs.int("capacity"), memberId = rs.uuidOrNull("member_id")?.toString(),
        isActive = rs.bool("is_active"), sortOrder = rs.int("sort_order"),
    )

    fun list(conn: Connection, businessId: UUID): List<ResourceDto> =
        conn.query("SELECT $COLS FROM resources WHERE business_id = ? ORDER BY sort_order, name, id", businessId, map = ::map)

    fun get(conn: Connection, businessId: UUID, id: UUID): ResourceDto? =
        conn.queryOne("SELECT $COLS FROM resources WHERE business_id = ? AND id = ?", businessId, id, map = ::map)

    fun insert(conn: Connection, businessId: UUID, r: ResourceInput, memberId: UUID?): ResourceDto = conn.queryOne(
        """
        INSERT INTO resources (business_id, kind, name, description, color, capacity, member_id, is_active, sort_order)
        VALUES (?, ?::resource_kind, ?, ?, ?, ?, ?, ?, ?) RETURNING $COLS
        """.trimIndent(),
        businessId, r.kind, r.name, r.description, r.color, r.capacity, memberId, r.isActive, r.sortOrder, map = ::map,
    )!!

    fun update(conn: Connection, businessId: UUID, id: UUID, r: ResourceInput, memberId: UUID?): ResourceDto? = conn.queryOne(
        """
        UPDATE resources SET kind = ?::resource_kind, name = ?, description = ?, color = ?, capacity = ?, member_id = ?,
            is_active = ?, sort_order = ?, updated_at = now()
        WHERE business_id = ? AND id = ? RETURNING $COLS
        """.trimIndent(),
        r.kind, r.name, r.description, r.color, r.capacity, memberId, r.isActive, r.sortOrder, businessId, id, map = ::map,
    )

    fun validMember(conn: Connection, businessId: UUID, memberId: UUID): Boolean =
        conn.exists("SELECT 1 FROM business_members WHERE business_id = ? AND id = ? AND status <> 'removed'", businessId, memberId)

    fun anyActive(conn: Connection, businessId: UUID): Boolean =
        conn.exists("SELECT 1 FROM resources WHERE business_id = ? AND is_active", businessId)

    /** Whether any booking (past or present) was allocated to the resource. */
    fun hasAllocations(conn: Connection, businessId: UUID, id: UUID): Boolean =
        conn.exists("SELECT 1 FROM booking_allocations WHERE business_id = ? AND resource_id = ?", businessId, id)

    fun deactivate(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("UPDATE resources SET is_active = false, updated_at = now() WHERE business_id = ? AND id = ?", businessId, id)
    }

    fun delete(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("DELETE FROM resources WHERE business_id = ? AND id = ?", businessId, id)
    }
}
