package ie.bookanything.ai

import com.anthropic.core.JsonValue
import com.anthropic.core.jsonMapper
import com.anthropic.models.messages.CacheControlEphemeral
import com.anthropic.models.messages.ContentBlock
import com.anthropic.models.messages.ContentBlockParam
import com.anthropic.models.messages.JsonOutputFormat
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.MessageParam
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.RedactedThinkingBlockParam
import com.anthropic.models.messages.TextBlockParam
import com.anthropic.models.messages.ThinkingBlockParam
import com.anthropic.models.messages.Tool
import com.anthropic.models.messages.ToolChoiceAuto
import com.anthropic.models.messages.ToolResultBlockParam
import com.anthropic.models.messages.ToolUseBlock
import com.anthropic.models.messages.ToolUseBlockParam
import com.anthropic.models.messages.Usage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/** Conversions between the provider-neutral conversation types and the Anthropic Java SDK. */
internal object AnthropicMapping {
    private val mapper = jsonMapper()

    fun effort(effort: Effort): OutputConfig.Effort = when (effort) {
        Effort.LOW -> OutputConfig.Effort.LOW
        Effort.MEDIUM -> OutputConfig.Effort.MEDIUM
        Effort.HIGH -> OutputConfig.Effort.HIGH
    }

    fun usage(u: Usage) = TokenUsage(
        input = u.inputTokens(),
        cacheWrite = u.cacheCreationInputTokens().orElse(0L),
        cacheRead = u.cacheReadInputTokens().orElse(0L),
        output = u.outputTokens(),
    )

    fun jsonValue(json: kotlinx.serialization.json.JsonElement): JsonValue = JsonValue.fromJsonNode(mapper.readTree(json.toString()))

    /** A strict tool: every property required, no additional properties (the schema itself says so). */
    fun tool(spec: ToolSpec): Tool {
        val schema = spec.inputSchema
        val properties = schema["properties"]?.jsonObject ?: JsonObject(emptyMap())
        val required = (schema["required"] as? JsonArray)?.map { (it as JsonPrimitive).content }.orEmpty()
        return Tool.builder()
            .name(spec.name)
            .description(spec.description)
            .strict(true)
            .inputSchema(
                Tool.InputSchema.builder()
                    .properties(
                        Tool.InputSchema.Properties.builder().putAllAdditionalProperties(
                            properties.mapValues { jsonValue(it.value) },
                        ).build(),
                    )
                    .required(required)
                    .putAdditionalProperty("additionalProperties", JsonValue.from(false))
                    .build(),
            )
            .build()
    }

    /** A one-shot structured-output request: the reply text must follow [StructuredRequest.schema]; effort is explicit. */
    fun structuredParams(modelId: String, request: StructuredRequest): MessageCreateParams = MessageCreateParams.builder()
        .model(modelId)
        .maxTokens(request.maxTokens)
        .system(request.system)
        .addUserMessage(request.user)
        .outputConfig(
            OutputConfig.builder()
                .effort(effort(request.effort))
                .format(
                    JsonOutputFormat.builder()
                        .schema(
                            JsonOutputFormat.Schema.builder().putAllAdditionalProperties(
                                request.schema.mapValues { jsonValue(it.value) },
                            ).build(),
                        )
                        .build(),
                )
                .build(),
        )
        .build()

    /**
     * A conversation request: the stable system prompt carries an explicit cache breakpoint (tools render before it, so
     * both are cached), top-level automatic caching covers the conversation tail, tools are strict with
     * `tool_choice: auto`, effort is explicit and thinking is left at the model default (never disabled).
     */
    fun converseParams(modelId: String, request: ConverseRequest): MessageCreateParams {
        val builder = MessageCreateParams.builder()
            .model(modelId)
            .maxTokens(request.maxTokens)
            .systemOfTextBlockParams(
                listOf(TextBlockParam.builder().text(request.system).cacheControl(CacheControlEphemeral.builder().build()).build()),
            )
            .messages(request.messages.map(::message))
            .outputConfig(OutputConfig.builder().effort(effort(request.effort)).build())
            .cacheControl(CacheControlEphemeral.builder().build())
        if (request.tools.isNotEmpty()) {
            request.tools.forEach { builder.addTool(tool(it)) }
            builder.toolChoice(ToolChoiceAuto.builder().build())
        }
        return builder.build()
    }

    fun message(m: ChatMessage): MessageParam {
        val blocks = m.blocks.map(::block)
        return when (m.role) {
            ChatRole.USER -> MessageParam.ofUserOfContentBlockParams(blocks)
            ChatRole.ASSISTANT -> MessageParam.ofAssistantOfContentBlockParams(blocks)
        }
    }

    private fun block(b: ChatBlock): ContentBlockParam = when (b) {
        is ChatBlock.Text -> ContentBlockParam.ofText(TextBlockParam.builder().text(b.text).build())
        is ChatBlock.Thinking -> ContentBlockParam.ofThinking(
            ThinkingBlockParam.builder().thinking(b.thinking).signature(b.signature).build(),
        )
        is ChatBlock.RedactedThinking -> ContentBlockParam.ofRedactedThinking(RedactedThinkingBlockParam.builder().data(b.data).build())
        is ChatBlock.ToolUse -> ContentBlockParam.ofToolUse(
            ToolUseBlockParam.builder().id(b.id).name(b.name)
                .input(ToolUseBlockParam.Input.builder().putAllAdditionalProperties(b.input.mapValues { jsonValue(it.value) }).build())
                .build(),
        )
        is ChatBlock.ToolResult -> ContentBlockParam.ofToolResult(
            ToolResultBlockParam.builder().toolUseId(b.toolUseId).content(b.content).isError(b.isError).build(),
        )
    }

    /** Response blocks we keep (text, thinking, tool use); anything else is dropped. */
    fun fromResponse(block: ContentBlock): ChatBlock? = block.text().orElse(null)?.let { ChatBlock.Text(it.text()) }
        ?: block.thinking().orElse(null)?.let { ChatBlock.Thinking(it.thinking(), it.signature()) }
        ?: block.redactedThinking().orElse(null)?.let { ChatBlock.RedactedThinking(it.data()) }
        ?: block.toolUse().orElse(null)?.let(::toolUse)

    /** Tool inputs are parsed as JSON (never trusted as typed): anything that is not an object becomes {}. */
    private fun toolUse(use: ToolUseBlock): ChatBlock.ToolUse {
        val input = runCatching {
            Json.parseToJsonElement(mapper.writeValueAsString(use._input())).jsonObject
        }.getOrElse { JsonObject(emptyMap()) }
        return ChatBlock.ToolUse(use.id(), use.name(), input)
    }
}
