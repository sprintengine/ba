package ie.bookanything.booking

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.http.parseInstant
import ie.bookanything.http.pathUuid
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveOptionalBody
import ie.bookanything.payments.RefundOverride
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import kotlinx.serialization.serializer

/** State changes of one booking: cancel, reschedule, approve, decline, payment link, paid in person, completed/no-show. */
internal fun Route.bookingActionRoutes(ctx: AppContext) {
    val staff = ctx.booking.staff

    post("/bookings/{bookingId}/cancel") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("bookingId")
        val input = call.receiveOptionalBody(serializer<StaffCancelInput>(), StaffCancelInput())
        val refund = RefundOverride.parse(input.refund) ?: throw Errors.field("refund", "Must be policy, full or none")
        val updated = ctx.db.tx(access.businessId) { conn ->
            staff.cancel(conn, access, id, Cancellation.byBusiness(access.actor, input.reason, refund, input.notifyCustomer), ctx.now())
        }
        call.respond(BookingRepository.toDto(ctx.db.current(updated), access.business)) // with the refund made after the commit
    }

    post("/bookings/{bookingId}/reschedule") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("bookingId")
        val input = call.receiveBody<StaffRescheduleInput>()
        val v = Validator()
        val resourceIds = input.resourceIds?.let { v.uuids(it, "resourceIds") }
        v.throwIfInvalid()
        val start = parseInstant(input.start, "start", access.business.zone)
        val updated = ctx.db.tx(access.businessId) { conn ->
            staff.reschedule(conn, access, id, start, resourceIds, input.notifyCustomer, access.actor, ctx.now())
        }
        call.respond(BookingRepository.toDto(updated, access.business))
    }

    post("/bookings/{bookingId}/approve") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("bookingId")
        val updated = ctx.db.tx(access.businessId) { conn -> staff.approve(conn, access, id, access.actor, ctx.now()) }
        call.respond(BookingRepository.toDto(updated, access.business))
    }

    post("/bookings/{bookingId}/decline") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("bookingId")
        val input = call.receiveOptionalBody(serializer<ReasonInput>(), ReasonInput())
        val updated = ctx.db.tx(access.businessId) { conn -> staff.decline(conn, access, id, input.reason, access.actor, ctx.now()) }
        call.respond(BookingRepository.toDto(ctx.db.current(updated), access.business))
    }

    post("/bookings/{bookingId}/send-payment-link") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("bookingId")
        call.respond(ctx.db.tx(access.businessId) { conn -> staff.sendPaymentLink(conn, access, id, access.actor, ctx.now()) })
    }

    post("/bookings/{bookingId}/paid-in-person") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("bookingId")
        val updated = ctx.db.tx(access.businessId) { conn -> staff.markPaidInPerson(conn, access, id, access.actor, ctx.now()) }
        call.respond(BookingRepository.toDto(updated, access.business))
    }

    post("/bookings/{bookingId}/status") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("bookingId")
        val status = BookingStatus.parseOrNull(call.receiveBody<StatusInput>().status)?.takeIf { it.isOutcome }
            ?: throw Errors.field("status", "Must be completed or no_show")
        val updated = ctx.db.tx(access.businessId) { conn -> staff.setOutcome(conn, access, id, status, access.actor, ctx.now()) }
        call.respond(BookingRepository.toDto(updated, access.business))
    }
}
