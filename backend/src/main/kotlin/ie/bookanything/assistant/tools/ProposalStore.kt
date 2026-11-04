package ie.bookanything.assistant.tools

import ie.bookanything.ai.ChatBlock
import java.util.UUID

/** Stores a write tool's proposal as a pending action in the thread; returns the action id. */
fun interface ProposalStore {
    fun store(ctx: ToolContext, threadId: UUID, use: ChatBlock.ToolUse, proposal: Proposal): String
}
