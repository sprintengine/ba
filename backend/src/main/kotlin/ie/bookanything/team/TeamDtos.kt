package ie.bookanything.team

import ie.bookanything.auth.Role
import kotlinx.serialization.Serializable
import java.util.UUID

@Serializable
data class TeamMemberDto(
    val id: String, val userId: String?, val name: String?, val email: String, val role: String, val status: String,
    val resourceId: String?, val createdAt: String,
)

@Serializable
data class InvitationInput(val email: String, val role: String, val resourceId: String? = null)

data class MemberRow(val id: UUID, val businessId: UUID, val userId: UUID?, val role: Role, val status: String, val email: String?)
