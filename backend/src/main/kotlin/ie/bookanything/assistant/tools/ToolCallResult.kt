package ie.bookanything.assistant.tools

import ie.bookanything.ai.ChatBlock

/** The outcome of one tool call in a turn: the `tool_result` for the model plus what the chat shows. */
sealed interface ToolCallResult {
    val result: ChatBlock.ToolResult

    data class Read(override val result: ChatBlock.ToolResult, val summary: String) : ToolCallResult

    /** A write tool made a proposal, stored as a pending action. */
    data class Proposed(override val result: ChatBlock.ToolResult, val proposal: Proposal, val actionId: String) : ToolCallResult

    data class Failed(override val result: ChatBlock.ToolResult, val message: String) : ToolCallResult
}
