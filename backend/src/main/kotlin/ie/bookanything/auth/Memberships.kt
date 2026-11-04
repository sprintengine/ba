package ie.bookanything.auth

import ie.bookanything.business.BusinessRepository
import ie.bookanything.db.Db
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidList
import ie.bookanything.http.Errors
import java.sql.Connection
import java.util.UUID

/** Resolving a signed-in user's membership of a business into a [BusinessAccess]. */
object Memberships {
    data class Row(val memberId: UUID, val role: Role)

    fun find(conn: Connection, businessId: UUID, userId: UUID): Row? = conn.queryOne(
        "SELECT id, role::text AS role FROM business_members WHERE business_id = ? AND user_id = ? AND status = 'active'",
        businessId, userId,
    ) { Row(it.uuid("id"), Role.parse(it.str("role"))) }

    /**
     * Resolves access or throws: 404 when the business does not exist, is suspended or the
     * user is not a member (does not reveal membership of other tenants); 403 when the
     * role is insufficient.
     */
    suspend fun require(db: Db, user: CurrentUser, businessId: UUID, min: Role): BusinessAccess {
        val access = db.read(businessId) { conn -> access(conn, user, businessId) } ?: throw Errors.notFound("Business")
        access.requireRole(min)
        return access
    }

    /**
     * The business, the user's active membership and its linked active resources in one query; null when any is missing
     * or suspended. A deactivated resource is no longer anyone's calendar.
     */
    private fun access(conn: Connection, user: CurrentUser, businessId: UUID): BusinessAccess? = conn.queryOne(
        """
        SELECT ${BusinessRepository.COLUMNS}, m.id AS member_id, m.role::text AS member_role,
            ARRAY(SELECT r.id FROM resources r WHERE r.business_id = m.business_id AND r.member_id = m.id AND r.is_active)
                AS linked_resource_ids
        FROM businesses b JOIN business_members m ON m.business_id = b.id AND m.user_id = ? AND m.status = 'active'
        WHERE b.id = ? AND b.status <> 'suspended'
        """.trimIndent(),
        user.id, businessId,
    ) { rs ->
        BusinessAccess(
            user, BusinessRepository.map(rs), rs.uuid("member_id"), Role.parse(rs.str("member_role")),
            rs.uuidList("linked_resource_ids").toSet(),
        )
    }
}
