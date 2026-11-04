package ie.bookanything.ai

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** Token counts reported by the provider for one call (all four are billed differently; see `PriceTable`). */
data class TokenUsage(val input: Long = 0, val cacheWrite: Long = 0, val cacheRead: Long = 0, val output: Long = 0) {
    companion object {
        val NONE = TokenUsage()
    }
}

/** Why the model stopped. [OTHER] covers values this code does not act on. */
enum class StopReason(val key: String) {
    END_TURN("end_turn"), TOOL_USE("tool_use"), MAX_TOKENS("max_tokens"), REFUSAL("refusal"),
    STOP_SEQUENCE("stop_sequence"), PAUSE_TURN("pause_turn"), OTHER("other");

    companion object {
        fun parse(raw: String?): StopReason = entries.firstOrNull { it.key == raw } ?: OTHER
    }
}

/** Reasoning depth (`output_config.effort`). Thinking itself cannot be disabled on the default model. */
enum class Effort { LOW, MEDIUM, HIGH }

/** A one-shot structured-output request: [schema] is the strict JSON schema (see [JsonSchema]) the reply text must follow. */
data class StructuredRequest(
    val system: String,
    val user: String,
    val schema: JsonObject,
    val maxTokens: Long = 16_000,
    val effort: Effort = Effort.MEDIUM,
)

/** A structured-output reply. [text] is the JSON (possibly truncated or empty on refusal). */
data class ModelReply(
    val stopReason: StopReason,
    val text: String,
    val refusalExplanation: String? = null,
    val usage: TokenUsage = TokenUsage.NONE,
    val messageId: String? = null,
)

enum class ChatRole { USER, ASSISTANT }

/**
 * One content block of a conversation, in the provider's shape. Stored as-is with each message so a thread's
 * history replays byte-identically (prompt caching) and thinking blocks go back with their signatures.
 */
@Serializable
sealed interface ChatBlock {
    @Serializable @SerialName("text")
    data class Text(val text: String) : ChatBlock

    @Serializable @SerialName("thinking")
    data class Thinking(val thinking: String, val signature: String) : ChatBlock

    @Serializable @SerialName("redacted_thinking")
    data class RedactedThinking(val data: String) : ChatBlock

    @Serializable @SerialName("tool_use")
    data class ToolUse(val id: String, val name: String, val input: JsonObject) : ChatBlock

    @Serializable @SerialName("tool_result")
    data class ToolResult(val toolUseId: String, val content: String, val isError: Boolean = false) : ChatBlock
}

data class ChatMessage(val role: ChatRole, val blocks: List<ChatBlock>)

/** A client tool. Always sent with `strict: true`, so [inputSchema] must be a strict JSON schema. */
data class ToolSpec(val name: String, val description: String, val inputSchema: JsonObject)

/**
 * A conversation turn with tools. [system] must be stable across requests (it carries the cache breakpoint);
 * per-request context belongs in [messages].
 */
data class ConverseRequest(
    val system: String,
    val tools: List<ToolSpec>,
    val messages: List<ChatMessage>,
    val maxTokens: Long,
    val effort: Effort,
)

data class ConverseReply(
    val stopReason: StopReason,
    val blocks: List<ChatBlock>,
    val usage: TokenUsage,
    val messageId: String? = null,
    val refusalExplanation: String? = null,
) {
    val text: String get() = blocks.filterIsInstance<ChatBlock.Text>().joinToString("") { it.text }
    val toolUses: List<ChatBlock.ToolUse> get() = blocks.filterIsInstance<ChatBlock.ToolUse>()
}

/** Receives streamed text as it is generated. */
fun interface StreamSink {
    fun text(delta: String)

    companion object {
        val NONE = StreamSink { }
    }
}

/**
 * A model call failed; [reason] is safe to log. [usage] is what the provider had already counted (a stream that
 * broke part-way is still billed), so the meter can settle it.
 */
class AiModelException(
    val reason: String, cause: Throwable? = null, val usage: TokenUsage = TokenUsage.NONE,
) : RuntimeException(reason, cause)
