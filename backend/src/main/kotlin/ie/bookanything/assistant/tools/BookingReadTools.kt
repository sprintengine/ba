package ie.bookanything.assistant.tools

import ie.bookanything.ai.JsonSchema.enum
import ie.bookanything.ai.JsonSchema.integer
import ie.bookanything.ai.JsonSchema.nullable
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.auth.Role
import ie.bookanything.booking.BookingFilter
import ie.bookanything.booking.BookingRow
import ie.bookanything.booking.BookingStatus
import ie.bookanything.customers.CustomerRepository
import ie.bookanything.http.Errors
import ie.bookanything.http.parseDate
import ie.bookanything.http.parseUuid
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer
import java.sql.Connection
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/** Statuses on a working schedule (not cancelled or expired). */
internal val ON_SCHEDULE =
    listOf(BookingStatus.HELD, BookingStatus.PENDING_APPROVAL, BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW)

@Serializable
data class ScheduleInput(val date: String, val days: Int, val resourceId: String?)

@Serializable
data class ScheduleDay(val date: String, val weekday: String, val bookings: List<ScheduleRow>)

@Serializable
data class ScheduleView(val timezone: String, val days: List<ScheduleDay>, val total: Int, val truncated: Boolean)

object GetSchedule : ReadTool<ScheduleInput> {
    override val name = "get_schedule"
    override val label = "Checking the schedule"
    override val minRole = Role.STAFF
    override val input = serializer<ScheduleInput>()
    override val description =
        "Lists the bookings on the schedule for one or more days (not cancelled ones). Call this for questions like " +
            "\"what's on today\", \"who is in tomorrow\", \"am I busy on Friday\" or before suggesting changes to a day. Staff only see " +
            "their own calendar. Rows are short (no contact details or form answers: find_bookings has those) and stop at " +
            "$LIMIT bookings (truncated: ask for fewer days or one resource)."
    override val schema = obj(
        "date" to string("First day, YYYY-MM-DD in the business timezone (see Today in the context)"),
        "days" to integer("Number of days from date, 1 to 7"),
        "resourceId" to nullable(string("Only this resource's bookings (an id from list_resources), or null for all")),
    )

    override fun run(ctx: ToolContext, input: ScheduleInput): ToolOutput {
        val from = parseDate(input.date, "date")
        if (input.days !in 1..7) throw Errors.field("days", "Must be between 1 and 7")
        val to = from.plusDays(input.days - 1L)
        val resourceIds = listOfNotNull(input.resourceId?.let { parseUuid(it, "resourceId") })
        val rows = ctx.read { conn -> ctx.staff.list(conn, ctx.access, BookingFilter(from, to, ON_SCHEDULE, resourceIds, limit = LIMIT)) }
        val shown = rows.take(LIMIT)
        val zone = ctx.business.zone
        val byDay = shown.groupBy { LocalDate.ofInstant(it.start, zone) }
        val days = generateSequence(from) { it.plusDays(1) }.takeWhile { !it.isAfter(to) }.map { d ->
            ScheduleDay(
                d.toString(), d.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.ENGLISH),
                byDay[d].orEmpty().map { ToolViews.scheduleRow(it, ctx.business) },
            )
        }.toList()
        val view = ScheduleView(zone.id, days, shown.size, rows.size > LIMIT)
        return ToolViews.output(serializer<ScheduleView>(), view, "Found ${ctx.bookings(shown.size)}", untrusted = shown.isNotEmpty())
    }

    private const val LIMIT = 60
}

@Serializable
data class FindBookingsInput(val query: String?, val status: String?, val from: String?, val to: String?, val customerId: String?)

@Serializable
data class BookingList(val bookings: List<BookingView>, val truncated: Boolean)

object FindBookings : ReadTool<FindBookingsInput> {
    override val name = "find_bookings"
    override val label = "Looking up bookings"
    override val minRole = Role.STAFF
    override val input = serializer<FindBookingsInput>()
    override val description =
        "Searches bookings by customer name, email, phone or booking reference, status and date range. Call this to find " +
            "a specific booking before rescheduling, cancelling or sending a payment link. Without dates it searches 90 days back to 180 " +
            "days ahead."
    override val schema = obj(
        "query" to nullable(string("Customer name, email, phone or booking reference (e.g. BA-7K3F9Q); null for any")),
        "status" to nullable(enum(BookingStatus.entries.map { it.wire }.sorted(), "Only this status; null for all except expired")),
        "from" to nullable(string("Earliest start date, YYYY-MM-DD")),
        "to" to nullable(string("Latest start date, YYYY-MM-DD")),
        "customerId" to nullable(string("Only this customer's bookings (an id from find_customers)")),
    )

    override fun run(ctx: ToolContext, input: FindBookingsInput): ToolOutput {
        val today = LocalDate.ofInstant(ctx.now, ctx.business.zone)
        val from = input.from?.let { parseDate(it, "from") } ?: today.minusDays(90)
        val to = input.to?.let { parseDate(it, "to") } ?: today.plusDays(180)
        if (to.isBefore(from)) throw Errors.field("to", "Must be on or after from")
        val status = input.status?.let { BookingStatus.parseOrNull(it) ?: throw Errors.field("status", "Unknown status") }
        val filter = BookingFilter(
            from = from, to = to, statuses = listOfNotNull(status), q = input.query?.trim()?.takeIf { it.isNotEmpty() }?.take(100),
            customerId = input.customerId?.let { parseUuid(it, "customerId") }, limit = LIMIT,
        )
        val rows = ctx.read { conn -> ctx.staff.list(conn, ctx.access, filter) }
        val shown = rows.take(LIMIT).map { ToolViews.booking(it, ctx.business) }
        return ToolViews.output(
            serializer<BookingList>(), BookingList(shown, rows.size > LIMIT), "Found ${ctx.bookings(shown.size)}",
            untrusted = shown.isNotEmpty(),
        )
    }

    private const val LIMIT = 20
}

@Serializable
data class FindCustomersInput(val query: String)

@Serializable
data class CustomerList(val customers: List<CustomerView>, val truncated: Boolean)

object FindCustomers : ReadTool<FindCustomersInput> {
    override val name = "find_customers"
    override val label = "Looking up customers"
    override val minRole = Role.STAFF
    override val input = serializer<FindCustomersInput>()
    override val description =
        "Finds customers by name, email or phone. Call this to get a customer's id before booking them in or listing " +
            "their bookings. Staff see customers who have booked with them (or have no bookings yet)."
    override val schema = obj("query" to string("Part of a name, email address or phone number"))

    override fun run(ctx: ToolContext, input: FindCustomersInput): ToolOutput {
        val q = input.query.trim().take(100)
        if (q.isEmpty()) throw Errors.field("query", "Required")
        val scope = if (ctx.access.isStaffOnly) ctx.access.linkedResourceIds else null
        val rows = ctx.read { conn -> CustomerRepository.list(conn, ctx.access.businessId, q, scope, null, LIMIT) }
        val shown = rows.take(LIMIT).map { ToolViews.customer(it, ctx.business.zone) }
        return ToolViews.output(
            serializer<CustomerList>(), CustomerList(shown, rows.size > LIMIT), "Found ${ToolViews.plural(shown.size, "customer")}",
            untrusted = shown.isNotEmpty(),
        )
    }

    private const val LIMIT = 20
}

/** Loads one booking the member may see, for write-tool previews. */
internal fun visibleBooking(ctx: ToolContext, conn: Connection, id: String): BookingRow =
    ctx.staff.visibleBooking(conn, ctx.access, parseUuid(id, "bookingId"))

/** One line per booking in previews: "BA-7K3F9Q · Consult · Tue 6 Oct, 10:00–11:00 · Jordan Casey". */
internal fun bookingLine(b: BookingRow, ctx: ToolContext) =
    "${b.reference} · ${b.serviceName} · ${ToolViews.whenText(b.start, b.end, ctx.business.zone)} · ${b.customer.name}"
