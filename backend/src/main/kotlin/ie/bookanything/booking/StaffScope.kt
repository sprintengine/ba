package ie.bookanything.booking

import ie.bookanything.auth.BusinessAccess
import ie.bookanything.http.Errors
import ie.bookanything.services.ServiceDef
import java.util.UUID

/**
 * The resources a member works on (docs/architecture.md section 3.3): a staff-only member is limited to the resources
 * linked to them, owners and admins to none. Every booking rule about "my calendar" goes through here: the dashboard
 * routes, [StaffBookingCommands] and Bo's booking tools. Get one with [BusinessAccess.staffScope].
 */
class StaffScope(
    /** The member's own resources, or null when the member is not limited. */
    private val own: Set<UUID>?,
) {
    val isLimited: Boolean get() = own != null

    /** Whether [resourceId] is on the member's calendar (every resource is, for members who are not limited). */
    fun coversResource(resourceId: UUID): Boolean = own == null || resourceId in own

    /** Whether the member may see [booking]: limited members only bookings with an allocation on one of their resources. */
    fun covers(booking: BookingRow): Boolean = own == null || booking.resourceIds.any { it in own }

    /** FORBIDDEN with [message] unless each [requested] resource is the member's own (null requests nothing). */
    fun requireOwn(requested: List<UUID>?, message: String) {
        if (own != null && requested != null && requested.any { it !in own }) throw Errors.forbidden(message)
    }

    /**
     * The resources a new booking must use: the [requested] ones, else (limited members) all of their own; null means
     * any suitable resource. A limited member who requests another resource, or has none, gets FORBIDDEN.
     */
    fun forNewBooking(requested: List<UUID>?): List<UUID>? {
        if (own == null) return requested
        val chosen = requested ?: own.toList()
        if (chosen.isEmpty() || chosen.any { it !in own }) throw Errors.forbidden(BOOK_OWN_ONLY)
        return chosen
    }

    /**
     * The resources [booking] may move to: the [requested] ones (check them with [requireOwn]), else for limited members
     * its own. An empty request asks for nothing, like null: passed on, it would mean "any suitable resource" and let a
     * limited member move the booking onto someone else's calendar.
     */
    fun forMove(requested: List<UUID>?, booking: BookingRow): List<UUID>? =
        requested?.takeIf { it.isNotEmpty() } ?: booking.resourceIds.takeIf { own != null }

    /**
     * The resources to show [service]'s free times on: the [requested] ones narrowed to the member's own, else those of
     * their own the service can use. FORBIDDEN when a limited member is left with none.
     */
    fun forAvailability(requested: List<UUID>?, service: ServiceDef): List<UUID>? {
        if (own == null) return requested
        val shown = requested?.filter { it in own } ?: usableFor(own.toList(), service)
        if (shown.isEmpty()) throw Errors.forbidden(VIEW_OWN_ONLY)
        return shown
    }

    /** Whether [forNewBooking] fills in the member's whole calendar for [requested] (narrowed with [usableFor] later). */
    fun defaultsForNewBooking(requested: List<UUID>?): Boolean = own != null && requested == null

    /** The resource filter of a booking list: [requested] narrowed to the member's own (all of them when none requested); null for no filter. */
    fun listFilter(requested: List<UUID>): Set<UUID>? = when {
        own == null -> requested.toSet().takeIf { it.isNotEmpty() }
        requested.isEmpty() -> own
        else -> requested.filter { it in own }.toSet()
    }

    companion object {
        const val BOOK_OWN_ONLY = "You can only book onto your own calendar."
        const val VIEW_OWN_ONLY = "You can only view your own calendar."

        /**
         * Of a member's own [resources] (the active ones, see `Memberships`), those [service] can use: a member linked to
         * a person and a room books a person-only service on the person.
         */
        fun usableFor(resources: List<UUID>, service: ServiceDef): List<UUID> =
            resources.filter { rid -> service.requirements.any { rid in it.resourceIds } }

        /** SQL condition: booking `b` has an allocation on one of the resources bound to the next parameter (a `uuid[]`). */
        const val ON_RESOURCES_SQL = "EXISTS (SELECT 1 FROM booking_allocations a WHERE a.booking_id = b.id AND a.resource_id = ANY(?))"
    }
}

/** This member's [StaffScope]. */
val BusinessAccess.staffScope: StaffScope get() = StaffScope(if (isStaffOnly) linkedResourceIds else null)
