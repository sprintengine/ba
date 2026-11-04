package ie.bookanything.assistant

import ie.bookanything.ai.ChatBlock
import ie.bookanything.ai.ChatRole
import ie.bookanything.assistant.actions.ActionRow
import ie.bookanything.assistant.tools.ToolRegistry
import ie.bookanything.http.formatInstant
import java.time.Instant
import java.time.ZoneId

/**
 * Folds stored messages into chat bubbles (pure): a user bubble per user message, and one assistant bubble per reply
 * with its text, tool activity, proposals and any notice. Context blocks and system events are not shown.
 */
class ConversationViews(private val registry: ToolRegistry) {

    fun bubbles(messages: List<StoredMessage>, actions: List<ActionRow>, zone: ZoneId, now: Instant): List<ChatMessageDto> {
        // A thread's actions all came from its tool uses (only connected apps' proposals have none).
        val actionsByToolUse = actions.mapNotNull { a -> a.toolUseId?.let { it to a } }.toMap()
        val out = mutableListOf<Builder>()
        for (m in messages) {
            val reply = out.lastOrNull()?.takeIf { it.role == ChatRoleDto.ASSISTANT }
            when {
                m.role == ChatRole.ASSISTANT -> (reply ?: Builder(m, ChatRoleDto.ASSISTANT).also { out += it }).reply(m, actionsByToolUse)
                m.kind == MessageKind.MESSAGE -> out += Builder(m, ChatRoleDto.USER).apply { text += AssistantPrompt.userText(m.blocks) }
                m.kind == MessageKind.TOOL_RESULTS -> reply?.results(m)
                else -> Unit // system events: reflected in the proposal cards
            }
        }
        return out.map { it.build(zone, now) }
    }

    fun label(tool: String): String = registry.find(tool)?.label ?: tool

    private inner class Builder(val first: StoredMessage, val role: ChatRoleDto) {
        var text = ""
        val tools = mutableListOf<ToolActivityDto>()
        val actions = mutableListOf<ActionRow>()
        var notice: NoticeDto? = null

        /** Bo's text and tool calls join the reply; a refusal, truncation or error becomes its notice. */
        fun reply(m: StoredMessage, actionsByToolUse: Map<String, ActionRow>) {
            val said = m.blocks.filterIsInstance<ChatBlock.Text>().joinToString("") { it.text }
            val noticeKind = m.kind.notice
            if (noticeKind != null) {
                notice = NoticeDto(noticeKind, said)
                return
            }
            if (said.isNotBlank()) text += (if (text.isEmpty()) "" else "\n\n") + said.trim()
            m.blocks.filterIsInstance<ChatBlock.ToolUse>().forEach { use ->
                tools += ToolActivityDto(use.id, use.name, label(use.name), ToolStatus.RUNNING)
                actionsByToolUse[use.id]?.let { actions += it }
            }
        }

        /** The tools that answered are done (or failed). */
        fun results(m: StoredMessage) {
            m.blocks.filterIsInstance<ChatBlock.ToolResult>().forEach { r ->
                tools.replaceAll { t ->
                    if (t.id ==
                        r.toolUseId
                    ) {
                        t.copy(status = if (r.isError) ToolStatus.ERROR else ToolStatus.DONE)
                    } else {
                        t
                    }
                }
            }
        }

        /** A tool with no stored result was interrupted (the turn ended before it answered). */
        fun build(zone: ZoneId, now: Instant) = ChatMessageDto(
            first.id.toString(), role, text, tools.map { if (it.status == ToolStatus.RUNNING) it.copy(status = ToolStatus.ERROR) else it },
            actions.map { it.toDto(zone, now) }, notice, formatInstant(first.createdAt, zone),
        )
    }
}
