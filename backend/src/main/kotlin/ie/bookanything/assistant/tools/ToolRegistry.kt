package ie.bookanything.assistant.tools

import ie.bookanything.ai.ToolSpec
import ie.bookanything.auth.Role

/**
 * The assistant's tools. Adding a tool is one entry in [DEFAULT]. The list offered to the model depends only on the
 * member's role and is sorted by name, so it is identical across requests (it sits in the cached prompt prefix).
 */
class ToolRegistry(tools: List<AssistantTool<*>>) {
    private val byName: Map<String, AssistantTool<*>> = tools.associateBy { it.name }

    init {
        require(byName.size == tools.size) { "Duplicate assistant tool names" }
        require(tools.all { NAME.matches(it.name) }) { "Tool names must match $NAME" }
    }

    val all: List<AssistantTool<*>> = tools.sortedBy { it.name }

    /** Tools a member with [role] may use. Others are not offered at all (and refused if requested anyway). */
    fun available(role: Role): List<AssistantTool<*>> = all.filter { role.atLeast(it.minRole) }

    fun specs(role: Role): List<ToolSpec> = available(role).map { ToolSpec(it.name, it.description, it.schema) }

    fun find(name: String): AssistantTool<*>? = byName[name]

    companion object {
        private val NAME = Regex("^[a-z][a-z0-9_]{1,63}$")

        val DEFAULT = ToolRegistry(
            listOf(
                // Read
                GetSchedule, FindBookings, FindCustomers, CheckAvailability, GetOverview, ListServices, ListResources, GetPolicies,
                GetStats, GetBooking, GetCustomer, ListTimeOff, ListDeals,
                // Write (proposal first)
                CreateBooking, RescheduleBooking, CancelBookings, SendPaymentLink, BlockTime, CloseDate, UpdateOpeningHours, UpdateService,
                UpdateMemory, ApproveBookings, DeclineBooking, SetBookingOutcome, MarkPaidInPerson, UpdateBookingNotes, CreateCustomer,
                UpdateCustomer, RemoveTimeOff, PauseOrResumeDeal,
            ),
        )
    }
}
