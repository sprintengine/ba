package ie.bookanything.assistant

import ie.bookanything.ai.ChatBlock
import ie.bookanything.ai.ChatRole
import ie.bookanything.assistant.tools.ToolRegistry
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

class ConversationViewsTest {
    private val now = Instant.parse("2026-10-05T08:00:00Z")
    private var seq = 0L

    private fun msg(role: ChatRole, kind: MessageKind, vararg blocks: ChatBlock) =
        StoredMessage(UUID.randomUUID(), seq++, role, kind, blocks.toList(), now)

    private fun use(id: String) = ChatBlock.ToolUse(id, "get_schedule", kotlinx.serialization.json.JsonObject(emptyMap()))

    @Test
    fun `messages fold into one user bubble and one reply bubble per turn`() {
        val messages = listOf(
            msg(ChatRole.USER, MessageKind.MESSAGE, ChatBlock.Text("context"), ChatBlock.Text("What's on?")),
            msg(ChatRole.ASSISTANT, MessageKind.MESSAGE, ChatBlock.Text("Checking. "), use("a"), use("b"), use("c")),
            msg(ChatRole.USER, MessageKind.TOOL_RESULTS, ChatBlock.ToolResult("a", "{}"), ChatBlock.ToolResult("b", "{}", isError = true)),
            msg(ChatRole.ASSISTANT, MessageKind.MESSAGE, ChatBlock.Text("  Two bookings.  ")),
            msg(ChatRole.USER, MessageKind.EVENT, ChatBlock.Text("<action_update/>")),
            msg(ChatRole.ASSISTANT, MessageKind.TRUNCATED, ChatBlock.Text("Cut off")),
            msg(ChatRole.USER, MessageKind.MESSAGE, ChatBlock.Text("Thanks")),
            msg(ChatRole.ASSISTANT, MessageKind.REFUSAL, ChatBlock.Text("No")),
        )
        val bubbles = ConversationViews(ToolRegistry.DEFAULT).bubbles(messages, emptyList(), ZoneId.of("Europe/Dublin"), now)
        assertEquals(listOf(ChatRoleDto.USER, ChatRoleDto.ASSISTANT, ChatRoleDto.USER, ChatRoleDto.ASSISTANT), bubbles.map { it.role })
        assertEquals("What's on?", bubbles[0].text)
        val reply = bubbles[1]
        assertEquals("Checking.\n\nTwo bookings.", reply.text)
        assertEquals(listOf(ToolStatus.DONE, ToolStatus.ERROR, ToolStatus.ERROR), reply.tools.map { it.status }, "c never answered")
        assertEquals(NoticeDto(NoticeKind.TRUNCATED, "Cut off"), reply.notice)
        assertEquals(NoticeDto(NoticeKind.REFUSAL, "No"), bubbles[3].notice)
        assertEquals("", bubbles[3].text)
    }

    @Test
    fun `notices are stored as their message kinds`() {
        NoticeKind.entries.forEach { assertEquals(it, MessageKind.of(it).notice) }
    }
}
