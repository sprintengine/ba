package ie.bookanything.assistant.tools

import ie.bookanything.ai.JsonSchema.enum
import ie.bookanything.ai.JsonSchema.integer
import ie.bookanything.ai.JsonSchema.nullable
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.assistant.memory.MemoryCommands
import ie.bookanything.assistant.memory.MemoryRepository
import ie.bookanything.auth.Role
import ie.bookanything.availability.AvailabilityCommands
import ie.bookanything.availability.AvailabilityOverrideInput
import ie.bookanything.availability.ValidOverride
import ie.bookanything.availability.validateOverride
import ie.bookanything.booking.BookingFilter
import ie.bookanything.booking.BookingStatus
import ie.bookanything.business.AgentChangeKind
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.http.parseUuid
import ie.bookanything.resources.ResourceRepository
import ie.bookanything.services.ServiceCommands
import ie.bookanything.services.ServiceRepository
import ie.bookanything.services.toInput
import ie.bookanything.services.validateService
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer
import java.time.LocalDate

@Serializable
data class BlockTimeInput(val resourceId: String, val date: String, val startTime: String?, val endTime: String?, val reason: String?)

/** Validates a time-off or closure override (the same rules as the settings API). */
private fun override(date: String, start: String?, end: String?, reason: String?, closure: Boolean): ValidOverride {
    val v = Validator()
    val o = validateOverride(AvailabilityOverrideInput(date, false, start, end, reason), v, closure)
    v.throwIfInvalid()
    return o!!
}

/** Bookings on [date] (optionally one resource, optionally only those overlapping start–end) that stay booked. */
private fun affected(
    ctx: ToolContext, date: LocalDate, resourceIds: List<java.util.UUID>, o: ValidOverride,
): List<ProposalItem> = ctx.read { conn ->
    ctx.staff.list(conn, ctx.access, BookingFilter(date, date, BookingStatus.BLOCKING.toList(), resourceIds, limit = 100))
}.filter { b ->
    val zone = ctx.business.zone
    o.start == null || (b.start.atZone(zone).toLocalTime() < o.end!! && b.end.atZone(zone).toLocalTime() > o.start)
}.map { ProposalItem(bookingLine(it, ctx), "Stays booked: move or cancel it if needed") }

private fun window(o: ValidOverride) = if (o.start != null && o.end != null) "${o.start}–${o.end}" else "all day"

object BlockTime : WriteTool<BlockTimeInput> {
    override val name = "block_time"
    override val label = "Preparing time off"
    override val minRole = Role.STAFF
    override val input = serializer<BlockTimeInput>()
    override val changeKind = AgentChangeKind.TIME_OFF
    override val description =
        "Proposes blocking time for one resource on one date (time off, a meeting, maintenance): no new bookings can " +
            "be made then. Existing bookings are listed and stay booked. Staff can only block their own time. Nothing changes until " +
            "confirmed."
    override val schema = obj(
        "resourceId" to string("Resource id from list_resources"),
        "date" to string("YYYY-MM-DD"),
        "startTime" to nullable(string("HH:mm, or null for the whole day")),
        "endTime" to nullable(string("HH:mm, or null for the whole day")),
        "reason" to nullable(string("Short note, e.g. Dentist, or null")),
    )

    override fun propose(ctx: ToolContext, input: BlockTimeInput): Proposal {
        val resourceId = parseUuid(input.resourceId, "resourceId")
        val o = override(input.date, input.startTime, input.endTime, input.reason, closure = false)
        val resource = ctx.read { conn ->
            AvailabilityCommands.requireResource(conn, ctx.access, resourceId)
            ResourceRepository.get(conn, ctx.access.businessId, resourceId)!!
        }
        val items = affected(ctx, o.date, listOf(resourceId), o)
        return Proposal(
            title = "Block time",
            summary = "${resource.name} unavailable on " +
                "${ToolViews.day(o.date.atStartOfDay(ctx.business.zone).toInstant(), ctx.business.zone)}, ${window(o)}",
            changes = listOfNotNull(
                ProposalChange("Unavailable", null, "${o.date} · ${window(o)}"),
                o.reason?.let { ProposalChange("Reason", null, it) },
            ),
            items = items,
            warnings = listOfNotNull("${ctx.bookings(items.size)} already in this time will stay booked.".takeIf { items.isNotEmpty() }),
            confirmLabel = "Block time",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: BlockTimeInput): ActionResult {
        val o = override(input.date, input.startTime, input.endTime, input.reason, closure = false)
        AvailabilityCommands.addOverride(run.conn, ctx.access, parseUuid(input.resourceId, "resourceId"), o, run.actor)
        return ActionResult("Blocked ${o.date}, ${window(o)}.", listOf(ActionLink("Open calendar", "calendar?date=${o.date}")))
    }
}

@Serializable
data class CloseDateInput(val date: String, val reason: String?)

object CloseDate : WriteTool<CloseDateInput> {
    override val name = "close_date"
    override val label = "Preparing a closure"
    override val minRole = Role.ADMIN
    override val input = serializer<CloseDateInput>()
    override val changeKind = AgentChangeKind.TIME_OFF
    override val description = "Proposes closing the whole business for one date (bank holiday, training day): nobody can book that day. " +
        "Every existing booking that day is listed and stays booked (cancel them separately if asked). Nothing changes until confirmed."
    override val schema = obj(
        "date" to string("YYYY-MM-DD"),
        "reason" to nullable(string("Shown to the team, e.g. Bank holiday, or null")),
    )

    override fun propose(ctx: ToolContext, input: CloseDateInput): Proposal {
        ctx.access.requireRole(Role.ADMIN)
        val o = override(input.date, null, null, input.reason, closure = true)
        val items = affected(ctx, o.date, emptyList(), o)
        return Proposal(
            title = "Close for the day",
            summary = "Close ${ctx.business.name} on " +
                "${ToolViews.day(o.date.atStartOfDay(ctx.business.zone).toInstant(), ctx.business.zone)}",
            changes = listOfNotNull(
                ProposalChange("Closed", null, o.date.toString()),
                o.reason?.let { ProposalChange("Reason", null, it) },
            ),
            items = items,
            warnings = listOfNotNull("${ctx.bookings(items.size)} on this day will stay booked.".takeIf { items.isNotEmpty() }),
            confirmLabel = "Close this day",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: CloseDateInput): ActionResult {
        val o = override(input.date, null, null, input.reason, closure = true)
        AvailabilityCommands.addClosure(run.conn, ctx.access, o, run.actor)
        return ActionResult("Closed on ${o.date}.", listOf(ActionLink("Open calendar", "calendar?date=${o.date}")))
    }
}

@Serializable
data class UpdateServiceInput(val serviceId: String, val priceCents: Int?, val durationMinutes: Int?)

object UpdateService : WriteTool<UpdateServiceInput> {
    override val name = "update_service"
    override val label = "Preparing a service change"
    override val minRole = Role.ADMIN
    override val input = serializer<UpdateServiceInput>()
    override val changeKind = AgentChangeKind.SETTINGS
    override val description = "Proposes changing a service's base price and/or duration. Existing bookings keep their price and time. " +
        "Nothing changes until the user confirms."
    override val schema = obj(
        "serviceId" to string("Service id from list_services"),
        "priceCents" to nullable(integer("New price in minor units (EUR 45.00 = 4500), or null to keep")),
        "durationMinutes" to nullable(integer("New length in minutes (multiple of 5), or null to keep")),
    )

    override fun propose(ctx: ToolContext, input: UpdateServiceInput): Proposal {
        ctx.access.requireRole(Role.ADMIN)
        if (input.priceCents == null && input.durationMinutes == null) throw Errors.invalid("Give a new price or duration.")
        val s = ctx.read { conn ->
            ServiceRepository.get(conn, ctx.access.businessId, parseUuid(input.serviceId, "serviceId"))
        } ?: throw Errors.notFound("Service")
        val updated = s.toInput().copy(
            priceCents = input.priceCents ?: s.priceCents, durationMinutes = input.durationMinutes ?: s.durationMinutes,
        )
        validateService(updated).throwIfInvalid()
        val money = { c: Int -> ToolViews.money(c, ctx.business.currency) }
        return Proposal(
            title = "Update ${s.name}",
            summary = listOfNotNull(
                input.priceCents?.let { "price ${money(s.priceCents)} → ${money(it)}" },
                input.durationMinutes?.let { "length ${s.durationMinutes} → $it min" },
            ).joinToString(", ").replaceFirstChar { it.uppercase() },
            changes = listOfNotNull(
                input.priceCents?.let { ProposalChange("Price", money(s.priceCents), money(it)) },
                input.durationMinutes?.let { ProposalChange("Length", "${s.durationMinutes} min", "$it min") },
            ),
            warnings = listOfNotNull(
                "Existing bookings keep their price and time.",
                "This service has options with their own prices and lengths; only the base changes.".takeIf { s.options.isNotEmpty() },
            ),
            confirmLabel = "Update service",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: UpdateServiceInput): ActionResult {
        val id = parseUuid(input.serviceId, "serviceId")
        val s = ServiceRepository.get(run.conn, ctx.access.businessId, id) ?: throw Errors.notFound("Service")
        val updated = s.toInput().copy(
            priceCents = input.priceCents ?: s.priceCents, durationMinutes = input.durationMinutes ?: s.durationMinutes,
        )
        ServiceCommands.update(run.conn, ctx.access, id, updated, run.actor)
        return ActionResult("Updated ${s.name}.", listOf(ActionLink("Open services", "services")))
    }
}

@Serializable
enum class MemoryAction { @SerialName("add") ADD, @SerialName("update") UPDATE, @SerialName("delete") DELETE }

@Serializable
data class MemoryToolInput(val action: MemoryAction, val memoryId: String?, val text: String?)

object UpdateMemory : WriteTool<MemoryToolInput> {
    override val name = "update_memory"
    override val label = "Preparing a memory change"
    override val minRole = Role.ADMIN
    override val input = serializer<MemoryToolInput>()
    override val changeKind = AgentChangeKind.SETTINGS
    override val description =
        "Proposes adding, changing or removing one entry of the business memory (facts and preferences you are told " +
            "to remember, e.g. \"we close early on Fridays\"). Call it when the user asks you to remember or forget something. Needs " +
            "confirmation."
    override val schema = obj(
        "action" to enum(listOf("add", "update", "delete"), "What to do"),
        "memoryId" to nullable(string("Entry id for update or delete (from the business memory in the context), else null")),
        "text" to nullable(string("The fact to remember (≤ ${MemoryCommands.MAX_LENGTH} characters) for add or update, else null")),
    )

    override fun propose(ctx: ToolContext, input: MemoryToolInput): Proposal {
        ctx.access.requireRole(Role.ADMIN)
        if (input.action == MemoryAction.ADD) {
            val text = MemoryCommands.text(input.text)
            return Proposal("Remember this", text, listOf(ProposalChange("Memory", null, text)), confirmLabel = "Remember")
        }
        val id = parseUuid(input.memoryId, "memoryId")
        val row = ctx.read { conn -> MemoryRepository.get(conn, ctx.access.businessId, id) } ?: throw Errors.notFound("Memory")
        return when (input.action) {
            MemoryAction.UPDATE -> MemoryCommands.text(input.text).let { text ->
                Proposal("Update memory", text, listOf(ProposalChange("Memory", row.text, text)), confirmLabel = "Update")
            }
            else -> Proposal(
                "Forget this", row.text, listOf(ProposalChange("Memory", row.text, null)), confirmLabel = "Forget", destructive = true,
            )
        }
    }

    override fun execute(ctx: ToolContext, run: Execution, input: MemoryToolInput): ActionResult = when (input.action) {
        MemoryAction.ADD -> ActionResult("I'll remember: ${MemoryCommands.add(run.conn, ctx.access, input.text, run.actor, ctx.now).text}")
        MemoryAction.UPDATE ->
            ActionResult(
                "Updated: ${MemoryCommands.update(run.conn, ctx.access, parseUuid(input.memoryId, "memoryId"), input.text, run.actor, ctx.now).text}",
            )
        MemoryAction.DELETE -> {
            MemoryCommands.delete(run.conn, ctx.access, parseUuid(input.memoryId, "memoryId"), run.actor)
            ActionResult("Forgotten.")
        }
    }
}
