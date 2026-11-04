package ie.bookanything.auth

import ie.bookanything.audit.Actor
import ie.bookanything.business.BusinessRow
import ie.bookanything.http.Errors
import java.util.UUID

/** The signed-in user's access to one business, resolved per request. */
data class BusinessAccess(
    val user: CurrentUser,
    val business: BusinessRow,
    val memberId: UUID,
    val role: Role,
    /** Resources linked to this member (resources.member_id). */
    val linkedResourceIds: Set<UUID>,
) {
    val businessId: UUID get() = business.id
    val isStaffOnly: Boolean get() = role == Role.STAFF
    val actor: Actor get() = Actor.member(role, user.id)

    fun canManageResource(resourceId: UUID) = !isStaffOnly || resourceId in linkedResourceIds

    fun requireRole(min: Role) {
        if (!role.atLeast(min)) throw Errors.forbidden()
    }

    fun requireResource(resourceId: UUID) {
        if (!canManageResource(resourceId)) throw Errors.forbidden("You can only manage your own calendar.")
    }
}
