package ie.bookanything.assistant.tools

import ie.bookanything.ai.JsonSchema.nullable
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.auth.Role
import ie.bookanything.availability.AvailabilityCommands
import ie.bookanything.availability.AvailabilityOverrideDto
import ie.bookanything.availability.AvailabilityRepository
import ie.bookanything.booking.staffScope
import ie.bookanything.business.AgentChangeKind
import ie.bookanything.http.Errors
import ie.bookanything.http.parseUuid
import ie.bookanything.resources.ResourceRepository
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.util.UUID

// Blocked time (time off, extra hours) and whole-business closures, as the availability settings list them, so an
// agent that can block time (block_time, close_date) can also see it and take it back.

@Serializable
data class TimeOffInput(val from: String?, val resourceId: String?)

@Serializable
data class TimeOffView(
    val id: String,
    /** The resource it applies to, or null for a closure of the whole business. */
    val resource: String?,
    val date: String,
    /** "All day" or "13:00–15:00". */
    val hours: String,
    /** blocked (time off, a closure) | open (extra hours) */
    val kind: String,
    val reason: String?,
)

@Serializable
data class TimeOffList(val items: List<TimeOffView>, val truncated: Boolean)

object ListTimeOff : ReadTool<TimeOffInput> {
    override val name = "list_time_off"
    override val label = "Checking time off"
    override val minRole = Role.STAFF
    override val input = serializer<TimeOffInput>()
    override val description = "Blocked time and extra hours on each resource, and closures of the whole business, from a date " +
        "(today by default). Use an id with remove_time_off. Staff see only their own resources (and the closures)."
    override val schema = obj(
        "from" to nullable(string("First date, YYYY-MM-DD, or null for today")),
        "resourceId" to nullable(string("Only this resource, or null for every resource")),
    )

    override fun run(ctx: ToolContext, input: TimeOffInput): ToolOutput {
        val from = input.from?.let {
            try {
                LocalDate.parse(it)
            } catch (_: DateTimeParseException) {
                throw Errors.field("from", "Use YYYY-MM-DD")
            }
        } ?: LocalDate.ofInstant(ctx.now, ctx.business.zone)
        val only = input.resourceId?.let { parseUuid(it, "resourceId") }
        val items = ctx.read { conn ->
            val resources = ResourceRepository.list(conn, ctx.access.businessId)
                .filter { ctx.access.staffScope.coversResource(UUID.fromString(it.id)) }
                .filter { only == null || it.id == only.toString() }
            if (only != null && resources.isEmpty()) throw Errors.notFound("Resource")
            val names = resources.associate { it.id to it.name }
            val perResource = resources.flatMap { r ->
                AvailabilityRepository.overrides(conn, ctx.access.businessId, UUID.fromString(r.id), from)
            }
            val closures = if (only == null) AvailabilityRepository.overrides(conn, ctx.access.businessId, null, from) else emptyList()
            (perResource + closures).sortedWith(compareBy({ it.date }, { it.startTime.orEmpty() })).map { view(it, names) }
        }
        return ToolViews.output(
            serializer(), TimeOffList(items.take(MAX_ITEMS), items.size > MAX_ITEMS),
            "Found ${ToolViews.plural(items.size, "entry", "entries")}",
        )
    }

    private fun view(o: AvailabilityOverrideDto, names: Map<String, String>) = TimeOffView(
        o.id, o.resourceId?.let { names[it] ?: it }, o.date,
        hours(o) ?: "All day",
        if (o.isAvailable) "open" else "blocked", ToolViews.clip(o.reason, 200),
    )

    private const val MAX_ITEMS = 60

    /** "13:00–15:00", or null for a whole day. */
    fun hours(o: AvailabilityOverrideDto): String? =
        if (o.startTime != null && o.endTime != null) "${o.startTime}–${o.endTime}" else null
}

@Serializable
data class RemoveTimeOffInput(val timeOffId: String)

object RemoveTimeOff : WriteTool<RemoveTimeOffInput> {
    override val name = "remove_time_off"
    override val label = "Preparing to remove time off"
    override val minRole = Role.STAFF
    override val input = serializer<RemoveTimeOffInput>()
    override val changeKind = AgentChangeKind.TIME_OFF
    override val description = "Proposes removing blocked time or extra hours from a resource, or reopening a closed date (admins), " +
        "by its id from list_time_off. Nothing changes until the user confirms."
    override val schema = obj("timeOffId" to string("The id from list_time_off"))

    override fun propose(ctx: ToolContext, input: RemoveTimeOffInput): Proposal = ctx.read { conn ->
        val id = parseUuid(input.timeOffId, "timeOffId")
        val ref = AvailabilityRepository.overrideRef(conn, ctx.access.businessId, id) ?: throw Errors.notFound("Time off")
        if (ref.resourceId == null) ctx.access.requireRole(Role.ADMIN) else ctx.access.requireResource(ref.resourceId)
        val all = AvailabilityRepository.overrides(conn, ctx.access.businessId, ref.resourceId, null)
        val o = all.first { it.id == id.toString() }
        val who = ref.resourceId?.let { ResourceRepository.get(conn, ctx.access.businessId, it)?.name } ?: "the whole business"
        val hours = ListTimeOff.hours(o) ?: "all day"
        val what = when {
            ref.resourceId == null -> "Reopen ${o.date}"
            o.isAvailable -> "Remove extra hours for $who on ${o.date}, $hours"
            else -> "Remove time off for $who on ${o.date}, $hours"
        }
        Proposal(
            title = if (ref.resourceId == null) "Reopen a closed date" else "Remove time off",
            summary = what,
            items = listOf(ProposalItem(what, o.reason)),
            warnings = listOfNotNull(
                "Those times become bookable online again.".takeIf { !o.isAvailable },
                "Those extra times stop being bookable (existing bookings stay).".takeIf { o.isAvailable },
            ),
            confirmLabel = "Remove",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: RemoveTimeOffInput): ActionResult {
        AvailabilityCommands.deleteOverride(run.conn, ctx.access, parseUuid(input.timeOffId, "timeOffId"), run.actor)
        return ActionResult("Removed it.", listOf(ActionLink("Open calendar", "calendar")))
    }
}
