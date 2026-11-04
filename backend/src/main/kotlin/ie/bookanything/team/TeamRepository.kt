package ie.bookanything.team

import ie.bookanything.auth.Role
import ie.bookanything.db.count
import ie.bookanything.db.exists
import ie.bookanything.db.instant
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidOrNull
import ie.bookanything.http.Errors
import ie.bookanything.http.formatInstant
import java.sql.Connection
import java.sql.ResultSet
import java.time.ZoneId
import java.util.UUID

/** Business members and invitations (`business_members`), and the resource a member is linked to. */
object TeamRepository {
    fun list(conn: Connection, businessId: UUID, zone: ZoneId): List<TeamMemberDto> = conn.query(
        """
        SELECT m.id, m.user_id, u.name, COALESCE(u.email, m.invited_email)::text AS email, m.role::text AS role, m.status::text AS status,
            (SELECT r.id FROM resources r WHERE r.business_id = m.business_id AND r.member_id = m.id ORDER BY r.sort_order LIMIT 1) AS resource_id,
            m.created_at
        FROM business_members m LEFT JOIN users u ON u.id = m.user_id
        WHERE m.business_id = ? AND m.status <> 'removed'
        ORDER BY m.role, m.created_at
        """.trimIndent(),
        businessId,
    ) {
        TeamMemberDto(
            it.uuid("id").toString(), it.uuidOrNull("user_id")?.toString(), it.strOrNull("name"), it.strOrNull("email").orEmpty(),
            it.str("role"), it.str("status"), it.uuidOrNull("resource_id")?.toString(), formatInstant(it.instant("created_at"), zone),
        )
    }

    /** One member as the team list shows it. */
    fun dto(conn: Connection, businessId: UUID, zone: ZoneId, id: UUID): TeamMemberDto =
        list(conn, businessId, zone).first { it.id == id.toString() }

    fun get(conn: Connection, businessId: UUID, id: UUID): MemberRow? = conn.queryOne(
        """
        SELECT m.id, m.business_id, m.user_id, m.role::text AS role, m.status::text AS status, COALESCE(u.email, m.invited_email)::text AS email
        FROM business_members m LEFT JOIN users u ON u.id = m.user_id WHERE m.business_id = ? AND m.id = ?
        """.trimIndent(),
        businessId, id,
        map = ::memberRow,
    )

    /** Pending invitations for a verified email (used by /v1/me). */
    fun pendingInvitationsFor(conn: Connection, email: String): List<MemberRow> = conn.query(
        """
        SELECT m.id, m.business_id, m.user_id, m.role::text AS role, m.status::text AS status, m.invited_email::text AS email
        FROM business_members m JOIN businesses b ON b.id = m.business_id
        WHERE m.status = 'invited' AND m.invited_email::text = ? AND b.status <> 'suspended'
        ORDER BY m.created_at
        """.trimIndent(),
        email,
        map = ::memberRow,
    )

    fun invitationByTokenHash(conn: Connection, tokenHash: String): MemberRow? = conn.queryOne(
        """
        SELECT m.id, m.business_id, m.user_id, m.role::text AS role, m.status::text AS status, m.invited_email::text AS email
        FROM business_members m WHERE m.invite_token_hash = ? AND m.status = 'invited'
        """.trimIndent(),
        tokenHash,
        map = ::memberRow,
    )

    /** [userId]'s active membership rows, as (member id, business id). */
    fun activeMembershipsOf(conn: Connection, userId: UUID): List<Pair<UUID, UUID>> = conn.query(
        "SELECT id, business_id FROM business_members WHERE user_id = ? AND status = 'active' ORDER BY id", userId,
    ) { it.uuid("id") to it.uuid("business_id") }

    /** The status of [userId]'s membership row at [businessId], if any (`active`, `invited` or `removed`). */
    fun membershipStatus(conn: Connection, businessId: UUID, userId: UUID): String? = conn.queryOne(
        "SELECT status::text AS status FROM business_members WHERE business_id = ? AND user_id = ?", businessId, userId,
    ) { it.str("status") }

    /** Whether [email] already belongs to a member or a pending invitation. */
    fun hasMemberOrInvitation(conn: Connection, businessId: UUID, email: String): Boolean = conn.exists(
        """
        SELECT 1 FROM business_members m LEFT JOIN users u ON u.id = m.user_id
        WHERE m.business_id = ? AND m.status <> 'removed' AND (m.invited_email = ? OR u.email = ?)
        """.trimIndent(),
        businessId, email, email,
    )

    fun activeCount(conn: Connection, businessId: UUID): Long =
        conn.count("SELECT count(*) FROM business_members WHERE business_id = ? AND status = 'active'", businessId)

    /** Active members plus pending invitations: the seats a plan limit counts when inviting. */
    fun seatCount(conn: Connection, businessId: UUID): Long =
        conn.count("SELECT count(*) FROM business_members WHERE business_id = ? AND status IN ('active', 'invited')", businessId)

    /**
     * The active owners, counted with their rows locked (in id order) until the transaction ends. "Is this the last
     * owner?" is then answered after any concurrent owner change has committed: with a plain count two owners demoting
     * or removing each other at once both saw two owners and left the business with none.
     */
    fun ownerCount(conn: Connection, businessId: UUID): Long = conn.query(
        "SELECT id FROM business_members WHERE business_id = ? AND status = 'active' AND role = 'owner' ORDER BY id FOR UPDATE",
        businessId,
    ) { 1 }.size.toLong()

    fun insertInvitation(conn: Connection, businessId: UUID, id: UUID, role: Role, email: String, tokenHash: String) {
        conn.update(
            "INSERT INTO business_members (id, business_id, role, invited_email, invite_token_hash, status) VALUES (?, ?, " +
                "?::member_role, ?, ?, 'invited')",
            id, businessId, role.value, email, tokenHash,
        )
    }

    fun activate(conn: Connection, memberId: UUID, userId: UUID) {
        conn.update(
            "UPDATE business_members SET user_id = ?, status = 'active', invite_token_hash = NULL, updated_at = now() WHERE id = ?",
            userId, memberId,
        )
    }

    /** Forgets [userId]'s earlier, removed membership, so an invitation can make them a member again. */
    fun deleteRemoved(conn: Connection, businessId: UUID, userId: UUID) {
        conn.update("DELETE FROM business_members WHERE business_id = ? AND user_id = ? AND status = 'removed'", businessId, userId)
    }

    fun setRole(conn: Connection, memberId: UUID, role: Role) {
        conn.update("UPDATE business_members SET role = ?::member_role, updated_at = now() WHERE id = ?", role.value, memberId)
    }

    /** Marks a member or invitation removed (the token stops working). */
    fun markRemoved(conn: Connection, memberId: UUID) {
        conn.update("UPDATE business_members SET status = 'removed', invite_token_hash = NULL, updated_at = now() WHERE id = ?", memberId)
    }

    /** Links [memberId] to [resourceId] (their calendar), or unlinks them when null. */
    fun linkResource(conn: Connection, businessId: UUID, memberId: UUID, resourceId: UUID?) {
        conn.update(
            "UPDATE resources SET member_id = NULL, updated_at = now() WHERE business_id = ? AND member_id = ?", businessId, memberId,
        )
        if (resourceId != null) {
            val n = conn.update(
                "UPDATE resources SET member_id = ?, updated_at = now() WHERE business_id = ? AND id = ?", memberId, businessId, resourceId,
            )
            if (n == 0) throw Errors.field("resourceId", "Unknown resource")
        }
    }

    /** Unlinks a removed member from their resources (without touching `updated_at`, as removal always did). */
    fun unlinkResources(conn: Connection, businessId: UUID, memberId: UUID) {
        conn.update("UPDATE resources SET member_id = NULL WHERE business_id = ? AND member_id = ?", businessId, memberId)
    }

    /** [userId]'s active memberships with their roles, locked for removal. */
    fun activeMembershipsForUpdate(conn: Connection, userId: UUID): List<Pair<UUID, Role>> = conn.query(
        "SELECT business_id, role::text AS role FROM business_members WHERE user_id = ? AND status = 'active' FOR UPDATE",
        userId,
    ) { it.uuid("business_id") to Role.parse(it.str("role")) }

    fun markRemovedByUser(conn: Connection, businessId: UUID, userId: UUID) {
        conn.update(
            "UPDATE business_members SET status = 'removed', updated_at = now() WHERE business_id = ? AND user_id = ?", businessId, userId,
        )
    }

    private fun memberRow(rs: ResultSet) = MemberRow(
        rs.uuid("id"), rs.uuid("business_id"), rs.uuidOrNull("user_id"), Role.parse(rs.str("role")), rs.str("status"),
        rs.strOrNull("email"),
    )
}
