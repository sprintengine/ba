package ie.bookanything.booking

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.businessAccess
import ie.bookanything.http.Errors
import ie.bookanything.http.queryBool
import ie.bookanything.http.queryUuid
import ie.bookanything.http.queryUuidList
import ie.bookanything.http.requireQueryDateRange
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

/** `GET /availability`: free times for a new booking of a service, or (with `excludeBookingId`) to move a booking. */
internal fun Route.staffAvailabilityRoutes(ctx: AppContext) {
    val staff = ctx.booking.staff

    get("/availability") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val excludeBookingId = call.queryUuid("excludeBookingId")
        val serviceId = call.queryUuid("serviceId")
        if (serviceId == null && excludeBookingId == null) throw Errors.field("serviceId", "Required")
        val range = call.requireQueryDateRange().requireValid(AvailabilityService.MAX_RANGE_DAYS)
        val optionId = call.queryUuid("optionId")
        val addonIds = call.queryUuidList("addonIds")
        val groupId = call.queryUuid("groupId")
        val resourceIds = call.queryUuidList("resourceId").ifEmpty { null }
        val includePrivate = call.queryBool("includePrivate") ?: true
        val body = ctx.db.read(access.businessId) { conn ->
            if (excludeBookingId != null) {
                staff.rescheduleAvailability(conn, access, excludeBookingId, serviceId, range, resourceIds, ctx.now())
            } else {
                staff.availability(conn, access, serviceId!!, range, resourceIds, optionId, addonIds, groupId, includePrivate, ctx.now())
            }
        }
        call.respond(body)
    }
}
