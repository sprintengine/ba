package ie.bookanything.ai.fake

import ie.bookanything.ai.AiModelException
import ie.bookanything.ai.ChatBlock
import ie.bookanything.ai.ChatMessage
import ie.bookanything.ai.ChatRole
import ie.bookanything.ai.ConverseReply
import ie.bookanything.ai.ConverseRequest
import ie.bookanything.ai.ModelClient
import ie.bookanything.ai.ModelReply
import ie.bookanything.ai.StopReason
import ie.bookanything.ai.StreamSink
import ie.bookanything.ai.StructuredRequest
import ie.bookanything.ai.TokenUsage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.LocalDate
import java.util.concurrent.atomic.AtomicInteger

/**
 * A deterministic stand-in for the model (development with `AI_FAKE_SCRIPT`, and tests). It never answers
 * structured-output requests (those features fall back to their built-in generators) and plays [script] for
 * conversations: the step is the number of assistant turns since the latest user message. Refused in production.
 */
class ScriptedModelClient(private val script: FakeScript) : ModelClient {
    override val modelId = MODEL_ID
    private val ids = AtomicInteger()

    override fun structured(request: StructuredRequest): ModelReply =
        throw AiModelException("the scripted model has no structured replies")

    override fun converse(request: ConverseRequest, sink: StreamSink): ConverseReply {
        val (userIndex, userText) = latestUserText(request.messages) ?: return reply(StopReason.END_TURN, "…", emptyList(), null, false)
        val rule = script.ruleFor(userText) ?: return reply(
            StopReason.END_TURN, "I don't have an answer for that.", emptyList(), null, false,
        )
        val stepIndex = request.messages.drop(userIndex + 1).count { it.role == ChatRole.ASSISTANT }
        val step = rule.steps.getOrNull(stepIndex) ?: return reply(StopReason.END_TURN, "Done.", emptyList(), null, false)
        val lookup = lookup(request.messages)
        val text = step.text?.let { FakeTemplates.resolveString(it, lookup).let { v -> (v as? JsonPrimitive)?.content ?: v.toString() } }
        val pieces = text?.chunked(12).orEmpty()
        if (step.delayMs > 0) Thread.sleep(step.delayMs)
        pieces.forEach { piece ->
            sink.text(piece)
            if (step.delayMs > 0) Thread.sleep(minOf(60, step.delayMs / 10))
        }
        val tools = step.tools.map { call ->
            ChatBlock.ToolUse("toolu_fake_${ids.incrementAndGet()}", call.name, FakeTemplates.resolve(call.input, lookup) as JsonObject)
        }
        val stop = step.stopReason?.let(StopReason::parse) ?: if (tools.isNotEmpty()) StopReason.TOOL_USE else StopReason.END_TURN
        val usage = step.usage?.let { TokenUsage(it.input, it.cacheWrite, it.cacheRead, it.output) }
        return reply(stop, text, tools, usage, request.messages.any { it.role == ChatRole.ASSISTANT })
    }

    private fun reply(stop: StopReason, text: String?, tools: List<ChatBlock.ToolUse>, usage: TokenUsage?, warm: Boolean): ConverseReply {
        val blocks = listOfNotNull(text?.let { ChatBlock.Text(it) }) + tools
        // Without explicit usage: a plausible call where the first turn writes the cached prefix and later turns read it.
        val u = usage ?: if (warm) {
            TokenUsage(input = 500, cacheRead = 3_000, output = 150)
        } else {
            TokenUsage(
                input = 500, cacheWrite = 3_000, output = 150,
            )
        }
        return ConverseReply(
            stop, blocks, u, "msg_fake_${ids.incrementAndGet()}", if (stop == StopReason.REFUSAL) "scripted refusal" else null,
        )
    }

    /** Index and text of the latest user message that ends with the user's words (not a batch of tool results). */
    private fun latestUserText(messages: List<ChatMessage>): Pair<Int, String>? {
        val i = messages.indexOfLast { m -> m.role == ChatRole.USER && m.blocks.lastOrNull() is ChatBlock.Text }
        if (i < 0) return null
        return i to (messages[i].blocks.last() as ChatBlock.Text).text
    }

    private fun lookup(messages: List<ChatMessage>): (String) -> JsonElement? {
        val today = messages.asSequence().flatMap { it.blocks }.filterIsInstance<ChatBlock.Text>()
            .mapNotNull { TODAY.find(it.text)?.groupValues?.get(1) }.lastOrNull()?.let(LocalDate::parse) ?: LocalDate.now()
        val toolNames = messages.flatMap { it.blocks }.filterIsInstance<ChatBlock.ToolUse>().associate { it.id to it.name }
        val results = messages.flatMap { it.blocks }.filterIsInstance<ChatBlock.ToolResult>()
        return { key ->
            when (key) {
                "today" -> JsonPrimitive(today.toString())
                "tomorrow" -> JsonPrimitive(today.plusDays(1).toString())
                else -> {
                    val tool = key.substringBefore('.')
                    val path = key.substringAfter('.', "")
                    results.lastOrNull { toolNames[it.toolUseId] == tool }
                        ?.let { runCatching { Json.parseToJsonElement(it.content) }.getOrNull() }
                        ?.let { if (path.isEmpty()) it else FakeTemplates.path(it, path) }
                }
            }
        }
    }

    companion object {
        const val MODEL_ID = "fake-scripted"
        private val TODAY = Regex("""Today: (\d{4}-\d{2}-\d{2})""")
    }
}
