package ie.bookanything.assistant.tools

import ie.bookanything.ai.JsonSchema.array
import ie.bookanything.ai.JsonSchema.integer
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.auth.Role
import ie.bookanything.availability.AvailabilityCommands
import ie.bookanything.availability.AvailabilityRepository
import ie.bookanything.availability.AvailabilityRuleDto
import ie.bookanything.availability.AvailabilityRuleInput
import ie.bookanything.availability.ValidRule
import ie.bookanything.availability.validateRules
import ie.bookanything.business.AgentChangeKind
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.http.parseUuid
import ie.bookanything.resources.ResourceRepository
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer
import java.sql.Connection
import java.util.UUID

@Serializable
data class IntervalInput(val start: String, val end: String)

@Serializable
data class DayHoursInput(val dayOfWeek: Int, val intervals: List<IntervalInput>)

@Serializable
data class OpeningHoursInput(val resourceIds: List<String>, val days: List<DayHoursInput>)

/**
 * Changes the weekly hours of some days for one or more resources; other days keep their rules (including customer
 * group windows and date ranges). Every resource/day change is listed before confirming.
 */
object UpdateOpeningHours : WriteTool<OpeningHoursInput> {
    override val name = "update_opening_hours"
    override val label = "Preparing new opening hours"
    override val minRole = Role.STAFF
    override val input = serializer<OpeningHoursInput>()
    override val changeKind = AgentChangeKind.SETTINGS
    override val description =
        "Proposes new weekly hours for some days of the week, for one or more resources (e.g. \"we close at 1pm on " +
            "Fridays from now on\"). Only the days given change; an empty intervals list means closed that day. Staff can only change " +
            "their own " +
            "hours. Nothing changes until the user confirms."
    override val schema = obj(
        "resourceIds" to array(string("Resource id from list_resources"), "The resources whose hours change (1 to 20)"),
        "days" to array(
            obj(
                "dayOfWeek" to integer("1 = Monday … 7 = Sunday"),
                "intervals" to array(obj("start" to string("HH:mm"), "end" to string("HH:mm")), "Open periods that day; [] = closed"),
            ),
            "The days to change",
        ),
    )

    private data class Plan(val resourceId: UUID, val name: String, val before: List<AvailabilityRuleDto>, val after: List<ValidRule>)

    /** The requested change, validated without touching the database. */
    private class Request(val ids: List<UUID>, val days: Set<Int>, val newRules: List<ValidRule>)

    private fun validate(input: OpeningHoursInput): Request {
        val ids = input.resourceIds.distinct().map { parseUuid(it, "resourceIds") }
        if (ids.isEmpty() || ids.size > 20) throw Errors.field("resourceIds", "Give between 1 and 20 resources")
        val days = input.days.associateBy { it.dayOfWeek }
        if (days.isEmpty() || days.keys.any { it !in 1..7 }) throw Errors.field("days", "Give days 1 (Monday) to 7 (Sunday)")
        val v = Validator()
        val newRules = validateRules(
            days.values.flatMap { d -> d.intervals.map { AvailabilityRuleInput(d.dayOfWeek, it.start, it.end) } }, v,
        )
        v.throwIfInvalid()
        return Request(ids, days.keys, newRules)
    }

    private fun plan(ctx: ToolContext, conn: Connection, r: Request): List<Plan> {
        val days = r.days
        val newRules = r.newRules
        return r.ids.map { id ->
            AvailabilityCommands.requireResource(conn, ctx.access, id)
            val before = AvailabilityRepository.rules(conn, ctx.access.businessId, id)
            val kept = before.filter { it.dayOfWeek !in days }.map { rule ->
                val kv = Validator()
                validateRules(
                    listOf(
                        AvailabilityRuleInput(
                            rule.dayOfWeek, rule.startTime, rule.endTime, rule.validFrom, rule.validUntil,
                            rule.audienceGroupIds,
                        ),
                    ),
                    kv,
                ).single()
            }
            Plan(id, ResourceRepository.get(conn, ctx.access.businessId, id)!!.name, before, kept + newRules)
        }
    }

    override fun propose(ctx: ToolContext, input: OpeningHoursInput): Proposal {
        val request = validate(input)
        val plans = ctx.read { conn -> plan(ctx, conn, request) }
        val days = input.days.map { it.dayOfWeek }.distinct().sorted()
        val items = plans.flatMap { p ->
            days.map { d ->
                val before = p.before.filter { it.dayOfWeek == d }.sortedBy { it.startTime }.joinToString(", ") {
                    "${it.startTime}–${it.endTime}"
                }.ifEmpty { "closed" }
                val after = p.after.filter { it.dayOfWeek == d }.sortedBy { it.start }
                    .joinToString(", ") { "${it.start}–${it.end}" }.ifEmpty { "closed" }
                ProposalItem("${p.name} · ${ListResources.DAY_NAMES[d - 1]}", "$before → $after")
            }
        }
        val dropped = plans.any { p ->
            p.before.any { it.dayOfWeek in days && (it.audienceGroupIds.isNotEmpty() || it.validFrom != null || it.validUntil != null) }
        }
        return Proposal(
            title = "Change opening hours",
            summary = "New hours on ${days.joinToString(", ") { ListResources.DAY_NAMES[it - 1] }} for " +
                "${plans.joinToString(", ") { it.name }}",
            items = items,
            warnings = listOfNotNull(
                "Existing bookings are not moved; bookings outside the new hours stay booked.",
                "Customer-group windows and date ranges on these days are replaced by the new hours.".takeIf { dropped },
            ),
            confirmLabel = "Update hours",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: OpeningHoursInput): ActionResult {
        val plans = plan(ctx, run.conn, validate(input))
        plans.forEach { AvailabilityCommands.replaceRules(run.conn, ctx.access, it.resourceId, it.after, run.actor) }
        return ActionResult(
            "Updated the hours for ${plans.joinToString(", ") { it.name }}.", listOf(ActionLink("Open resources", "resources")),
        )
    }
}
