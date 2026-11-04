package ie.bookanything.assistant

import ie.bookanything.ai.AiCaller
import ie.bookanything.ai.AiFeature
import ie.bookanything.ai.AiModel
import ie.bookanything.ai.AiModelException
import ie.bookanything.ai.ChatBlock
import ie.bookanything.ai.ChatRole
import ie.bookanything.ai.ConverseRequest
import ie.bookanything.ai.Effort
import ie.bookanything.ai.StopReason
import ie.bookanything.ai.ToolSpec
import ie.bookanything.ai.usage.AiUsageService
import ie.bookanything.assistant.actions.ActionRepository
import ie.bookanything.assistant.memory.MemoryRepository
import ie.bookanything.assistant.tools.ToolCallResult
import ie.bookanything.assistant.tools.ToolContext
import ie.bookanything.assistant.tools.ToolContexts
import ie.bookanything.assistant.tools.ToolRegistry
import ie.bookanything.assistant.tools.ToolRunner
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.booking.staffScope
import ie.bookanything.db.Db
import ie.bookanything.http.ApiException
import ie.bookanything.resources.ResourceRepository
import org.slf4j.LoggerFactory
import java.time.Clock
import java.util.UUID

/**
 * One turn of a conversation: store the user's message, then call the model (streaming its text) and run the tools it
 * asks for until it answers, refuses, runs out of room or [MAX_STEPS] model calls are used. Every model call goes
 * through the metered seam. Everything is stored as it happens, so an interrupted turn leaves a valid history.
 * Blocking: run it off the event loop.
 */
class TurnRunner(
    private val db: Db,
    private val clock: Clock,
    private val model: AiModel,
    private val registry: ToolRegistry,
    private val tools: ToolRunner,
    private val contexts: ToolContexts,
    private val views: ConversationViews,
    private val usage: AiUsageService,
    private val effort: Effort,
) {
    private val log = LoggerFactory.getLogger(TurnRunner::class.java)

    /** [keepAlive] runs before every model call (it extends the thread's claim, and throws when the claim was lost). */
    fun run(
        access: BusinessAccess, threadId: UUID, text: String, requestId: String?, keepAlive: () -> Unit, emit: (TurnEvent) -> Unit,
    ) {
        val bid = access.businessId
        val zone = access.business.zone
        val user = storeUserTurn(access, threadId, text)
        emit(TurnEvent.UserMessage(views.bubbles(listOf(user), emptyList(), zone, clock.instant()).single()))
        val caller = AiCaller(AiFeature.ASSISTANT, bid, access.user.id, requestId)
        val turn = Turn(access, threadId, caller, contexts.forMember(access), registry.specs(access.role), emit)
        try {
            for (step in 1..MAX_STEPS) {
                keepAlive()
                if (!step(turn, step)) break
            }
        } catch (e: ApiException) {
            notice(access, threadId, NoticeKind.ERROR, e.message, emit)
            emit(TurnEvent.Error(e.code, e.message))
        } catch (e: AiModelException) {
            log.warn("assistant model call failed: {}", e.reason)
            notice(access, threadId, NoticeKind.ERROR, UNAVAILABLE, emit)
            emit(TurnEvent.Error("AI_UNAVAILABLE", UNAVAILABLE))
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Turn boundary: a bug still ends the turn with done.
            log.error("assistant turn failed", e)
            runCatching { notice(access, threadId, NoticeKind.ERROR, FAILED, emit) }
            emit(TurnEvent.Error("INTERNAL_SERVER_ERROR", FAILED))
        }
        emit(finish(access, threadId, user))
    }

    /** What every step of one turn needs. */
    private class Turn(
        val access: BusinessAccess, val threadId: UUID, val caller: AiCaller, val ctx: ToolContext, val specs: List<ToolSpec>,
        val emit: (TurnEvent) -> Unit,
    )

    /** One model call and the tools it asks for. False when the turn is over (an answer, a refusal or a cut-off reply). */
    private fun step(turn: Turn, step: Int): Boolean {
        val (access, threadId) = turn.access to turn.threadId
        val history = db.txBlocking(access.businessId, readOnly = true) {
            // Only the window's messages are loaded: an old thread's earlier turns are never read again.
            val window = AssistantPrompt.window(ConversationRepository.heads(it, access.businessId, threadId))
            AssistantPrompt.history(ConversationRepository.messagesFrom(it, access.businessId, threadId, window.fromSeq), window)
        }
        val reply = model.converse(
            turn.caller, ConverseRequest(AssistantPrompt.SYSTEM, turn.specs, history, MAX_TOKENS, effort),
        ) { turn.emit(TurnEvent.Text(it)) }
        return when (reply.stopReason) {
            StopReason.REFUSAL -> {
                notice(access, threadId, NoticeKind.REFUSAL, REFUSED, turn.emit)
                false
            }
            StopReason.MAX_TOKENS -> {
                // Never run tools from a cut-off reply: their input may be incomplete.
                val said = reply.blocks.filterIsInstance<ChatBlock.Text>()
                if (said.any { it.text.isNotBlank() }) store(access, threadId, ChatRole.ASSISTANT, MessageKind.MESSAGE, said)
                notice(access, threadId, NoticeKind.TRUNCATED, TRUNCATED, turn.emit)
                false
            }
            else -> {
                store(access, threadId, ChatRole.ASSISTANT, MessageKind.MESSAGE, reply.blocks)
                if (reply.toolUses.isNotEmpty()) runTools(turn, reply.toolUses, lastStep = step == MAX_STEPS)
                reply.toolUses.isNotEmpty()
            }
        }
    }

    /** Runs the reply's tool calls; all their results go back in a single user message. */
    private fun runTools(turn: Turn, uses: List<ChatBlock.ToolUse>, lastStep: Boolean) {
        val results = uses.map { use -> runTool(turn.ctx, turn.threadId, use, turn.emit) }
        store(turn.access, turn.threadId, ChatRole.USER, MessageKind.TOOL_RESULTS, results)
        if (lastStep) notice(turn.access, turn.threadId, NoticeKind.ERROR, TOO_MANY_STEPS, turn.emit)
    }

    private fun storeUserTurn(
        access: BusinessAccess, threadId: UUID, text: String,
    ): StoredMessage = db.txBlocking(access.businessId) { conn ->
        val b = access.business
        val now = clock.instant()
        val thread = ConversationRepository.thread(conn, b.id, threadId)!!
        val scope = access.staffScope
        val own = if (scope.isLimited) {
            ResourceRepository.list(conn, b.id).filter { scope.coversResource(UUID.fromString(it.id)) }.map { it.name }
        } else {
            emptyList()
        }
        val facts = ContextFacts(
            b.name, b.industry, b.timezone, b.currency, b.vocabulary, access.user.name, access.role, own,
            MemoryRepository.list(conn, b.id).map { it.id.toString() to it.text },
        )
        val context = AssistantPrompt.businessContext(facts)
        val hash = AssistantPrompt.hash(context)
        // The context goes again when it changed, or when this turn moves the window's start (the message that carried
        // it may now be left out).
        val heads = ConversationRepository.heads(conn, b.id, threadId)
        val moved = AssistantPrompt.window(heads).fromSeq !=
            AssistantPrompt.window(heads + MessageHead(Long.MAX_VALUE, ChatRole.USER, MessageKind.MESSAGE)).fromSeq
        val send = context.takeIf { thread.contextHash != hash || moved }
        val stored = ConversationRepository.append(
            conn, b.id, threadId, ChatRole.USER, MessageKind.MESSAGE, AssistantPrompt.userTurn(text, send, now, b.zone), now,
        )
        ConversationRepository.touch(
            conn, b.id, threadId, title = if (thread.title.isEmpty()) title(text) else null, contextHash = hash, now = now,
        )
        stored
    }

    private fun runTool(ctx: ToolContext, threadId: UUID, use: ChatBlock.ToolUse, emit: (TurnEvent) -> Unit): ChatBlock.ToolResult {
        val label = views.label(use.name)
        emit(TurnEvent.Tool(ToolActivityDto(use.id, use.name, label, ToolStatus.RUNNING)))
        val outcome = tools.run(ctx, threadId, use)
        val (status, summary) = when (outcome) {
            is ToolCallResult.Read -> ToolStatus.DONE to outcome.summary
            is ToolCallResult.Proposed -> ToolStatus.DONE to "Prepared: ${outcome.proposal.title}"
            is ToolCallResult.Failed -> ToolStatus.ERROR to outcome.message
        }
        emit(TurnEvent.Tool(ToolActivityDto(use.id, use.name, label, status, summary)))
        if (outcome is ToolCallResult.Proposed) {
            val row = db.txBlocking(ctx.access.businessId, readOnly = true) {
                ActionRepository.get(it, ctx.access.businessId, UUID.fromString(outcome.actionId))
            }
            row?.let { emit(TurnEvent.Proposal(it.toDto(ctx.business.zone, clock.instant()))) }
        }
        return outcome.result
    }

    private fun store(access: BusinessAccess, threadId: UUID, role: ChatRole, kind: MessageKind, blocks: List<ChatBlock>) {
        db.txBlocking(access.businessId) {
            ConversationRepository.append(it, access.businessId, threadId, role, kind, blocks, clock.instant())
        }
    }

    private fun notice(access: BusinessAccess, threadId: UUID, kind: NoticeKind, message: String, emit: (TurnEvent) -> Unit) {
        store(access, threadId, ChatRole.ASSISTANT, MessageKind.of(kind), listOf(ChatBlock.Text(message)))
        emit(TurnEvent.Notice(NoticeDto(kind, message)))
    }

    /** The whole reply as stored (one bubble) and the credits left. */
    private fun finish(
        access: BusinessAccess, threadId: UUID, user: StoredMessage,
    ): TurnEvent.Done = db.txBlocking(access.businessId, readOnly = true) { conn ->
        val messages = ConversationRepository.messagesFrom(conn, access.businessId, threadId, user.seq)
        val actions = ActionRepository.forThread(conn, access.businessId, threadId)
        val reply = views.bubbles(
            messages, actions, access.business.zone, clock.instant(),
        ).lastOrNull()?.takeIf { it.role == ChatRoleDto.ASSISTANT }
        TurnEvent.Done(reply, usage.credits(conn, access.business))
    }

    companion object {
        const val MAX_STEPS = 6
        const val MAX_TOKENS = 8_000L

        const val REFUSED = "That's not something I can help with. I can look after your schedule, bookings, customers, availability and " +
            "services."
        const val TRUNCATED = "My answer got cut off. Try asking for a little less at once."
        const val TOO_MANY_STEPS = "I couldn't finish that in one go. Try breaking it into smaller requests."
        const val UNAVAILABLE = "I couldn't reach the AI service just now. Please try again in a moment."
        const val FAILED = "Something went wrong. Please try again."

        fun title(text: String): String = text.trim().replace(Regex("\\s+"), " ").let {
            if (it.length > 60) it.take(59).trimEnd() + "…" else it
        }
    }
}
