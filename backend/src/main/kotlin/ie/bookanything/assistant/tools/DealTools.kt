package ie.bookanything.assistant.tools

import ie.bookanything.ai.JsonSchema.enum
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.auth.Role
import ie.bookanything.business.AgentChangeKind
import ie.bookanything.http.parseUuid
import ie.bookanything.offers.OfferService
import ie.bookanything.offers.OfferStatus
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer

// Deals (section 19) as the Deals page lists them, and pausing or resuming one. Creating and editing a deal's rules stay
// in the dashboard, where the preview shows which times it discounts.

@Serializable
data class DealView(
    val id: String,
    val name: String,
    /** "20% off" */
    val discount: String,
    /** "Tue and Wed, 14:00–17:00" */
    val `when`: String,
    /** active | paused */
    val status: String,
    val redemptions: Int,
    val validFrom: String?,
    val validUntil: String?,
)

@Serializable
data class DealList(val deals: List<DealView>)

object ListDeals : ReadTool<NoInput> {
    override val name = "list_deals"
    override val label = "Checking deals"
    override val minRole = Role.ADMIN
    override val input = serializer<NoInput>()
    override val description = "The business's deals: what each discounts and when, whether it's active or paused, and how many " +
        "bookings used it."
    override val schema = obj()

    override fun run(ctx: ToolContext, input: NoInput): ToolOutput {
        val deals = ctx.read { conn -> OfferService.list(conn, ctx.business) }.map {
            DealView(it.id, it.name, it.label, it.summary, it.status, it.redemptions, it.validFrom, it.validUntil)
        }
        return ToolViews.output(serializer(), DealList(deals), "Found ${ToolViews.plural(deals.size, "deal")}")
    }
}

@Serializable
enum class DealSwitch(val status: OfferStatus, val verb: String) {
    @SerialName("pause") PAUSE(OfferStatus.PAUSED, "Pause"),
    @SerialName("resume") RESUME(OfferStatus.ACTIVE, "Resume"),
}

@Serializable
data class DealSwitchInput(val dealId: String, val action: DealSwitch)

object PauseOrResumeDeal : WriteTool<DealSwitchInput> {
    override val name = "pause_or_resume_deal"
    override val label = "Preparing a deal change"
    override val minRole = Role.ADMIN
    override val input = serializer<DealSwitchInput>()
    override val changeKind = AgentChangeKind.SETTINGS
    override val description = "Proposes pausing a deal (it stops discounting new bookings; booked prices stay) or resuming a " +
        "paused one. Nothing changes until the user confirms."
    override val schema = obj(
        "dealId" to string("Deal id from list_deals"),
        "action" to enum(listOf("pause", "resume"), "pause or resume"),
    )

    override fun propose(ctx: ToolContext, input: DealSwitchInput): Proposal = ctx.read { conn ->
        val deal = OfferService.get(conn, ctx.business, parseUuid(input.dealId, "dealId"))
        val target = input.action.status.value
        if (deal.status == target) throw ie.bookanything.http.Errors.policy("${deal.name} is already $target.")
        Proposal(
            title = "${input.action.verb} deal",
            summary = "${input.action.verb} ${deal.name} (${deal.label}, ${deal.summary})",
            changes = listOf(ProposalChange("Status", deal.status, target)),
            confirmLabel = input.action.verb,
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: DealSwitchInput): ActionResult {
        val id = parseUuid(input.dealId, "dealId")
        val deal = OfferService.setStatus(run.conn, ctx.business, id, input.action.status, run.actor, ctx.now)
        return ActionResult("${deal.name} is now ${deal.status}.", listOf(ActionLink("Open deals", "offers")))
    }
}
