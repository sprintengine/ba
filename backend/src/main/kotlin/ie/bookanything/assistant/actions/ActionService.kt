package ie.bookanything.assistant.actions

import ie.bookanything.ai.ChatBlock
import ie.bookanything.ai.ChatRole
import ie.bookanything.assistant.AssistantPrompt
import ie.bookanything.assistant.ConversationRepository
import ie.bookanything.assistant.MessageKind
import ie.bookanything.assistant.tools.ActionResult
import ie.bookanything.assistant.tools.Execution
import ie.bookanything.assistant.tools.Proposal
import ie.bookanything.assistant.tools.ProposalStore
import ie.bookanything.assistant.tools.ToolContext
import ie.bookanything.assistant.tools.ToolContexts
import ie.bookanything.assistant.tools.ToolInputs
import ie.bookanything.assistant.tools.ToolRegistry
import ie.bookanything.assistant.tools.WriteTool
import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.db.Db
import ie.bookanything.db.savepoint
import ie.bookanything.http.ApiException
import ie.bookanything.http.Errors
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.notifications.inbox.InboxKind
import ie.bookanything.notifications.inbox.NewNotification
import kotlinx.serialization.json.JsonObject
import java.sql.Connection
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Who is deciding a proposal: the member in Bo's chat (in the dashboard); one of the member's connected apps on the
 * business MCP, deciding its own proposal through its grant (section 20.7); or the member, signed in on bookanything,
 * approving or declining one of their apps' proposals (section 20.8).
 */
sealed interface ActionOrigin {
    data object Chat : ActionOrigin
    data class App(val grantId: UUID, val clientId: String) : ActionOrigin
    data object Approval : ActionOrigin
}

/**
 * Proposals from write tools: stored as pending actions, executed only when the member who asked confirms. An app's
 * proposal that the business's rules say needs approval goes ahead only when the member approves it on bookanything;
 * the app confirming it leaves it waiting (section 20.8). Confirming
 * runs the tool's command in the caller's transaction with the action row locked, audited with actor `ai` (with the
 * app in `via` for a connected app); confirming twice returns the first result (idempotent). Every decision on a chat
 * proposal is added to the thread so Bo knows what happened.
 *
 * [confirm] and [reject] are commands (they take the request's [Connection]); [store] is called by the turn loop between
 * model calls, outside any request transaction, so it writes the proposal in its own short transaction.
 */
class ActionService(
    private val db: Db, private val clock: Clock, private val registry: ToolRegistry, private val contexts: ToolContexts,
    private val inbox: Inbox,
) : ProposalStore {

    /** Stores a pending action for [proposal]; returns its id. */
    override fun store(ctx: ToolContext, threadId: UUID, use: ChatBlock.ToolUse, proposal: Proposal): String {
        val now = clock.instant()
        return db.txBlocking(ctx.access.businessId) { conn ->
            val action = NewAction(threadId, ctx.access.user.id, use.name, use.id, use.input, proposal, expiresAt = now.plus(TTL))
            ActionRepository.insert(conn, ctx.access.businessId, action, now)
        }.id.toString()
    }

    /**
     * Stores a pending action for a connected app's [proposal] (only it, or the member on bookanything, can decide it);
     * returns the stored row. One that [needsApproval] waits longer: the member may approve it later in the day.
     */
    fun storeForApp(
        access: BusinessAccess, app: ActionOrigin.App, tool: String, input: JsonObject, proposal: Proposal, needsApproval: Boolean,
    ): ActionRow {
        val now = clock.instant()
        return db.txBlocking(access.businessId) { conn ->
            val action = NewAction(
                null, access.user.id, tool, null, input, proposal, now.plus(if (needsApproval) APPROVAL_TTL else TTL),
                oauthGrantId = app.grantId, needsApproval = needsApproval,
            )
            ActionRepository.insert(conn, access.businessId, action, now).also { if (needsApproval) askForApproval(conn, access, it) }
        }
    }

    /** Tells the member an app's proposal waits for their approval (section 22): in the app, and by email unless they opted out. */
    private fun askForApproval(conn: Connection, access: BusinessAccess, row: ActionRow) {
        inbox.notify(
            conn,
            NewNotification(
                access.user.id, InboxKind.AGENT_APPROVAL, "${row.app?.name ?: "Your AI agent"} wants to: ${row.proposal.title}",
                row.proposal.summary, "/dashboard/${access.business.slug}/approvals/${row.id}", access.businessId, row.id,
                approvalKey(row.id),
            ),
        )
    }

    /** Whether the business's rules say the member must approve [tool] with [input] from an AI app (section 20.8). */
    fun needsApproval(access: BusinessAccess, tool: WriteTool<*>, input: JsonObject): Boolean =
        access.business.aiAgents.needsApproval(tool.changeKind, ToolInputs.countAny(tool, input))

    fun confirm(conn: Connection, access: BusinessAccess, id: UUID, origin: ActionOrigin = ActionOrigin.Chat): ActionDto =
        decideConfirm(conn, access, id, origin).toDto(access.business.zone, clock.instant())

    /**
     * [confirm], returning the row: an app's proposal that needs approval comes back still pending (nothing happened),
     * and is carried out only by the member approving it ([ActionOrigin.Approval]).
     */
    fun confirmRow(conn: Connection, access: BusinessAccess, id: UUID, origin: ActionOrigin): ActionRow =
        decideConfirm(conn, access, id, origin)

    private fun decideConfirm(conn: Connection, access: BusinessAccess, id: UUID, origin: ActionOrigin): ActionRow {
        val now = clock.instant()
        val row = own(conn, access, id, origin, forUpdate = true)
        if (row.effectiveStatus(now) == ActionStatus.CONFIRMED) return row
        requirePending(row, now, origin)
        val tool = registry.find(row.tool) as? WriteTool<*> ?: throw Errors.conflict("This proposal can no longer be carried out.")
        access.requireRole(tool.minRole)
        if (origin is ActionOrigin.App && (row.needsApproval || needsApproval(access, tool, row.input))) {
            // Waits for the member: the rules may have tightened since it was proposed.
            if (!row.needsApproval) {
                ActionRepository.requireApproval(conn, access.businessId, row.id, now.plus(APPROVAL_TTL))
                askForApproval(conn, access, ActionRepository.get(conn, access.businessId, row.id)!!)
            }
            return ActionRepository.get(conn, access.businessId, row.id)!!
        }
        if (origin == ActionOrigin.Approval) checkApprovable(access, row)
        val actor = when (origin) {
            ActionOrigin.Chat -> Actor.ai(access.user.id)
            is ActionOrigin.App -> Actor.agent(access.user.id, origin.clientId)
            ActionOrigin.Approval -> Actor.agent(access.user.id, row.app!!.clientId)
        }
        val outcome = runCatchingDomain {
            conn.savepoint { ToolInputs.execute(tool, contexts.forMember(access), Execution(conn, row.id, actor), row.input) }
        }
        val (status, result, error) = when (outcome) {
            is Outcome.Done -> Triple(ActionStatus.CONFIRMED, outcome.result, null)
            is Outcome.Failed -> Triple(ActionStatus.FAILED, null, outcome.message)
        }
        ActionRepository.decide(conn, access.businessId, row.id, status, result, error, now)
        if (row.oauthGrantId != null) Inbox.resolve(conn, access.user.id, approvalKey(row.id), now)
        Audit.record(
            conn, access.businessId, actor,
            if (status == ActionStatus.CONFIRMED) "assistant.action_confirmed" else "assistant.action_failed",
            "assistant_action", row.id,
            mapOf(
                "tool" to row.tool, "title" to row.proposal.title, "summary" to row.proposal.summary, "error" to error,
                // Who let it go ahead: the member (in Bo, or approving an app's proposal here), or the app itself.
                "approvedBy" to if (origin is ActionOrigin.App) "app" else "member",
            ),
        )
        note(conn, access, row, status, result?.message ?: "It could not be completed: ${error ?: "unknown error"}")
        return ActionRepository.get(conn, access.businessId, row.id)!!
    }

    /** Refuses a proposal that can no longer be confirmed (a confirmed one is returned as it is before this). */
    private fun requirePending(row: ActionRow, now: Instant, origin: ActionOrigin) {
        when (row.effectiveStatus(now)) {
            ActionStatus.PENDING, ActionStatus.CONFIRMED -> Unit
            ActionStatus.EXPIRED -> throw Errors.conflict(
                "This proposal has expired. " + if (origin ==
                    ActionOrigin.Chat
                ) {
                    "Ask Bo again."
                } else {
                    "Ask your AI app to prepare it again."
                },
            )
            ActionStatus.REJECTED -> throw Errors.conflict("This proposal was declined.")
            ActionStatus.FAILED -> throw Errors.conflict("This proposal couldn't be completed: ${row.error ?: "unknown error"}")
        }
    }

    fun reject(conn: Connection, access: BusinessAccess, id: UUID, origin: ActionOrigin = ActionOrigin.Chat): ActionDto =
        rejectRow(conn, access, id, origin).toDto(access.business.zone, clock.instant())

    fun rejectRow(conn: Connection, access: BusinessAccess, id: UUID, origin: ActionOrigin): ActionRow {
        val now = clock.instant()
        val row = own(conn, access, id, origin, forUpdate = true)
        when (row.effectiveStatus(now)) {
            ActionStatus.PENDING, ActionStatus.EXPIRED -> {
                ActionRepository.decide(conn, access.businessId, row.id, ActionStatus.REJECTED, null, null, now)
                if (row.oauthGrantId != null) Inbox.resolve(conn, access.user.id, approvalKey(row.id), now)
                note(conn, access, row, ActionStatus.REJECTED, "The user declined this proposal, so nothing changed.")
            }
            ActionStatus.REJECTED -> Unit
            ActionStatus.CONFIRMED, ActionStatus.FAILED -> throw Errors.conflict("This proposal was already ${row.status.key}.")
        }
        return ActionRepository.get(conn, access.businessId, row.id)!!
    }

    /**
     * Prepares an app's proposal again against the business as it is now: by the time the member looks at it (up to a
     * day later) a refund, a price or the bookings it touches may have changed. Stores the new preview when it differs
     * and returns true, so the member approves what will actually happen. Throws when it can no longer go ahead at all.
     */
    fun refresh(access: BusinessAccess, id: UUID): Boolean {
        val row = db.txBlocking(access.businessId, readOnly = true) { conn -> own(conn, access, id, ActionOrigin.Approval, false) }
        if (row.effectiveStatus(clock.instant()) != ActionStatus.PENDING) return false
        val tool = registry.find(row.tool) as? WriteTool<*> ?: throw Errors.conflict("This proposal can no longer be carried out.")
        val fresh = ToolInputs.proposeAny(tool, contexts.forMember(access), row.input)
        if (fresh == row.proposal) return false
        db.txBlocking(access.businessId) { conn -> ActionRepository.updatePreview(conn, access.businessId, id, fresh) }
        return true
    }

    /** The member's apps' proposals here from the last week, newest first, for the approvals page. */
    fun forMemberApps(conn: Connection, access: BusinessAccess): List<AgentRequestDto> {
        val now = clock.instant()
        return ActionRepository.forMemberApps(conn, access.businessId, access.user.id, now.minus(REQUESTS_SHOWN), MAX_REQUESTS)
            .map { request(it, access, now) }
    }

    fun forMemberApp(conn: Connection, access: BusinessAccess, id: UUID): AgentRequestDto =
        request(own(conn, access, id, ActionOrigin.Approval, forUpdate = false), access, clock.instant())

    fun request(row: ActionRow, access: BusinessAccess, now: Instant = clock.instant()) = AgentRequestDto(
        row.toDto(access.business.zone, now), row.app?.name ?: "An AI app", row.needsApproval, row.app?.revoked == true,
    )

    /** The member may still approve an app's proposal: the app is still connected and the business still lets them use apps. */
    private fun checkApprovable(access: BusinessAccess, row: ActionRow) {
        if (row.app == null || row.app.revoked) {
            throw Errors.conflict("${row.app?.name ?: "This app"} was disconnected, so its proposals can't go ahead.")
        }
        if (!access.business.aiAgents.access.allows(access.role)) {
            throw Errors.forbidden("AI agents aren't allowed for you at ${access.business.name} any more, so this can't go ahead.")
        }
    }

    /**
     * Actions belong to the member who asked for them, and are decided where they came from: a chat proposal in the
     * dashboard, an app's proposal by that app (another app of the same member can't) or by the member on the
     * approvals page. Anything else is 404.
     */
    private fun own(conn: Connection, access: BusinessAccess, id: UUID, origin: ActionOrigin, forUpdate: Boolean): ActionRow =
        ActionRepository.get(conn, access.businessId, id, forUpdate)
            ?.takeIf { it.userId == access.user.id }
            ?.takeIf {
                when (origin) {
                    ActionOrigin.Chat -> it.threadId != null
                    is ActionOrigin.App -> it.oauthGrantId == origin.grantId
                    ActionOrigin.Approval -> it.oauthGrantId != null
                }
            }
            ?: throw Errors.notFound("Proposal")

    /** Tells Bo what happened to a chat proposal (an app's proposal has no thread: the app gets the result directly). */
    private fun note(conn: Connection, access: BusinessAccess, row: ActionRow, status: ActionStatus, detail: String) {
        val threadId = row.threadId ?: return
        val text = AssistantPrompt.actionUpdate(row.id.toString(), row.tool, status.key, detail)
        ConversationRepository.append(
            conn, access.businessId, threadId, ChatRole.USER, MessageKind.EVENT, listOf(ChatBlock.Text(text)), clock.instant(),
        )
    }

    private sealed interface Outcome {
        data class Done(val result: ActionResult) : Outcome
        data class Failed(val message: String) : Outcome
    }

    /** Business-rule failures (validation, policy, a slot taken meanwhile) fail the action; anything else is a bug and rolls back. */
    private inline fun runCatchingDomain(block: () -> ActionResult): Outcome = try {
        Outcome.Done(block())
    } catch (e: ApiException) {
        Outcome.Failed(e.message)
    }

    companion object {
        /** How long a proposal can be confirmed. */
        val TTL: Duration = Duration.ofMinutes(30)

        private fun approvalKey(id: UUID) = "agent-request:$id"

        /** How long an app's proposal waits for the member's approval. */
        val APPROVAL_TTL: Duration = Duration.ofHours(24)

        private val REQUESTS_SHOWN: Duration = Duration.ofDays(7)
        private const val MAX_REQUESTS = 50
    }
}
