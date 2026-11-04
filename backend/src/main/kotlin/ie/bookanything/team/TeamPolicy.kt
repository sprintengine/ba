package ie.bookanything.team

import ie.bookanything.auth.Role
import ie.bookanything.business.Plan
import ie.bookanything.http.Errors

/** The rules for changing a team; pure, so the dashboard routes and the Clerk webhook apply the same ones. */
object TeamPolicy {
    /** Only owners may grant the owner role. */
    fun requireMayInvite(actorRole: Role, role: Role) {
        if (role == Role.OWNER && actorRole != Role.OWNER) throw Errors.forbidden("Only an owner can invite another owner.")
    }

    /** Only owners may change an owner's role or make someone an owner. */
    fun requireMayChangeRole(actorRole: Role, from: Role, to: Role) {
        if (actorRole != Role.OWNER && (from == Role.OWNER || to == Role.OWNER)) {
            throw Errors.forbidden("Only an owner can change owner roles.")
        }
    }

    fun requireMayRemove(actorRole: Role, member: Role) {
        if (member == Role.OWNER && actorRole != Role.OWNER) throw Errors.forbidden("Only an owner can remove an owner.")
    }

    /** Whether [member] is the business's only active owner (so it cannot lose them). */
    fun isLastOwner(member: MemberRow, activeOwners: Long): Boolean =
        member.role == Role.OWNER && member.status == "active" && activeOwners <= 1

    /** The plan's seat limit (Free), counting active members and pending invitations. */
    fun requireFreeSeat(plan: Plan, seats: Long) {
        val limit = plan.memberLimit ?: return
        if (seats >= limit) {
            throw Errors.planLimit("The ${plan.displayName} plan includes up to $limit team members. Upgrade to add more.")
        }
    }

    /** Whether one more member may become active (accepting an invitation counts active members only). */
    fun hasActiveSeat(plan: Plan, activeMembers: Long): Boolean = plan.memberLimit.let { it == null || activeMembers < it }
}
