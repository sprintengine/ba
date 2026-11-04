package ie.bookanything.assistant.tools

import ie.bookanything.ai.JsonSchema.integer
import ie.bookanything.ai.JsonSchema.nullable
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.auth.Role
import ie.bookanything.availability.AvailabilityRepository
import ie.bookanything.availability.AvailabilityRuleDto
import ie.bookanything.booking.BookingFilter
import ie.bookanything.booking.BookingStatus
import ie.bookanything.booking.staffScope
import ie.bookanything.business.BusinessOverview
import ie.bookanything.business.Policies
import ie.bookanything.http.DateRange
import ie.bookanything.http.Errors
import ie.bookanything.http.parseDate
import ie.bookanything.http.parseInstant
import ie.bookanything.http.parseUuid
import ie.bookanything.reports.ReportRepository
import ie.bookanything.resources.ResourceRepository
import ie.bookanything.services.ServiceRepository
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer
import java.time.LocalDate
import java.util.UUID

@Serializable
data class AvailabilityInput(val serviceId: String, val date: String, val days: Int, val resourceId: String?, val optionId: String?)

@Serializable
data class SlotView(
    val start: String,
    val time: String,
    val with: List<String>,
    /** The deal a booking at this time gets automatically, or null. */
    val deal: String? = null,
)

@Serializable
data class AvailabilityDayView(val date: String, val slots: List<SlotView>, val moreSlots: Int)

@Serializable
data class AvailabilityView(val service: String, val durationMinutes: Int, val firstFree: SlotView?, val days: List<AvailabilityDayView>)

object CheckAvailability : ReadTool<AvailabilityInput> {
    override val name = "check_availability"
    override val label = "Checking availability"
    override val minRole = Role.STAFF
    override val input = serializer<AvailabilityInput>()
    override val description = "Finds free start times for a service (and optionally one resource) over up to 7 days. Call this before " +
        "proposing a new booking or a reschedule, and to answer \"when is X free\". Times with a deal say so (bookings there get it " +
        "automatically). Staff see their own calendar only."
    override val schema = obj(
        "serviceId" to string("Service id from list_services"),
        "date" to string("First day, YYYY-MM-DD"),
        "days" to integer("Number of days, 1 to 7"),
        "resourceId" to nullable(string("Only times with this resource (id from list_resources), or null for anyone suitable")),
        "optionId" to nullable(string("Service option id when the service has options, else null")),
    )

    override fun run(ctx: ToolContext, input: AvailabilityInput): ToolOutput {
        val from = parseDate(input.date, "date")
        if (input.days !in 1..7) throw Errors.field("days", "Must be between 1 and 7")
        val serviceId = parseUuid(input.serviceId, "serviceId")
        val resourceIds = input.resourceId?.let { listOf(parseUuid(it, "resourceId")) }
        val optionId = input.optionId?.let { parseUuid(it, "optionId") }
        val range = DateRange(from, from.plusDays(input.days - 1L))
        val (dto, service, names) = ctx.read { conn ->
            val dto = ctx.staff.availability(conn, ctx.access, serviceId, range, resourceIds, optionId = optionId, now = ctx.now)
            Triple(
                dto, ServiceRepository.get(conn, ctx.access.businessId, serviceId)!!,
                ResourceRepository.list(conn, ctx.access.businessId).associate { it.id to it.name },
            )
        }
        val zone = ctx.business.zone
        val days = dto.days.map { d ->
            AvailabilityDayView(
                d.date,
                d.slots.take(SLOTS_PER_DAY).map { s ->
                    SlotView(
                        s.start, ToolViews.time(parseInstant(s.start, "start", zone), zone), s.resourceIds.mapNotNull(names::get),
                        s.offer?.let { ToolViews.deal(it, ctx.business.currency) },
                    )
                },
                maxOf(0, d.slots.size - SLOTS_PER_DAY),
            )
        }
        val total = dto.days.sumOf { it.slots.size }
        val view = AvailabilityView(service.name, dto.durationMinutes, days.firstNotNullOfOrNull { it.slots.firstOrNull() }, days)
        return ToolViews.output(serializer<AvailabilityView>(), view, "Found ${ToolViews.plural(total, "free time")}")
    }

    private const val SLOTS_PER_DAY = 16
}

@Serializable
class NoInput

@Serializable
data class OverviewView(
    val today: String,
    val bookingsToday: Int,
    val upcoming7Days: Int,
    val bookingsCreated30Days: Int,
    val revenue30Days: String?,
    val pendingApprovals: Int,
    val setupChecklist: Map<String, Boolean>,
    val todaysBookings: List<BookingView>,
)

object GetOverview : ReadTool<NoInput> {
    override val name = "business_overview"
    override val label = "Reading the overview"
    override val minRole = Role.STAFF
    override val input = serializer<NoInput>()
    override val description =
        "Today's bookings, the next 7 days, bookings and revenue in the last 30 days, pending approvals and the setup " +
            "checklist. Call this for \"how are we doing\", \"what needs my attention\" or a daily summary. Staff get their own numbers " +
            "and no revenue."
    override val schema = obj()

    override fun run(ctx: ToolContext, input: NoInput): ToolOutput {
        val today = LocalDate.ofInstant(ctx.now, ctx.business.zone)
        val (overview, todays, pending) = ctx.read { conn ->
            Triple(
                BusinessOverview.compute(conn, ctx.access, ctx.payments, ctx.now),
                ctx.staff.list(conn, ctx.access, BookingFilter(today, today, ON_SCHEDULE, limit = 50)),
                ctx.staff.list(
                    conn, ctx.access,
                    BookingFilter(from = today, statuses = listOf(BookingStatus.PENDING_APPROVAL), limit = 200),
                ).count { it.start.isAfter(ctx.now) },
            )
        }
        val view = OverviewView(
            today = today.toString(), bookingsToday = overview.today.size,
            upcoming7Days = overview.upcomingCount7d, bookingsCreated30Days = overview.bookings30d,
            revenue30Days = if (ctx.access.isStaffOnly) null else ToolViews.money(overview.revenueCents30d, ctx.business.currency),
            pendingApprovals = pending, setupChecklist = overview.checklist.associate { it.key to it.done },
            todaysBookings = todays.take(50).map { ToolViews.booking(it, ctx.business) },
        )
        return ToolViews.output(serializer<OverviewView>(), view, "Read today's overview", untrusted = todays.isNotEmpty())
    }
}

@Serializable
data class ServiceView(
    val id: String, val name: String, val durationMinutes: Int, val price: String, val paymentMode: String, val active: Boolean,
    val bookableOnline: Boolean,
    val requiresApproval: Boolean, val options: List<OptionView>,
)

@Serializable
data class OptionView(val id: String, val name: String, val durationMinutes: Int, val price: String)

@Serializable
data class ServiceListView(val services: List<ServiceView>)

object ListServices : ReadTool<NoInput> {
    override val name = "list_services"
    override val label = "Reading services"
    override val minRole = Role.STAFF
    override val input = serializer<NoInput>()
    override val description =
        "Lists the business's services with ids, durations, prices, payment modes and options. Call this to find a " +
            "service id before checking availability, booking, or changing a price or duration."
    override val schema = obj()

    override fun run(ctx: ToolContext, input: NoInput): ToolOutput {
        val currency = ctx.business.currency
        val services = ctx.read { conn -> ServiceRepository.list(conn, ctx.access.businessId) }.map { s ->
            ServiceView(
                s.id, s.name, s.durationMinutes, ToolViews.money(s.priceCents, currency), s.paymentMode, s.isActive, s.isPublic,
                s.requiresApproval,
                s.options.map { OptionView(it.id, it.name, it.durationMinutes, ToolViews.money(it.priceCents, currency)) },
            )
        }
        return ToolViews.output(
            serializer<ServiceListView>(), ServiceListView(services), "Found ${ToolViews.plural(services.size, "service")}",
        )
    }
}

@Serializable
data class HoursView(val day: String, val intervals: List<String>)

@Serializable
data class ResourceView(val id: String, val name: String, val kind: String, val active: Boolean, val weeklyHours: List<HoursView>)

@Serializable
data class ResourceListView(val resources: List<ResourceView>)

object ListResources : ReadTool<NoInput> {
    override val name = "list_resources"
    override val label = "Reading the team and rooms"
    override val minRole = Role.STAFF
    override val input = serializer<NoInput>()
    override val description =
        "Lists the bookable resources (people, rooms, equipment) with ids and weekly opening hours. Call this to find a " +
            "resource id, or before blocking time or changing opening hours. Staff see only their own resources."
    override val schema = obj()

    override fun run(ctx: ToolContext, input: NoInput): ToolOutput {
        val resources = ctx.read { conn ->
            val rules = AvailabilityRepository.rulesByResource(conn, ctx.access.businessId)
            ResourceRepository.list(conn, ctx.access.businessId)
                .filter { ctx.access.staffScope.coversResource(UUID.fromString(it.id)) }
                .map { r -> ResourceView(r.id, r.name, r.kind, r.isActive, weeklyHours(rules[r.id].orEmpty())) }
        }
        return ToolViews.output(
            serializer<ResourceListView>(), ResourceListView(resources), "Found ${ToolViews.plural(resources.size, "resource")}",
        )
    }

    fun weeklyHours(rules: List<AvailabilityRuleDto>): List<HoursView> = (1..7).map { d ->
        HoursView(
            DAY_NAMES[d - 1],
            rules.filter { it.dayOfWeek == d }.sortedBy { it.startTime }.map { r ->
                "${r.startTime}–${r.endTime}" + (if (r.audienceGroupIds.isNotEmpty()) " (some customer groups only)" else "") +
                    (if (r.validFrom != null || r.validUntil != null) " (${r.validFrom ?: "…"} to ${r.validUntil ?: "…"})" else "")
            },
        )
    }

    val DAY_NAMES = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
}

@Serializable
data class ClosureView(val date: String, val hours: String, val reason: String?)

@Serializable
data class PoliciesView(val timezone: String, val currency: String, val policies: Policies, val upcomingClosures: List<ClosureView>)

object GetPolicies : ReadTool<NoInput> {
    override val name = "get_policies"
    override val label = "Reading booking policies"
    override val minRole = Role.STAFF
    override val input = serializer<NoInput>()
    override val description =
        "The booking policies (notice, how far ahead, cancellation window and late refund, holds) and upcoming whole-" +
            "business closures. Call this for questions about cancellations, refunds, notice or closed days."
    override val schema = obj()

    override fun run(ctx: ToolContext, input: NoInput): ToolOutput {
        val today = LocalDate.ofInstant(ctx.now, ctx.business.zone)
        val closures = ctx.read { conn -> AvailabilityRepository.overrides(conn, ctx.access.businessId, null, today) }
            .filter { !it.isAvailable }.take(30)
            .map {
                ClosureView(
                    it.date,
                    if (it.startTime != null &&
                        it.endTime != null
                    ) {
                        "${it.startTime}–${it.endTime}"
                    } else {
                        "all day"
                    },
                    it.reason,
                )
            }
        val view = PoliciesView(ctx.business.timezone, ctx.business.currency, ctx.business.policies, closures)
        return ToolViews.output(serializer<PoliciesView>(), view, "Read the booking policies")
    }
}

@Serializable
data class StatsInput(val from: String, val to: String)

@Serializable
data class StatsView(
    val from: String, val to: String, val bookings: Int, val confirmedOrCompleted: Int, val cancelled: Int, val noShows: Int,
    val revenue: String, val refunded: String, val newCustomers: Int, val topServices: List<String>, val utilisation: List<String>,
)

object GetStats : ReadTool<StatsInput> {
    override val name = "get_stats"
    override val label = "Crunching the numbers"
    override val minRole = Role.ADMIN
    override val input = serializer<StatsInput>()
    override val description =
        "Business statistics for a date range (up to $MAX_STATS_DAYS days): bookings, cancellations, no-shows, revenue, refunds, new " +
            "customers, top services and resource utilisation. Call this for questions about performance, busiest services or trends."
    override val schema = obj(
        "from" to string("First day, YYYY-MM-DD"),
        "to" to string("Last day, YYYY-MM-DD"),
    )

    override fun run(ctx: ToolContext, input: StatsInput): ToolOutput {
        val (from, to) = DateRange(parseDate(input.from, "from"), parseDate(input.to, "to")).requireValid(MAX_STATS_DAYS)
        val s = ctx.read { conn -> ReportRepository.summary(conn, ctx.business, from, to) }
        val money = { cents: Int -> ToolViews.money(cents, s.currency) }
        val view = StatsView(
            s.from, s.to, s.totals.bookings, s.totals.confirmed, s.totals.cancelled, s.totals.noShows, money(s.totals.revenueCents),
            money(s.totals.refundedCents), s.totals.newCustomers,
            s.byService.take(5).map { "${it.name}: ${it.bookings} bookings, ${money(it.revenueCents)}" },
            s.byResource.map { "${it.name}: ${(it.utilisation * 100).toInt()}% booked" },
        )
        return ToolViews.output(serializer<StatsView>(), view, "Summarised $from to $to")
    }
}

/** The longest range get_stats covers (a quarter). */
private const val MAX_STATS_DAYS = 92L
