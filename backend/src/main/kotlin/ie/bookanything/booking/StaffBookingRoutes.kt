package ie.bookanything.booking

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.business.BusinessRow
import ie.bookanything.businessAccess
import ie.bookanything.http.ApiJson
import ie.bookanything.http.DateRange
import ie.bookanything.http.Errors
import ie.bookanything.http.KeysetCursor
import ie.bookanything.http.Patch
import ie.bookanything.http.pathUuid
import ie.bookanything.http.queryDate
import ie.bookanything.http.queryLimit
import ie.bookanything.http.queryUuid
import ie.bookanything.http.queryUuidList
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveObject
import ie.bookanything.http.toPage
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.serializer

/** The dashboard's bookings (`/businesses/{id}/bookings...` and `/availability`), all through [StaffBookingCommands]. */
fun Route.staffBookingRoutes(ctx: AppContext) {
    bookingRoutes(ctx)
    bookingActionRoutes(ctx)
    staffAvailabilityRoutes(ctx)
}

/** The booking list, one booking, creating one and editing its notes and answers. */
private fun Route.bookingRoutes(ctx: AppContext) {
    val staff = ctx.booking.staff

    get("/bookings") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val filter = call.bookingFilter()
        val rows = ctx.db.read(access.businessId) { conn -> staff.list(conn, access, filter) }
        call.respond(
            rows.toPage(filter.limit, { KeysetCursor.TIME_ID.encode(it.start to it.id) }) { BookingRepository.toDto(it, access.business) },
        )
    }

    get("/bookings/{bookingId}") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("bookingId")
        call.respond(ctx.db.read(access.businessId) { conn -> staff.detail(conn, access, id, ctx.now()) })
    }

    post("/bookings") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val input = call.receiveBody<CreateStaffBooking>()
        val command = staff.createCommand(access, input, BookingSource.DASHBOARD, access.actor, call.idempotencyKey())
        ctx.db.read(access.businessId) { conn -> staff.checkCustomer(conn, access, command) }
        val outcome = ctx.booking.engine.createInTx(access.business, command)
        staff.checkCreated(access, outcome.booking)
        call.respond(
            if (outcome.replayed) HttpStatusCode.OK else HttpStatusCode.Created,
            createdBookingJson(outcome.booking, access.business, outcome.checkoutUrl),
        )
    }

    patch("/bookings/{bookingId}") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("bookingId")
        val patch = Patch(call.receiveObject())
        val updated = ctx.db.tx(access.businessId) { conn -> staff.update(conn, access, id, patch, access.actor, ctx.now()) }
        call.respond(BookingRepository.toDto(updated, access.business))
    }
}

/** `GET /bookings` query: dates (at most [MAX_LIST_RANGE_DAYS]), statuses, resources, service, customer, text, page. */
private fun ApplicationCall.bookingFilter(): BookingFilter {
    val from = queryDate("from")
    val to = queryDate("to")
    if (from != null && to != null) DateRange(from, to).requireValid(MAX_LIST_RANGE_DAYS)
    val statuses = request.queryParameters["status"]?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty()
        .map { BookingStatus.parseOrNull(it) ?: throw Errors.field("status", "Unknown status '$it'") }
    return BookingFilter(
        from = from, to = to, statuses = statuses, resourceIds = queryUuidList("resourceId"), serviceId = queryUuid("serviceId"),
        customerId = queryUuid("customerId"), q = request.queryParameters["q"]?.trim()?.takeIf { it.isNotEmpty() }?.take(MAX_QUERY_LENGTH),
        limit = queryLimit(), cursor = KeysetCursor.TIME_ID.decode(request.queryParameters["cursor"]),
    )
}

/** `POST /bookings` response: the booking plus the checkout link when it is held for online payment. */
private fun createdBookingJson(b: BookingRow, business: BusinessRow, checkoutUrl: String?): JsonObject =
    JsonObject(
        ApiJson.encodeToJsonElement(serializer<BookingDto>(), BookingRepository.toDto(b, business)).jsonObject +
            ("checkoutUrl" to (checkoutUrl?.let { JsonPrimitive(it) } ?: JsonNull)),
    )

/** The longest date range one booking list request may cover. */
private const val MAX_LIST_RANGE_DAYS = 366L

/** Longest free-text search of the booking list. */
private const val MAX_QUERY_LENGTH = 100
