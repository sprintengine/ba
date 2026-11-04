package ie.bookanything.assistant.tools

import ie.bookanything.audit.Actor
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.Role
import ie.bookanything.booking.BookingEngine
import ie.bookanything.booking.StaffBookingCommands
import ie.bookanything.business.AgentChangeKind
import ie.bookanything.db.Db
import ie.bookanything.payments.PaymentProvider
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import java.sql.Connection
import java.time.Clock
import java.time.Instant
import java.util.UUID

/**
 * One capability of the assistant. Each tool is a single registration (see [ToolRegistry]): a name, a description
 * that tells the model when to call it, a strict JSON [schema] with a typed [input] decoder, the minimum role, and a
 * handler that calls the existing commands. Tools run as the signed-in member: their role and resource scope apply.
 */
sealed interface AssistantTool<I : Any> {
    val name: String
    val description: String
    val input: KSerializer<I>
    val schema: JsonObject
    val minRole: Role

    /** Shown in the chat while the tool runs, e.g. "Checking the calendar". */
    val label: String
}

/** Looks things up. Never changes anything. */
interface ReadTool<I : Any> : AssistantTool<I> {
    fun run(ctx: ToolContext, input: I): ToolOutput
}

/**
 * Changes something, in two steps: [propose] validates and previews (the preview is stored as a pending action the
 * user must confirm); [execute] runs only when the user confirms, with the same input, in the confirming transaction.
 */
interface WriteTool<I : Any> : AssistantTool<I> {
    /** What kind of change it is: whether a member's AI app needs their approval for it is set per kind (section 20.8). */
    val changeKind: AgentChangeKind

    /** How many bookings [input] changes: a change to several bookings always needs approval from an AI app. */
    fun count(input: I): Int = 1

    fun propose(ctx: ToolContext, input: I): Proposal

    fun execute(ctx: ToolContext, run: Execution, input: I): ActionResult
}

/** The confirming transaction: the action being executed and the audit actor (`ai`, acting for the member). */
class Execution(val conn: Connection, val actionId: UUID, val actor: Actor)

/** Everything a tool may use. Reads run in their own read-only, tenant-scoped transaction. */
class ToolContext(
    private val db: Db,
    val access: BusinessAccess,
    private val clock: Clock,
    val engine: BookingEngine,
    val staff: StaffBookingCommands,
    val payments: PaymentProvider,
) {
    val business get() = access.business
    val now: Instant get() = clock.instant()

    fun <T> read(block: (Connection) -> T): T = db.txBlocking(access.businessId, readOnly = true, block)

    /** "1 appointment", "3 appointments": in the business's own words. */
    fun bookings(n: Int) = ToolViews.plural(n, business.vocabulary.booking.lowercase(), business.vocabulary.bookings.lowercase())

    /** "Client", "Patient": the business's word for a customer, capitalised for labels. */
    val customerLabel: String get() = business.vocabulary.customer.replaceFirstChar { it.uppercase() }
}

/** A read tool's answer: [data] goes to the model as JSON, [summary] is shown in the chat ("Found 3 bookings"). */
data class ToolOutput(val data: JsonElement, val summary: String)

/** What a write tool would do, rendered as a confirmation card. Every affected item of a bulk change is listed. */
@Serializable
data class Proposal(
    val title: String,
    val summary: String,
    val changes: List<ProposalChange> = emptyList(),
    val items: List<ProposalItem> = emptyList(),
    val warnings: List<String> = emptyList(),
    val confirmLabel: String = "Confirm",
    val destructive: Boolean = false,
)

@Serializable
data class ProposalChange(val label: String, val before: String?, val after: String?)

@Serializable
data class ProposalItem(val title: String, val detail: String?)

/** What happened when a proposal was confirmed. [links] are dashboard paths relative to `/dashboard/{slug}/`. */
@Serializable
data class ActionResult(val message: String, val links: List<ActionLink> = emptyList())

@Serializable
data class ActionLink(val label: String, val path: String)
