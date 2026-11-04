package ie.bookanything.ai

import com.anthropic.core.JsonValue
import com.anthropic.models.messages.ContentBlock
import com.anthropic.models.messages.DirectCaller
import com.anthropic.models.messages.RedactedThinkingBlock
import com.anthropic.models.messages.TextBlock
import com.anthropic.models.messages.ThinkingBlock
import com.anthropic.models.messages.ToolUseBlock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

class AnthropicMappingTest {
    private fun toolUse(input: Any) = ContentBlock.ofToolUse(
        ToolUseBlock.builder().id("toolu_1").name("get_schedule").input(JsonValue.from(input))
            .caller(DirectCaller.builder().build()).build(),
    )

    @Test
    fun `response blocks map to chat blocks`() {
        assertEquals(
            ChatBlock.Text("hi"),
            AnthropicMapping.fromResponse(ContentBlock.ofText(TextBlock.builder().text("hi").citations(emptyList()).build())),
        )
        assertEquals(
            ChatBlock.Thinking("hmm", "sig"),
            AnthropicMapping.fromResponse(ContentBlock.ofThinking(ThinkingBlock.builder().thinking("hmm").signature("sig").build())),
        )
        assertEquals(
            ChatBlock.RedactedThinking("x"),
            AnthropicMapping.fromResponse(ContentBlock.ofRedactedThinking(RedactedThinkingBlock.builder().data("x").build())),
        )
        assertEquals(
            ChatBlock.ToolUse("toolu_1", "get_schedule", JsonObject(mapOf("days" to JsonPrimitive(1)))),
            AnthropicMapping.fromResponse(toolUse(mapOf("days" to 1))),
        )
        assertEquals(
            ChatBlock.ToolUse("toolu_1", "get_schedule", JsonObject(emptyMap())),
            AnthropicMapping.fromResponse(toolUse(listOf(1, 2))),
            "a non-object input becomes {}",
        )
    }
}
