package ie.bookanything.booking

import ie.bookanything.AppContext
import ie.bookanything.BusinessIdAttribute
import ie.bookanything.audit.Actor
import ie.bookanything.auth.TokenService
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.business.BusinessRepository
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.parseInstant
import ie.bookanything.http.parseUuid
import ie.bookanything.http.queryInstant
import ie.bookanything.http.queryUuid
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveOptionalBody
import ie.bookanything.http.requireQueryDateRange
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.serializer

/** The booking a manage link points to (by the hash of its token), with its business. */
private suspend fun loadManaged(ctx: AppContext, call: ApplicationCall): OwnBooking {
    val token = call.parameters["token"]
    if (!TokenService.looksValid(token)) throw Errors.notFound("Booking")
    return ctx.db.read { conn ->
        val booking = BookingRepository.byManageTokenHash(conn, TokenService.hash(token!!)) ?: return@read null
        val business = BusinessRepository.findById(conn, booking.businessId) ?: return@read null
        OwnBooking(business, booking)
    }?.also { call.attributes.put(BusinessIdAttribute, it.business.id.toString()) } ?: throw Errors.notFound("Booking")
}

/** The emailed manage link (`/manage/{token}`): the customer's view of one booking and the [CustomerBookingCommands] on it. */
fun Route.manageRoutes(ctx: AppContext) {
    val customer = ctx.booking.customer

    get("/manage/{token}") {
        val m = loadManaged(ctx, call)
        call.respond(BookingViews.managedView(m.booking, m.business, ctx.now()))
    }

    post("/manage/{token}/cancel") {
        ctx.rateLimiter.check(call, RateLimiter.MANAGE, ctx.now())
        val m = loadManaged(ctx, call)
        val input = call.receiveOptionalBody(serializer<ReasonInput>(), ReasonInput())
        val updated = ctx.db.tx(m.business.id) { conn ->
            customer.cancel(conn, m.business, m.booking, input.reason, Actor.customer(m.booking.customer.userId), ctx.now())
        }
        call.respond(BookingViews.managedView(ctx.db.current(updated), m.business, ctx.now())) // with the refund made after the commit
    }

    post("/manage/{token}/reschedule") {
        ctx.rateLimiter.check(call, RateLimiter.MANAGE, ctx.now())
        val m = loadManaged(ctx, call)
        val input = call.receiveBody<CustomerRescheduleInput>()
        val start = parseInstant(input.start, "start", m.business.zone)
        val resourceId = input.resourceId?.let { parseUuid(it, "resourceId") }
        val updated = ctx.db.tx(m.business.id) { conn ->
            customer.reschedule(conn, m.business, m.booking, start, resourceId, Actor.customer(m.booking.customer.userId), ctx.now())
        }
        call.respond(BookingViews.managedView(updated, m.business, ctx.now()))
    }

    get("/manage/{token}/availability") {
        ctx.rateLimiter.check(call, RateLimiter.AVAILABILITY, ctx.now())
        val m = loadManaged(ctx, call)
        val range = call.requireQueryDateRange().requireValid(AvailabilityService.MAX_RANGE_DAYS)
        val resourceId = call.queryUuid("resourceId")
        val after = call.queryInstant("after", m.business.zone)
        val body = ctx.db.read(m.business.id) { conn ->
            customer.availability(conn, m.business, m.booking, range, resourceId, after, ctx.now())
        }
        call.respond(body)
    }

    post("/manage/{token}/pay") {
        ctx.rateLimiter.check(call, RateLimiter.MANAGE, ctx.now())
        val m = loadManaged(ctx, call)
        val url = ctx.db.read(m.business.id) { customer.checkoutUrl(it, m.business, m.booking, ctx.now()) }
        call.respond(CheckoutUrlResponse(url))
    }

    devPaymentRoutes(ctx)
}
