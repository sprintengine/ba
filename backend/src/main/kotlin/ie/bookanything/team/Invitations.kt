package ie.bookanything.team

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.CurrentUser
import ie.bookanything.auth.TokenService
import ie.bookanything.business.BusinessRepository
import ie.bookanything.http.Errors
import java.security.MessageDigest
import java.sql.Connection
import java.util.UUID

/** Accepting team invitations, by verified email (on `/v1/me`) or by token (`POST /v1/invitations/{token}/accept`). */
object Invitations {
    /** Pending invitations for a verified email (used by /v1/me). */
    fun pendingFor(conn: Connection, email: String): List<MemberRow> = TeamRepository.pendingInvitationsFor(conn, email)

    /**
     * Accepts the invitation behind [token] for [user] (strictly, see [accept]) and returns its business. A token
     * the user has already joined through answers the same: `/v1/me` accepts invitations for a verified email at
     * sign-in, usually before the emailed link is opened. The member row keeps the invitation's id, so the token
     * still derives from it. Anyone else's used, withdrawn or unknown token is 404.
     */
    fun acceptByToken(conn: Connection, tokens: TokenService, token: String, user: CurrentUser): UUID {
        TeamRepository.invitationByTokenHash(conn, TokenService.hash(token))?.let { invite ->
            accept(conn, invite, user, strict = true)
            return invite.businessId
        }
        val given = token.toByteArray(Charsets.UTF_8)
        return TeamRepository.activeMembershipsOf(conn, user.id)
            .firstOrNull { (memberId, _) -> MessageDigest.isEqual(tokens.inviteToken(memberId).toByteArray(Charsets.UTF_8), given) }
            ?.second
            ?: throw Errors.notFound("Invitation")
    }

    /**
     * Accepts an invitation for [user]. Returns false (leaving it pending) when the plan's member limit is reached, or
     * (dropping it) when the user is already a member; with [strict] both are errors instead.
     */
    fun accept(conn: Connection, invite: MemberRow, user: CurrentUser, strict: Boolean): Boolean {
        val business = BusinessRepository.findById(conn, invite.businessId) ?: throw Errors.notFound("Invitation")
        val existing = TeamRepository.membershipStatus(conn, invite.businessId, user.id)
        if (existing == "active") {
            if (strict) throw Errors.conflict("You are already a member of ${business.name}.")
            TeamRepository.markRemoved(conn, invite.id)
            return false
        }
        // Acceptances at once count one after another (a team can hold more invitations than seats after a downgrade).
        if (business.plan.memberLimit != null) BusinessRepository.lockSeats(conn, business.id)
        if (!TeamPolicy.hasActiveSeat(business.plan, TeamRepository.activeCount(conn, business.id))) {
            if (strict) throw Errors.planLimit("${business.name} has reached its team member limit on the Free plan.")
            return false
        }
        if (existing == "removed") TeamRepository.deleteRemoved(conn, business.id, user.id)
        TeamRepository.activate(conn, invite.id, user.id)
        Audit.record(
            conn, business.id, Actor.member(invite.role, user.id), "team.invitation_accepted", "member", invite.id,
            mapOf("role" to invite.role.value),
        )
        return true
    }
}
