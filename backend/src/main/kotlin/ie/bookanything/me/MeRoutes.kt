package ie.bookanything.me

import ie.bookanything.AppContext
import ie.bookanything.audit.Actor
import ie.bookanything.auth.TokenService
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.booking.CheckoutUrlResponse
import ie.bookanything.booking.CustomerRescheduleInput
import ie.bookanything.booking.ReasonInput
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.parseUuid
import ie.bookanything.http.pathUuid
import ie.bookanything.http.queryInstant
import ie.bookanything.http.queryUuid
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveOptionalBody
import ie.bookanything.http.requireQueryDateRange
import ie.bookanything.team.Invitations
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.serializer

fun Route.meRoutes(ctx: AppContext) {
    val customer = ctx.booking.customer

    get("/me") {
        val user = ctx.auth.requireUser(call)
        call.respond(ctx.db.tx { conn -> MeService.me(conn, user, ctx.tokens) })
    }

    get("/me/bookings") {
        val user = ctx.auth.requireUser(call)
        call.respond(ctx.db.tx { conn -> MeService.myBookings(conn, user, ctx.now()) })
    }

    post("/me/bookings/{bookingId}/cancel") {
        val user = ctx.auth.requireUser(call)
        val id = call.pathUuid("bookingId")
        val input = call.receiveOptionalBody(serializer<ReasonInput>(), ReasonInput())
        call.respond(customer.cancelOwn(user, id, input.reason, Actor.customer(user.id)))
    }

    post("/me/bookings/{bookingId}/reschedule") {
        val user = ctx.auth.requireUser(call)
        val own = customer.ownBooking(user, call.pathUuid("bookingId")) // someone else's booking is 404, whatever the body
        val input = call.receiveBody<CustomerRescheduleInput>()
        val resourceId = input.resourceId?.let { parseUuid(it, "resourceId") }
        call.respond(customer.rescheduleOwn(own, input.start, resourceId, Actor.customer(user.id)))
    }

    get("/me/bookings/{bookingId}/availability") {
        val user = ctx.auth.requireUser(call)
        ctx.rateLimiter.check(call, RateLimiter.AVAILABILITY, ctx.now())
        val id = call.pathUuid("bookingId")
        val range = call.requireQueryDateRange().requireValid(AvailabilityService.MAX_RANGE_DAYS)
        val resourceId = call.queryUuid("resourceId")
        val (business, booking) = customer.ownBooking(user, id)
        val after = call.queryInstant("after", business.zone)
        val body = ctx.db.read(business.id) { conn -> customer.availability(conn, business, booking, range, resourceId, after, ctx.now()) }
        call.respond(body)
    }

    post("/me/bookings/{bookingId}/pay") {
        val user = ctx.auth.requireUser(call)
        val id = call.pathUuid("bookingId")
        val (business, booking) = customer.ownBooking(user, id)
        val url = ctx.db.read(business.id) { customer.checkoutUrl(it, business, booking, ctx.now()) }
        call.respond(CheckoutUrlResponse(url))
    }

    post("/invitations/{token}/accept") {
        val user = ctx.auth.requireUser(call)
        val token = call.parameters["token"]
        if (!TokenService.looksValid(token)) throw Errors.notFound("Invitation")
        val accepted = ctx.db.tx { conn ->
            val businessId = Invitations.acceptByToken(conn, ctx.tokens, token!!, user)
            AcceptedInvitation.of(MeService.me(conn, user, ctx.tokens), businessId)
        }
        call.respond(accepted)
    }
}
