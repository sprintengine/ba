package ie.bookanything.auth

import ie.bookanything.business.AiAgentsAccess
import ie.bookanything.db.query
import ie.bookanything.db.str
import ie.bookanything.db.uuid
import java.sql.Connection
import java.util.UUID

/** A business the user is an active member of, as the business MCP and its consent screen list them. */
data class MemberBusiness(
    val id: UUID,
    val slug: String,
    val name: String,
    val role: Role,
    val aiAgents: AiAgentsAccess,
    val timezone: String = "Europe/Dublin",
) {
    /** Whether the business lets this member use it from their own AI apps. */
    val agentsAllowed: Boolean get() = aiAgents.allows(role)
}

object MemberBusinesses {
    /** The user's active memberships of businesses that aren't suspended, by name. Unscoped: it reads across businesses. */
    fun list(conn: Connection, userId: UUID): List<MemberBusiness> = conn.query(
        """
        SELECT b.id, b.slug, b.name, m.role::text AS role, b.ai_agents_access, b.timezone
        FROM business_members m JOIN businesses b ON b.id = m.business_id
        WHERE m.user_id = ? AND m.status = 'active' AND b.status <> 'suspended'
        ORDER BY lower(b.name), b.id
        """.trimIndent(),
        userId,
    ) {
        MemberBusiness(
            it.uuid("id"), it.str("slug"), it.str("name"), Role.parse(it.str("role")), AiAgentsAccess.parse(it.str("ai_agents_access")),
            it.str("timezone"),
        )
    }
}
