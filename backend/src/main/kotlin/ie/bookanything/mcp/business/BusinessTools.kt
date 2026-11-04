package ie.bookanything.mcp.business

import ie.bookanything.ai.JsonSchema
import ie.bookanything.assistant.actions.ActionRepository
import ie.bookanything.assistant.actions.ActionRow
import ie.bookanything.assistant.actions.ActionStatus
import ie.bookanything.assistant.tools.AssistantTool
import ie.bookanything.assistant.tools.ProposalChange
import ie.bookanything.assistant.tools.ProposalItem
import ie.bookanything.assistant.tools.ReadTool
import ie.bookanything.assistant.tools.ToolInputs
import ie.bookanything.assistant.tools.ToolRegistry
import ie.bookanything.assistant.tools.WriteTool
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.Role
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.formatInstant
import ie.bookanything.http.parseUuid
import ie.bookanything.mcp.McpResults
import ie.bookanything.mcp.McpTool
import ie.bookanything.mcp.READ_ONLY
import ie.bookanything.mcp.StrictArgs
import ie.bookanything.mcp.toolSchema
import ie.bookanything.oauth.Scope
import io.modelcontextprotocol.kotlin.sdk.types.Tool
import io.modelcontextprotocol.kotlin.sdk.types.ToolAnnotations
import io.modelcontextprotocol.kotlin.sdk.types.ToolSchema
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.serializer

/** Proposals a connected app may make, per grant: enough for a busy day, not for a runaway loop. */
val BUSINESS_MCP_PROPOSALS = RateLimiter.Limit("mcp-business-proposals", 60, 600)

/** Changes a member may confirm from connected apps, across all of them. */
val BUSINESS_MCP_CHANGES = RateLimiter.Limit("mcp-business-changes", 60, 600)

/**
 * The business MCP's tools (section 20.7): Bo's tools ([ToolRegistry]), each with a `business` argument, served to a
 * member's own AI app. They run as the member, with their role and staff scope, through the same commands as the
 * dashboard. Reads answer directly; writes only propose: the change is stored as a pending action and happens when the
 * app calls [CONFIRM] with its id, after showing it to the member. Adding a tool to Bo adds it here.
 */
object BusinessTools {
    const val BUSINESS_ARG = "business"
    const val CONFIRM = "confirm_action"
    const val CANCEL = "cancel_action"
    const val GET_PROPOSAL = "get_proposal"
    const val LIST_BUSINESSES = "list_my_businesses"

    private val PROPOSE = ToolAnnotations(readOnlyHint = false, destructiveHint = false, idempotentHint = false, openWorldHint = false)
    private val DESTRUCTIVE = ToolAnnotations(readOnlyHint = false, destructiveHint = true, idempotentHint = true, openWorldHint = false)
    private val UNDO = ToolAnnotations(readOnlyHint = false, destructiveHint = false, idempotentHint = true, openWorldHint = false)

    private const val PROPOSAL_NOTE =
        "Nothing has changed yet. Show the member this proposal (title, summary, changes, items and warnings) and ask them. " +
            "Only when they agree, call confirm_action with the proposalId; if they don't, call cancel_action. It expires at expiresAt."

    private const val APPROVAL_NOTE =
        "Nothing has changed yet, and you can't make it happen yourself: the member must approve it on bookanything. Show them " +
            "this proposal (title, summary, changes, items and warnings) and give them approvalUrl to open; they sign in and " +
            "approve or decline it there. Then call get_proposal with the proposalId to see what happened. It expires at expiresAt."

    private val businessProperty = JsonSchema.string(
        "The business: its slug or id from list_my_businesses. May be left out when you belong to just one business.",
    )

    /** Bo's own: its memory lives in Bo's prompt, which a connected app never sees. */
    private val BO_ONLY = setOf("update_memory")

    private fun all(registry: ToolRegistry): List<McpTool<BusinessToolContext>> =
        listOf(listBusinesses(), confirm(), cancel(), getProposal()) + registry.all.filterNot { it.name in BO_ONLY }.map(::wrap)

    /** Bo's descriptions refer to its chat (the context it's given, the confirmation card); an app has neither. */
    private val FOR_APPS = listOf(
        "(see Today in the context)" to "(list_my_businesses gives today's date there)",
        "until the user confirms the card in the app" to "until the user confirms",
    )

    private fun forApps(text: String) = FOR_APPS.fold(text) { t, (bo, app) -> t.replace(bo, app) }

    /** Every tool, for scope checks (the route's 403) and the tool-list snapshot. */
    val ALL: List<McpTool<BusinessToolContext>> = all(ToolRegistry.DEFAULT)

    private val byName = ALL.associateBy { it.name }
    private val minRoles: Map<String, Role> = ToolRegistry.DEFAULT.all.associate { it.name to it.minRole }

    fun scopeFor(toolName: String): Scope? = byName[toolName]?.scope

    /** The tools a member whose highest role is [role] may use; none without a membership but listing their businesses. */
    fun forRole(role: Role?): List<McpTool<BusinessToolContext>> = ALL.filter { t ->
        val min = minRoles[t.name] ?: return@filter t.name == LIST_BUSINESSES || role != null
        role != null && role.atLeast(min)
    }

    // --- Bo's tools, adapted ---

    private fun wrap(tool: AssistantTool<*>): McpTool<BusinessToolContext> = when (tool) {
        is ReadTool<*> -> McpTool(definition(tool, READ_ONLY), Scope.BUSINESS_READ) { args ->
            val (access, input) = resolve(tool, args)
            val out = withContext(Dispatchers.IO) { ToolInputs.readAny(tool, ctx.assistant.toolContexts.forMember(access), input) }
            JsonObject(
                mapOf(
                    BUSINESS_ARG to JsonPrimitive(access.business.slug), "summary" to JsonPrimitive(out.summary),
                    "data" to out.data,
                ),
            )
        }
        is WriteTool<*> -> McpTool(definition(tool, PROPOSE), Scope.BUSINESS_WRITE) { args ->
            limit(BUSINESS_MCP_PROPOSALS)
            val (access, input) = resolve(tool, args)
            val proposal = withContext(Dispatchers.IO) { ToolInputs.proposeAny(tool, ctx.assistant.toolContexts.forMember(access), input) }
            val approval = ctx.assistant.actions.needsApproval(access, tool, input)
            val row = withContext(Dispatchers.IO) { ctx.assistant.actions.storeForApp(access, app, tool.name, input, proposal, approval) }
            McpResults.encode(
                serializer(),
                ProposalResult(
                    row.id.toString(), access.business.slug, if (approval) AWAITING_APPROVAL else AWAITING_CONFIRMATION, proposal.title,
                    proposal.summary, proposal.changes, proposal.items, proposal.warnings, proposal.destructive,
                    formatInstant(row.expiresAt, access.business.zone), approvalUrl(access, row).takeIf { approval },
                    if (approval) APPROVAL_NOTE else PROPOSAL_NOTE,
                ),
            )
        }
    }

    /** The business the call names (checked live) and the tool's own input, with `business` taken out. */
    private suspend fun BusinessToolContext.resolve(tool: AssistantTool<*>, args: JsonObject): Pair<BusinessAccess, JsonObject> {
        val ref = when (val v = args[BUSINESS_ARG]) {
            null, is kotlinx.serialization.json.JsonNull -> null
            is JsonPrimitive -> v.takeIf { it.isString }?.content ?: throw Errors.field(BUSINESS_ARG, "Must be a string")
            else -> throw Errors.field(BUSINESS_ARG, "Must be a string")
        }
        val access = access(ref)
        if (!access.role.atLeast(tool.minRole)) {
            throw Errors.forbidden("${tool.name} is for admins and owners; you're ${article(access.role)} at ${access.business.name}.")
        }
        return access to JsonObject(args - BUSINESS_ARG)
    }

    private fun article(role: Role) = if (role == Role.OWNER || role == Role.ADMIN) "an ${role.value}" else "a ${role.value} member"

    /**
     * Bo's definition for an MCP client: the `business` argument added, and the optional (nullable) properties left
     * out of `required`, since a missing nullable value reads as null.
     */
    private fun definition(tool: AssistantTool<*>, annotations: ToolAnnotations): Tool {
        val bo = tool.schema["properties"] as JsonObject
        val properties = kotlinx.serialization.json.Json.parseToJsonElement(forApps(bo.toString())) as JsonObject
        val required = (tool.schema["required"] as JsonArray).map { it.jsonPrimitive.content }.filterNot { isNullable(properties[it]) }
        val role = if (tool.minRole == Role.STAFF) "" else " Admins and owners only."
        val flow = if (tool is WriteTool<*>) {
            " Returns a proposal: nothing changes until the member approves it on bookanything (its approvalUrl) or, for a " +
                "change their business lets apps make, you call $CONFIRM with its id."
        } else {
            ""
        }
        return Tool(
            name = tool.name,
            title = tool.name.replace('_', ' ').replaceFirstChar { it.uppercase() },
            description = forApps(tool.description) + role + flow,
            inputSchema = ToolSchema(
                properties = JsonObject(linkedMapOf<String, JsonElement>(BUSINESS_ARG to businessProperty) + properties),
                required = required,
            ),
            annotations = annotations,
        )
    }

    private fun isNullable(schema: JsonElement?): Boolean =
        ((schema as? JsonObject)?.get("type") as? JsonArray)?.any { (it as? JsonPrimitive)?.content == "null" } == true

    // --- Businesses and proposals ---

    private fun listBusinesses() = McpTool<BusinessToolContext>(
        Tool(
            name = LIST_BUSINESSES,
            title = "List my businesses",
            description = "The businesses you're a member of on bookanything: slug, name, your role there, its timezone and " +
                "today's date there, and whether its owner lets you use AI apps there. Pass the slug as `business` to the other tools " +
                "(it may be left out when there is only one).",
            inputSchema = toolSchema(),
            annotations = READ_ONLY,
        ),
        Scope.BUSINESS_READ,
    ) { _ ->
        McpResults.encode(
            serializer(),
            MyBusinesses(
                businesses.map {
                    val zone = runCatching { java.time.ZoneId.of(it.timezone) }.getOrDefault(java.time.ZoneOffset.UTC)
                    MyBusiness(
                        it.slug, it.name, it.role.value, it.timezone, java.time.LocalDate.ofInstant(ctx.now(), zone).toString(),
                        it.agentsAllowed, "${ctx.config.appBaseUrl}/dashboard/${it.slug}",
                    )
                },
            ),
        )
    }

    private fun confirm() = McpTool<BusinessToolContext>(
        Tool(
            name = CONFIRM,
            title = "Confirm a proposal",
            description = "Carries out a proposal you made (a booking, move, cancellation, blocked time, …) exactly as proposed, when " +
                "its status is awaiting_confirmation. Only call it after showing the proposal to the member and getting their clear " +
                "agreement. A proposal awaiting_approval doesn't go ahead this way: the member approves it on bookanything at its " +
                "approvalUrl. Confirming twice returns the first result. A proposal can't be confirmed after it expires or if the " +
                "time was taken meanwhile.",
            inputSchema = toolSchema(listOf("proposalId")) { string("proposalId", "The proposalId a tool returned") },
            annotations = DESTRUCTIVE,
        ),
        Scope.BUSINESS_WRITE,
    ) { args ->
        val (id, access) = proposal(args)
        limitUser(BUSINESS_MCP_CHANGES)
        outcome(ctx.db.tx(access.businessId) { conn -> ctx.assistant.actions.confirmRow(conn, access, id, app) }, access)
    }

    private fun cancel() = McpTool<BusinessToolContext>(
        Tool(
            name = CANCEL,
            title = "Drop a proposal",
            description = "Drops a proposal the member doesn't want, so it can't be confirmed later. Nothing changes.",
            inputSchema = toolSchema(listOf("proposalId")) { string("proposalId", "The proposalId a tool returned") },
            annotations = UNDO,
        ),
        Scope.BUSINESS_WRITE,
    ) { args ->
        val (id, access) = proposal(args)
        outcome(ctx.db.tx(access.businessId) { conn -> ctx.assistant.actions.rejectRow(conn, access, id, app) }, access)
    }

    private fun getProposal() = McpTool<BusinessToolContext>(
        Tool(
            name = GET_PROPOSAL,
            title = "Check a proposal",
            description = "Where a proposal you made stands: awaiting_approval (the member hasn't approved it on bookanything yet; " +
                "approvalUrl is the link to give them), awaiting_confirmation, confirmed (with what was done), rejected, expired or " +
                "failed. Use it after the member says they've approved or declined it.",
            inputSchema = toolSchema(listOf("proposalId")) { string("proposalId", "The proposalId a tool returned") },
            annotations = READ_ONLY,
        ),
        Scope.BUSINESS_READ,
    ) { args ->
        val (id, access) = proposal(args)
        val row =
            ctx.db.read(access.businessId) { conn -> ActionRepository.get(conn, access.businessId, id) }
                ?: throw Errors.notFound("Proposal")
        outcome(row, access)
    }

    private const val AWAITING_APPROVAL = "awaiting_approval"
    private const val AWAITING_CONFIRMATION = "awaiting_confirmation"

    /** Where the member approves or declines [row] on bookanything (signed in, in the dashboard). */
    private fun BusinessToolContext.approvalUrl(access: BusinessAccess, row: ActionRow) =
        "${ctx.config.appBaseUrl}/dashboard/${access.business.slug}/approvals/${row.id}"

    /** The proposal [args] names, if this app made it, and the member's live access to its business. */
    private suspend fun BusinessToolContext.proposal(args: JsonObject): Pair<java.util.UUID, BusinessAccess> {
        val input = StrictArgs.decode(serializer<ProposalArgs>(), args)
        val id = parseUuid(input.proposalId, "proposalId")
        val businessId = ctx.db.read { conn -> ActionRepository.businessOfGrantAction(conn, id, principal.grantId) }
            ?: throw Errors.notFound("Proposal")
        return id to access(businessId)
    }

    private fun BusinessToolContext.outcome(row: ActionRow, access: BusinessAccess): JsonElement {
        val status = row.effectiveStatus(ctx.now())
        val waiting = status == ActionStatus.PENDING
        return McpResults.encode(
            serializer(),
            ProposalOutcome(
                row.id.toString(), access.business.slug,
                when {
                    !waiting -> status.key
                    row.needsApproval -> AWAITING_APPROVAL
                    else -> AWAITING_CONFIRMATION
                },
                row.proposal.title,
                message = row.result?.message ?: row.error ?: if (waiting && row.needsApproval) {
                    "Nothing has changed yet: the member must approve it on bookanything. Give them approvalUrl, then check again " +
                        "with get_proposal."
                } else {
                    null
                },
                approvalUrl = approvalUrl(access, row).takeIf { waiting && row.needsApproval },
                links = row.result?.links.orEmpty().map {
                    OutcomeLink(it.label, "${ctx.config.appBaseUrl}/dashboard/${access.business.slug}/${it.path.trimStart('/')}")
                },
            ),
        )
    }
}

@Serializable
private data class ProposalArgs(val proposalId: String)

@Serializable
data class MyBusinesses(val businesses: List<MyBusiness>)

@Serializable
data class MyBusiness(
    val slug: String,
    val name: String,
    /** owner | admin | staff */
    val role: String,
    /** IANA zone: every date and time the tools take or give is in it. */
    val timezone: String,
    /** Today's date in [timezone], YYYY-MM-DD. */
    val today: String,
    /** False when its owner doesn't let you use AI apps there: the other tools refuse it. */
    val aiAgentsAllowed: Boolean,
    val dashboardUrl: String,
)

@Serializable
data class ProposalResult(
    val proposalId: String,
    val business: String,
    /**
     * awaiting_approval (the member approves it on bookanything at [approvalUrl]) | awaiting_confirmation (call
     * confirm_action once they agree)
     */
    val status: String,
    val title: String,
    val summary: String,
    val changes: List<ProposalChange>,
    val items: List<ProposalItem>,
    val warnings: List<String>,
    /** Cancels, refunds or removes something. */
    val destructive: Boolean,
    val expiresAt: String,
    /** Where the member approves or declines it, signed in on bookanything; null when the app may confirm it. */
    val approvalUrl: String?,
    val next: String,
)

@Serializable
data class ProposalOutcome(
    val proposalId: String,
    val business: String,
    /** confirmed | failed | rejected | expired | awaiting_approval | awaiting_confirmation */
    val status: String,
    val title: String,
    val message: String?,
    /** While it awaits the member's approval: where they approve it. */
    val approvalUrl: String?,
    val links: List<OutcomeLink>,
)

@Serializable
data class OutcomeLink(val label: String, val url: String)
