package ie.bookanything.assistant.tools

import ie.bookanything.ai.AiJson
import ie.bookanything.http.Errors
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonObject

/** Tool inputs are JSON from the model: decoded strictly into the tool's typed input (unknown fields refused). */
object ToolInputs {
    fun <I : Any> decode(tool: AssistantTool<I>, input: JsonObject): I = try {
        AiJson.toolArguments.decodeFromJsonElement(tool.input, input)
    } catch (e: SerializationException) {
        throw Errors.invalid("Invalid input for ${tool.name}: ${e.message?.lineSequence()?.firstOrNull()?.take(200).orEmpty()}")
    } catch (e: IllegalArgumentException) {
        throw Errors.invalid("Invalid input for ${tool.name}: ${e.message?.lineSequence()?.firstOrNull()?.take(200).orEmpty()}")
    }

    /** Runs a confirmed write tool with its stored input (the type is recovered from the tool's own decoder). */
    fun execute(tool: WriteTool<*>, ctx: ToolContext, run: Execution, input: JsonObject): ActionResult = executeTyped(tool, ctx, run, input)

    private fun <I : Any> executeTyped(tool: WriteTool<I>, ctx: ToolContext, run: Execution, input: JsonObject): ActionResult =
        tool.execute(ctx, run, decode(tool, input))

    fun <I : Any> propose(tool: WriteTool<I>, ctx: ToolContext, input: JsonObject): Proposal = tool.propose(ctx, decode(tool, input))

    fun <I : Any> read(tool: ReadTool<I>, ctx: ToolContext, input: JsonObject): ToolOutput = tool.run(ctx, decode(tool, input))

    /** [read] for a tool found by name (its input type recovered from its own decoder). */
    fun readAny(tool: ReadTool<*>, ctx: ToolContext, input: JsonObject): ToolOutput = read(tool, ctx, input)

    /** How many items [input] changes, for a tool found by name. */
    fun countAny(tool: WriteTool<*>, input: JsonObject): Int = count(tool, input)

    private fun <I : Any> count(tool: WriteTool<I>, input: JsonObject): Int = tool.count(decode(tool, input))

    /** [propose] for a tool found by name. */
    fun proposeAny(tool: WriteTool<*>, ctx: ToolContext, input: JsonObject): Proposal = propose(tool, ctx, input)
}
