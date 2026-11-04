package ie.bookanything.mcp.customer

import ie.bookanything.mcp.MarketplaceTools
import ie.bookanything.mcp.McpTool
import ie.bookanything.mcp.READ_ONLY
import ie.bookanything.mcp.toolSchema
import ie.bookanything.oauth.Scope
import io.modelcontextprotocol.kotlin.sdk.types.Tool
import io.modelcontextprotocol.kotlin.sdk.types.ToolAnnotations

/** The signed-in customer's tools. Adding a tool is one entry here (definition, scope, handler). */
object CustomerTools {
    private val WRITE = ToolAnnotations(readOnlyHint = false, destructiveHint = false, idempotentHint = false, openWorldHint = false)
    private val DESTRUCTIVE = ToolAnnotations(readOnlyHint = false, destructiveHint = true, idempotentHint = true, openWorldHint = false)
    private val UNDO = ToolAnnotations(readOnlyHint = false, destructiveHint = false, idempotentHint = true, openWorldHint = false)

    val ALL: List<McpTool<CustomerToolContext>> = listOf(
        McpTool(MarketplaceTools.searchTool(), Scope.MARKETPLACE_READ) { a -> MarketplaceTools.search(this, a) },
        McpTool(
            Tool(
                name = "get_business",
                title = "Get business",
                description = "Everything needed to book with one business: its profile, policies (notice, cancellation, refunds), " +
                    "services with prices in cents, durations, options, add-ons, the selectable resource (e.g. a therapist), the " +
                    "booking questions each service needs answered, and active deals. Get the slug from search_marketplace.",
                inputSchema = toolSchema(listOf("slug")) { string("slug", MarketplaceTools.SLUG) },
                annotations = READ_ONLY,
            ),
            Scope.MARKETPLACE_READ,
        ) { a -> CustomerBookingTools.getBusiness(this, a) },
        McpTool(MarketplaceTools.availabilityTool(forCustomer = true), Scope.MARKETPLACE_READ) { a ->
            MarketplaceTools.availability(this, a) { business -> customerGroup(business) }
        },
        McpTool(
            Tool(
                name = "book",
                title = "Book",
                description = "Prepares a booking of a start time returned by check_availability, as the signed-in user (their name " +
                    "and verified email): returns a request with the price (deals apply automatically). Nothing is booked until it is " +
                    "approved (see its status and next). Required booking questions (from get_business) go in answers, keyed by " +
                    "question id. Some businesses require a phone number. Paid services then give a payment link for the user to pay " +
                    "on bookanything (get_proposal); never ask for or handle card details. A service with allowPayAtVenue lets the user " +
                    "choose payment=at_venue instead: nothing is paid now.",
                inputSchema = toolSchema(listOf("slug", "serviceId", "start")) {
                    string("slug", MarketplaceTools.SLUG)
                    string("serviceId", "Service id")
                    string("start", "Start time exactly as returned by check_availability (ISO-8601 with offset)", format = "date-time")
                    string("optionId", "Option id (required when the service has options)")
                    stringArray("addonIds", "Add-on ids")
                    string("resourceId", "Selectable resource id, e.g. a specific therapist")
                    stringMap("answers", "Booking question id → answer")
                    string("notes", "Optional note for the business")
                    string("phone", "The user's phone number, when the business requires one")
                    string(
                        "payment",
                        "online (default: as the service says) or at_venue (only when the service has allowPayAtVenue)",
                        enum = listOf("online", "at_venue"),
                    )
                },
                annotations = WRITE,
            ),
            Scope.BOOKINGS_WRITE,
        ) { a -> CustomerBookingTools.propose(this, CustomerChangeKind.BOOK, a) },
        McpTool(
            Tool(
                name = "list_my_bookings",
                title = "List my bookings",
                description = "The signed-in user's bookings at every business: upcoming (soonest first), past (latest first) or all. " +
                    "Each has its id (for reschedule_booking and cancel_booking), status, time, price and whether it can still be " +
                    "cancelled or moved online.",
                inputSchema = toolSchema {
                    string("status", "Which bookings (default upcoming)", enum = listOf("upcoming", "past", "all"))
                    integer("limit", "At most this many (1-50, default 10)", 1, 50)
                },
                annotations = READ_ONLY,
            ),
            Scope.BOOKINGS_READ,
        ) { a -> CustomerBookingTools.listMyBookings(this, a) },
        McpTool(
            Tool(
                name = "get_next_appointment",
                title = "Get next appointment",
                description = "The signed-in user's next upcoming booking, or null when there is none.",
                inputSchema = toolSchema(),
                annotations = READ_ONLY,
            ),
            Scope.BOOKINGS_READ,
        ) { a -> CustomerBookingTools.nextAppointment(this, a) },
        McpTool(
            Tool(
                name = "find_times_to_move",
                title = "Find times to move a booking",
                description = "Free times one of the user's bookings can move to, between two dates (inclusive, at most 31 days; `to` " +
                    "defaults to `from`): same service and length, and only times its deal covers when it was booked with one. Use " +
                    "these with reschedule_booking. Some businesses offer only their next available time: call again with `after`.",
                inputSchema = toolSchema(listOf("bookingId", "from")) {
                    string("bookingId", "Booking id from list_my_bookings")
                    string("from", "First date, YYYY-MM-DD", format = "date")
                    string("to", "Last date, YYYY-MM-DD (default: from)", format = "date")
                    string("resourceId", "Selectable resource id, to see e.g. another therapist's times")
                    string("after", "Only times starting after this (ISO-8601 with offset)", format = "date-time")
                },
                annotations = READ_ONLY,
            ),
            Scope.BOOKINGS_READ,
        ) { a -> CustomerBookingTools.timesToMove(this, a) },
        McpTool(
            Tool(
                name = "get_payment_link",
                title = "Get payment link",
                description = "The payment page for one of the user's bookings that is held waiting for payment (paymentStatus " +
                    "awaiting payment), e.g. when the link from book was lost. Give it to the user: they pay on bookanything " +
                    "themselves before the hold ends. Refused once the hold has ended or nothing is due.",
                inputSchema = toolSchema(listOf("bookingId")) { string("bookingId", "Booking id from list_my_bookings") },
                annotations = READ_ONLY,
            ),
            Scope.BOOKINGS_READ,
        ) { a -> CustomerBookingTools.paymentLink(this, a) },
        McpTool(
            Tool(
                name = "reschedule_booking",
                title = "Reschedule booking",
                description = "Prepares moving one of the user's bookings to another free time (from find_times_to_move): nothing " +
                    "moves until it is approved. Only allowed until the business's cancellation notice window; a booking with a deal " +
                    "price can only move to times the same deal covers. Payment carries over.",
                inputSchema = toolSchema(listOf("bookingId", "start")) {
                    string("bookingId", "Booking id from list_my_bookings")
                    string("start", "New start time exactly as returned by check_availability", format = "date-time")
                    string("resourceId", "Selectable resource id, to change e.g. the therapist")
                },
                annotations = WRITE,
            ),
            Scope.BOOKINGS_WRITE,
        ) { a -> CustomerBookingTools.propose(this, CustomerChangeKind.RESCHEDULE, a) },
        McpTool(
            Tool(
                name = "cancel_booking",
                title = "Cancel booking",
                description = "Prepares cancelling one of the user's bookings: the request shows the refund the business's policy " +
                    "gives now, and nothing is cancelled until it is approved. Refunds go back to the original payment automatically.",
                inputSchema = toolSchema(listOf("bookingId")) {
                    string("bookingId", "Booking id from list_my_bookings")
                    string("reason", "Optional reason, shared with the business")
                },
                annotations = WRITE,
            ),
            Scope.BOOKINGS_WRITE,
        ) { a -> CustomerBookingTools.propose(this, CustomerChangeKind.CANCEL, a) },
        McpTool(
            Tool(
                name = "confirm_action",
                title = "Confirm a request",
                description = "Carries out a request you prepared (a booking, move or cancellation) when its status is " +
                    "awaiting_confirmation, after the user clearly agreed. One awaiting_approval doesn't go ahead this way: the user " +
                    "approves it on bookanything at its approvalUrl. Confirming twice returns the first result.",
                inputSchema = toolSchema(listOf("proposalId")) { string("proposalId", "The proposalId a tool returned") },
                annotations = DESTRUCTIVE,
            ),
            Scope.BOOKINGS_WRITE,
        ) { a -> CustomerBookingTools.confirm(this, a) },
        McpTool(
            Tool(
                name = "cancel_action",
                title = "Drop a request",
                description = "Drops a request the user doesn't want, so it can't go ahead later. Nothing changes.",
                inputSchema = toolSchema(listOf("proposalId")) { string("proposalId", "The proposalId a tool returned") },
                annotations = UNDO,
            ),
            Scope.BOOKINGS_WRITE,
        ) { a -> CustomerBookingTools.drop(this, a) },
        McpTool(
            Tool(
                name = "get_proposal",
                title = "Check a request",
                description = "Where a request you prepared stands: awaiting_approval (approvalUrl is the link to give the user), " +
                    "awaiting_confirmation, confirmed (with what happened, the booking, and e.g. a payment link), rejected, expired or " +
                    "failed. Use it after the user says they've approved or declined it.",
                inputSchema = toolSchema(listOf("proposalId")) { string("proposalId", "The proposalId a tool returned") },
                annotations = READ_ONLY,
            ),
            Scope.BOOKINGS_READ,
        ) { a -> CustomerBookingTools.check(this, a) },
    )

    private val byName = ALL.associateBy { it.name }

    /** The scope a `tools/call` of [toolName] needs (null for unknown tools: the MCP server answers those). */
    fun scopeFor(toolName: String): Scope? = byName[toolName]?.scope
}
