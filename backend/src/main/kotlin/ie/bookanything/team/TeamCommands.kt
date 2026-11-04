package ie.bookanything.team

import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.Role
import ie.bookanything.auth.TokenService
import ie.bookanything.business.BusinessRepository
import ie.bookanything.db.constraintName
import ie.bookanything.http.Errors
import ie.bookanything.http.Patch
import ie.bookanything.http.Validator
import ie.bookanything.http.parseUuid
import ie.bookanything.notifications.Notify
import java.sql.Connection
import java.sql.SQLException
import java.util.UUID

/**
 * Inviting, changing and removing team members. Each runs in the caller's (tenant-scoped) transaction, applies
 * [TeamPolicy] and records the audit event as the acting member.
 */
class TeamCommands(private val tokens: TokenService) {
    fun invite(conn: Connection, access: BusinessAccess, input: InvitationInput): TeamMemberDto {
        val v = Validator()
        val email = v.email(input.email, "email", required = true)?.lowercase()
        val role = v.oneOf(input.role, "role", Role.VALUES) { Role.parse(it) }
        val resourceId = v.uuid(input.resourceId, "resourceId")
        v.throwIfInvalid()
        TeamPolicy.requireMayInvite(access.role, role!!)
        val b = access.business
        // Invitations sent at once count one after another: each counting first, they all saw the last seat free.
        if (b.plan.memberLimit != null) BusinessRepository.lockSeats(conn, b.id)
        if (TeamRepository.hasMemberOrInvitation(conn, b.id, email!!)) throw alreadyInvited(email)
        TeamPolicy.requireFreeSeat(b.plan, TeamRepository.seatCount(conn, b.id))
        val id = UUID.randomUUID()
        try {
            TeamRepository.insertInvitation(conn, b.id, id, role, email, TokenService.hash(tokens.inviteToken(id)))
        } catch (e: SQLException) {
            // An invitation for the address committed since the check above (sent twice at once): the same answer.
            if (e.constraintName() == PENDING_INVITATION_UNIQUE) throw alreadyInvited(email)
            throw e
        }
        resourceId?.let { TeamRepository.linkResource(conn, b.id, id, it) }
        Notify.invitation(conn, b.id, id, email, access.user.name)
        Audit.record(conn, b.id, access.actor, "team.invited", "member", id, mapOf("email" to email, "role" to role.value))
        return TeamRepository.dto(conn, b.id, b.zone, id)
    }

    private fun alreadyInvited(email: String) = Errors.conflict("$email is already a member or has a pending invitation.")

    /** `PATCH /team/{memberId}`: `role` and/or `resourceId`. */
    fun update(conn: Connection, access: BusinessAccess, id: UUID, patch: Patch): TeamMemberDto {
        val member = current(conn, access, id)
        if (patch.has("role")) {
            val raw = patch.requiredString("role", member.role.value)
            if (raw !in Role.VALUES) throw Errors.field("role", "Must be owner, admin or staff")
            val role = Role.parse(raw)
            TeamPolicy.requireMayChangeRole(access.role, member.role, role)
            if (role != Role.OWNER && TeamPolicy.isLastOwner(member, TeamRepository.ownerCount(conn, access.businessId))) {
                throw Errors.policy("A business needs at least one owner.")
            }
            TeamRepository.setRole(conn, id, role)
        }
        if (patch.has("resourceId")) {
            val raw = patch.string("resourceId", null)
            TeamRepository.linkResource(conn, access.businessId, id, raw?.let { parseUuid(it, "resourceId") })
        }
        Audit.record(conn, access.businessId, access.actor, "team.updated", "member", id, mapOf("fields" to patch.keys.toList()))
        return TeamRepository.dto(conn, access.businessId, access.business.zone, id)
    }

    fun remove(conn: Connection, access: BusinessAccess, id: UUID) {
        val member = current(conn, access, id)
        TeamPolicy.requireMayRemove(access.role, member.role)
        if (TeamPolicy.isLastOwner(member, TeamRepository.ownerCount(conn, access.businessId))) {
            throw Errors.policy("You can't remove the last owner.")
        }
        TeamRepository.markRemoved(conn, id)
        TeamRepository.unlinkResources(conn, access.businessId, id)
        Audit.record(conn, access.businessId, access.actor, "team.removed", "member", id, mapOf("email" to member.email))
    }

    private fun current(conn: Connection, access: BusinessAccess, id: UUID): MemberRow =
        TeamRepository.get(conn, access.businessId, id)?.takeIf { it.status != "removed" } ?: throw Errors.notFound("Team member")
}

/** One pending invitation per address and business (changeset 0024). */
private const val PENDING_INVITATION_UNIQUE = "business_members_pending_invitation_uq"
