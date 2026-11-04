package ie.bookanything.assistant

import ie.bookanything.ai.usage.AiCreditsDto
import ie.bookanything.assistant.actions.ActionDto
import ie.bookanything.assistant.nudges.NudgeDto
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class ToolStatus { @SerialName("running") RUNNING, @SerialName("done") DONE, @SerialName("error") ERROR }

@Serializable
data class ToolActivityDto(val id: String, val name: String, val label: String, val status: ToolStatus, val summary: String? = null)

@Serializable
enum class NoticeKind { @SerialName("refusal") REFUSAL, @SerialName("truncated") TRUNCATED, @SerialName("error") ERROR }

@Serializable
data class NoticeDto(val kind: NoticeKind, val message: String)

@Serializable
enum class ChatRoleDto { @SerialName("user") USER, @SerialName("assistant") ASSISTANT }

/** One bubble in the chat: the user's message, or everything Bo said and did in reply to it. */
@Serializable
data class ChatMessageDto(
    val id: String,
    val role: ChatRoleDto,
    val text: String,
    val tools: List<ToolActivityDto>,
    val actions: List<ActionDto>,
    val notice: NoticeDto?,
    val createdAt: String,
)

@Serializable
data class ThreadSummaryDto(val id: String, val title: String, val updatedAt: String)

@Serializable
data class ThreadDto(val id: String, val title: String, val createdAt: String, val updatedAt: String, val messages: List<ChatMessageDto>)

@Serializable
data class CreateThreadInput(val title: String? = null)

@Serializable
data class SendMessageInput(val text: String? = null)

/** `GET /assistant`: everything the panel needs to open, including in degraded mode (no model). */
@Serializable
data class AssistantStateDto(
    /** A model is connected. Without one Bo still shows nudges and quick actions, but cannot chat. */
    val configured: Boolean,
    val credits: AiCreditsDto,
    val nudges: List<NudgeDto>,
    val threads: List<ThreadSummaryDto>,
    val canEditMemory: Boolean,
)

/** Server-sent events of one turn (`POST …/messages`), each sent as `event: <type>` with the JSON as `data`. */
@Serializable
sealed interface TurnEvent {
    @Serializable @SerialName("user_message")
    data class UserMessage(val message: ChatMessageDto) : TurnEvent

    @Serializable @SerialName("text")
    data class Text(val delta: String) : TurnEvent

    @Serializable @SerialName("tool")
    data class Tool(val tool: ToolActivityDto) : TurnEvent

    @Serializable @SerialName("proposal")
    data class Proposal(val action: ActionDto) : TurnEvent

    @Serializable @SerialName("notice")
    data class Notice(val notice: NoticeDto) : TurnEvent

    @Serializable @SerialName("error")
    data class Error(val code: String, val message: String) : TurnEvent

    /** The turn is over: the whole reply as stored, and the credits left. */
    @Serializable @SerialName("done")
    data class Done(val message: ChatMessageDto?, val credits: AiCreditsDto) : TurnEvent
}
