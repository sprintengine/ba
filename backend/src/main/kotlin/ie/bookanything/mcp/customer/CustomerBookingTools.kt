package ie.bookanything.mcp.customer

import ie.bookanything.assistant.actions.ActionStatus
import ie.bookanything.availability.AvailabilityDto
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.booking.BookingViews
import ie.bookanything.booking.PublicServiceDto
import ie.bookanything.business.BusinessViews
import ie.bookanything.business.PublicBusiness
import ie.bookanything.http.ApiException
import ie.bookanything.http.DateRange
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.parseDate
import ie.bookanything.http.parseInstant
import ie.bookanything.http.parseUuid
import ie.bookanything.mcp.MarketplaceTools
import ie.bookanything.mcp.McpResults
import ie.bookanything.mcp.SlugArgs
import ie.bookanything.mcp.StrictArgs
import ie.bookanything.mcp.business.OutcomeLink
import ie.bookanything.me.MeService
import ie.bookanything.offers.OfferService
import ie.bookanything.offers.PublicOfferDto
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.serializer
import java.util.UUID

/** Handlers of the customer tools. Each goes through the same services as the website, as the signed-in customer. */
object CustomerBookingTools {
    private fun CustomerToolContext.myBookingsUrl() = ctx.config.urls.myBookings()

    suspend fun getBusiness(c: CustomerToolContext, args: JsonObject): JsonElement = with(c) {
        val b = MarketplaceTools.business(ctx, StrictArgs.decode(serializer<SlugArgs>(), args).slug)
        val (profile, offers) = ctx.db.read(b.id) { conn ->
            BusinessViews.toPublic(ctx.payments, conn, b) to OfferService.publicOffers(conn, b, ctx.now())
        }
        JsonObject(
            mapOf(
                "business" to McpResults.encode(serializer<PublicBusiness>(), profile),
                "bookingUrl" to JsonPrimitive(ctx.config.urls.bookingPage(b.slug)),
                "services" to McpResults.encode(ListSerializer(serializer<PublicServiceDto>()), ctx.booking.public.services(b)),
                "deals" to McpResults.encode(ListSerializer(serializer<PublicOfferDto>()), offers),
            ),
        )
    }

    /**
     * book, reschedule_booking and cancel_booking only propose (section 20.8): checked as the website would, stored, and
     * carried out when the user approves it on bookanything (or, for a kind they let go ahead, when the app confirms it).
     */
    suspend fun propose(c: CustomerToolContext, kind: CustomerChangeKind, args: JsonObject): JsonElement = with(c) {
        limit(CUSTOMER_MCP_PROPOSALS)
        if (kind == CustomerChangeKind.BOOK) {
            limitUser(RateLimiter.PUBLIC_BOOKING)
            limitUser(RateLimiter.MCP_BOOKING)
        }
        val row = requests.propose(user, principal.grantId, kind, args)
        val p = row.proposal
        McpResults.encode(
            serializer<CustomerProposalResult>(),
            CustomerProposalResult(
                row.id.toString(), if (row.needsApproval) AWAITING_APPROVAL else AWAITING_CONFIRMATION, p.title, p.summary, p.changes,
                p.warnings, p.destructive, requests.toDto(row).action.expiresAt,
                requests.approvalUrl(row.id).takeIf { row.needsApproval }, if (row.needsApproval) APPROVAL_NOTE else CONFIRM_NOTE,
            ),
        )
    }

    /** confirm_action: carries out a request the user lets the app make; one needing approval stays waiting. */
    suspend fun confirm(c: CustomerToolContext, args: JsonObject): JsonElement = with(c) {
        val id = own(args)
        outcome(requests.carryOut(user, id, byApp = true))
    }

    /** cancel_action: drops a request the user doesn't want. */
    suspend fun drop(c: CustomerToolContext, args: JsonObject): JsonElement = with(c) {
        val id = own(args)
        outcome(requests.decline(user, id))
    }

    /** get_proposal: where a request stands, and what happened once it went ahead. */
    suspend fun check(c: CustomerToolContext, args: JsonObject): JsonElement = with(c) {
        val id = own(args)
        outcome(requests.ofApp(user, principal.grantId, id)!!)
    }

    /** The request [args] names, if this app made it. */
    private suspend fun CustomerToolContext.own(args: JsonObject): UUID {
        val id = parseUuid(StrictArgs.decode(serializer<ProposalIdArgs>(), args).proposalId, "proposalId")
        requests.ofApp(user, principal.grantId, id) ?: throw Errors.notFound("Proposal")
        return id
    }

    private suspend fun CustomerToolContext.outcome(row: CustomerRequestRow): JsonElement {
        val status = row.effectiveStatus(ctx.now())
        val waiting = status == ActionStatus.PENDING
        val booking = row.result?.bookingId?.let { id ->
            val own = try {
                ctx.booking.customer.ownBooking(user, UUID.fromString(id))
            } catch (_: ApiException) {
                null // no longer theirs (e.g. erased by the business)
            }
            own?.let { (business, b) -> McpBooking.of(BookingViews.customerView(b, business, ctx.now())) }
        }
        return McpResults.encode(
            serializer<CustomerProposalOutcome>(),
            CustomerProposalOutcome(
                row.id.toString(),
                when {
                    !waiting -> status.key
                    row.needsApproval -> AWAITING_APPROVAL
                    else -> AWAITING_CONFIRMATION
                },
                row.proposal.title,
                row.result?.message ?: row.error ?: if (waiting && row.needsApproval) {
                    "Nothing has happened yet: the user must approve it on bookanything. Give them approvalUrl, then check again with " +
                        "get_proposal."
                } else {
                    null
                },
                requests.approvalUrl(row.id).takeIf { waiting && row.needsApproval },
                row.result?.links.orEmpty().map { OutcomeLink(it.label, it.path) },
                booking,
            ),
        )
    }

    private const val AWAITING_APPROVAL = "awaiting_approval"
    private const val AWAITING_CONFIRMATION = "awaiting_confirmation"

    private const val APPROVAL_NOTE =
        "Nothing has happened yet, and you can't make it happen yourself: the user approves it on bookanything. Show them this " +
            "(title, summary, changes, warnings) and give them approvalUrl to open; they sign in and approve or decline it there. " +
            "Then call get_proposal with the proposalId to see what happened (a paid booking then has a payment link). It expires " +
            "at expiresAt."

    private const val CONFIRM_NOTE =
        "Nothing has happened yet. Show the user this (title, summary, changes, warnings) and ask them. Only when they agree, call " +
            "confirm_action with the proposalId; if they don't, call cancel_action. It expires at expiresAt."

    suspend fun listMyBookings(c: CustomerToolContext, args: JsonObject): JsonElement = with(c) {
        val a = StrictArgs.decode(serializer<ListMyBookingsArgs>(), args)
        if (a.status !in setOf("upcoming", "past", "all")) throw Errors.field("status", "Must be upcoming, past or all")
        if (a.limit !in 1..50) throw Errors.field("limit", "Must be between 1 and 50")
        val mine = ctx.db.tx { MeService.myBookings(it, user, ctx.now()) }
        val list = when (a.status) { "upcoming" -> mine.upcoming; "past" -> mine.past; else -> mine.upcoming + mine.past }
        McpResults.encode(serializer<BookingListResult>(), BookingListResult(list.take(a.limit).map(McpBooking::of), myBookingsUrl()))
    }

    suspend fun nextAppointment(c: CustomerToolContext, args: JsonObject): JsonElement = with(c) {
        StrictArgs.decode(serializer<NoArgs>(), args)
        val next = ctx.db.tx { MeService.myBookings(it, user, ctx.now()) }.upcoming.firstOrNull()
        McpResults.encode(
            serializer<NextAppointmentResult>(),
            NextAppointmentResult(
                next?.let(McpBooking::of),
                if (next == null) "No upcoming bookings." else "Next: ${next.service.name} at ${next.business.name}, ${next.start}.",
            ),
        )
    }

    /**
     * Times the user's own booking can move to (`GET /me/bookings/{id}/availability`): same service and length, its own
     * time not counted as taken, and only times its deal covers when it was booked with one.
     */
    suspend fun timesToMove(c: CustomerToolContext, args: JsonObject): JsonElement = with(c) {
        limit(RateLimiter.AVAILABILITY)
        val a = StrictArgs.decode(serializer<MoveTimesArgs>(), args)
        val id = parseUuid(a.bookingId, "bookingId")
        val resourceId = a.resourceId?.let { parseUuid(it, "resourceId") }
        val (business, booking) = ctx.booking.customer.ownBooking(user, id)
        val from = parseDate(a.from, "from")
        val range = DateRange(from, a.to?.let { parseDate(it, "to") } ?: from).requireValid(AvailabilityService.MAX_RANGE_DAYS)
        val after = a.after?.let { parseInstant(it, "after", business.zone) }
        val times = ctx.db.read(business.id) { conn ->
            ctx.booking.customer.availability(conn, business, booking, range, resourceId, after, ctx.now())
        }
        McpResults.encode(serializer<AvailabilityDto>(), times)
    }

    /** The payment page of a booking still held for payment: the user pays there themselves. */
    suspend fun paymentLink(c: CustomerToolContext, args: JsonObject): JsonElement = with(c) {
        val id = parseUuid(StrictArgs.decode(serializer<BookingIdArgs>(), args).bookingId, "bookingId")
        val (business, booking) = ctx.booking.customer.ownBooking(user, id)
        val url = ctx.db.read(business.id) { conn -> ctx.booking.customer.checkoutUrl(conn, business, booking, ctx.now()) }
        val view = McpBooking.of(BookingViews.customerView(booking, business, ctx.now()))
        McpResults.encode(
            serializer<PaymentLinkResult>(),
            PaymentLinkResult(
                view, url,
                "Give the user this link to pay on bookanything before the hold ends; never pay or handle card details for them.",
            ),
        )
    }
}
