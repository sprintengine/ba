package ie.bookanything.assistant.tools

import ie.bookanything.ai.ChatBlock
import ie.bookanything.http.ApiException
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.slf4j.LoggerFactory
import java.util.UUID

/**
 * Runs the model's tool calls. Tools outside the member's role are refused even if requested; errors become
 * `is_error` results the model can recover from. Write tools only ever produce proposals here.
 */
class ToolRunner(private val registry: ToolRegistry, private val proposals: ProposalStore) {
    private val log = LoggerFactory.getLogger(ToolRunner::class.java)

    fun run(ctx: ToolContext, threadId: UUID, use: ChatBlock.ToolUse): ToolCallResult {
        val tool = registry.find(use.name)?.takeIf { ctx.access.role.atLeast(it.minRole) }
            ?: return failed(use, "UNAVAILABLE", "The tool ${use.name} is not available to this user.")
        return try {
            when (tool) {
                is ReadTool<*> -> {
                    val out = ToolInputs.read(tool, ctx, use.input)
                    ToolCallResult.Read(ChatBlock.ToolResult(use.id, out.data.toString()), out.summary)
                }
                is WriteTool<*> -> {
                    val proposal = ToolInputs.propose(tool, ctx, use.input)
                    val actionId = proposals.store(ctx, threadId, use, proposal)
                    // The title and summary name customers and quote their text: flagged like any read result.
                    val content = JsonObject(
                        mapOf(
                            "_note" to JsonPrimitive(ToolViews.UNTRUSTED_NOTE),
                            "proposalId" to JsonPrimitive(actionId),
                            "status" to JsonPrimitive("awaiting_confirmation"),
                            "title" to JsonPrimitive(proposal.title),
                            "summary" to JsonPrimitive(proposal.summary),
                            "note" to JsonPrimitive(PROPOSAL_NOTE),
                        ),
                    )
                    ToolCallResult.Proposed(ChatBlock.ToolResult(use.id, content.toString()), proposal, actionId)
                }
            }
        } catch (e: ApiException) {
            failed(use, e.code, e.message, e.fields)
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Tool boundary: report the failure to the model.
            log.warn("assistant tool {} failed: {}", use.name, e.toString())
            failed(use, "INTERNAL_ERROR", "Something went wrong running this tool.")
        }
    }

    private fun failed(
        use: ChatBlock.ToolUse, code: String, message: String, fields: Map<String, String> = emptyMap(),
    ): ToolCallResult.Failed {
        val content = JsonObject(
            buildMap {
                put("error", JsonPrimitive(code))
                put("message", JsonPrimitive(message))
                if (fields.isNotEmpty()) put("fields", JsonObject(fields.mapValues { JsonPrimitive(it.value) }))
            },
        )
        return ToolCallResult.Failed(ChatBlock.ToolResult(use.id, content.toString(), isError = true), message)
    }

    companion object {
        const val PROPOSAL_NOTE =
            "Nothing has changed yet. The user sees this as a card with Confirm and Cancel buttons. Summarise it in one " +
                "short sentence; do not say it is done and do not ask them to type a confirmation."
    }
}
