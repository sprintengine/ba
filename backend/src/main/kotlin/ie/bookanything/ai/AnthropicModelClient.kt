package ie.bookanything.ai

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.BadRequestException
import com.anthropic.errors.InternalServerException
import com.anthropic.errors.NotFoundException
import com.anthropic.errors.PermissionDeniedException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.helpers.MessageAccumulator
import com.anthropic.models.messages.Message
import ie.bookanything.config.AppConfig
import java.time.Duration

/**
 * Anthropic Messages API via the official Java SDK.
 *
 * - Structured output through `output_config.format` (JSON schema) with explicit `effort`.
 * - Conversations stream (`createStreaming` + `MessageAccumulator`), with strict tools and `tool_choice: auto`
 *   (forced tool choice is a 400 on the default model). The stable system prompt carries an explicit cache
 *   breakpoint (tools render before it, so both are cached) and top-level automatic caching covers the growing
 *   conversation tail.
 * - Thinking is left at the model default (always on for Claude Opus 5.5; `thinking: disabled` is a 400); depth is
 *   controlled with `effort`. No assistant prefill.
 */
class AnthropicModelClient(
    apiKey: String,
    override val modelId: String,
    private val client: AnthropicClient = AnthropicOkHttpClient.builder()
        .apiKey(apiKey)
        .timeout(Duration.ofSeconds(120))
        .maxRetries(2)
        .build(),
) : ModelClient {
    /**
     * Structured calls aren't streamed and write up to 16k tokens, which can take longer than the conversation
     * client's 120 seconds: a timed-out attempt is billed by the provider and then retried from scratch, twice. They
     * get a timeout long enough to finish and a single retry.
     */
    private val structuredClient: AnthropicClient = client.withOptions { it.timeout(STRUCTURED_TIMEOUT).maxRetries(STRUCTURED_RETRIES) }

    override fun structured(request: StructuredRequest): ModelReply {
        val params = AnthropicMapping.structuredParams(modelId, request)
        val response = call { structuredClient.messages().create(params) }
        val text = response.content().mapNotNull { block -> block.text().map { it.text() }.orElse(null) }.joinToString("")
        return ModelReply(
            stopReason = StopReason.parse(response.stopReason().map { it.asString() }.orElse(null)),
            text = text,
            refusalExplanation = response.stopDetails().flatMap { it.explanation() }.orElse(null),
            usage = AnthropicMapping.usage(response.usage()),
            messageId = response.id(),
        )
    }

    override fun converse(request: ConverseRequest, sink: StreamSink): ConverseReply {
        val params = AnthropicMapping.converseParams(modelId, request)
        val accumulator = MessageAccumulator.create()
        val message: Message = call(
            usageSoFar = { runCatching { AnthropicMapping.usage(accumulator.message().usage()) }.getOrDefault(TokenUsage.NONE) },
        ) {
            client.messages().createStreaming(params).use { stream ->
                stream.stream().forEach { event ->
                    accumulator.accumulate(event)
                    event.contentBlockDelta().flatMap { it.delta().text() }.ifPresent { sink.text(it.text()) }
                }
            }
            accumulator.message()
        }
        return ConverseReply(
            stopReason = StopReason.parse(message.stopReason().map { it.asString() }.orElse(null)),
            blocks = message.content().mapNotNull(AnthropicMapping::fromResponse),
            usage = AnthropicMapping.usage(message.usage()),
            messageId = message.id(),
            refusalExplanation = message.stopDetails().flatMap { it.explanation() }.orElse(null),
        )
    }

    /** Maps SDK failures to [AiModelException] with a loggable reason (the SDK has already retried transient ones). */
    private fun <T> call(usageSoFar: () -> TokenUsage = { TokenUsage.NONE }, block: () -> T): T = try {
        block()
    } catch (e: NotFoundException) {
        throw AiModelException("model '$modelId' not found or not available to this API key (404)", e)
    } catch (e: UnauthorizedException) {
        throw AiModelException("ANTHROPIC_API_KEY was rejected (401)", e)
    } catch (e: PermissionDeniedException) {
        throw AiModelException("permission denied for this API key (403)", e)
    } catch (e: RateLimitException) {
        throw AiModelException("rate limited by the Anthropic API (429) after SDK retries", e)
    } catch (e: BadRequestException) {
        throw AiModelException("request rejected (400): ${e.message ?: e.javaClass.simpleName}", e)
    } catch (e: InternalServerException) {
        throw AiModelException("Anthropic API error (${e.statusCode()}) after SDK retries", e, usageSoFar())
    } catch (e: AnthropicServiceException) {
        throw AiModelException(
            "Anthropic API error (${e.statusCode()}, ${e.errorType().map { it.toString() }.orElse("unknown")})", e, usageSoFar(),
        )
    } catch (e: AnthropicIoException) {
        throw AiModelException("could not reach the Anthropic API: ${e.message ?: e.javaClass.simpleName}", e, usageSoFar())
    }

    companion object {
        const val DEFAULT_MODEL = "claude-opus-5-5"

        /** Long enough for a 16k-token structured reply at medium effort. */
        val STRUCTURED_TIMEOUT: Duration = Duration.ofMinutes(10)
        const val STRUCTURED_RETRIES = 1

        /** The configured model, or null without ANTHROPIC_API_KEY. */
        fun fromConfig(config: AppConfig): AnthropicModelClient? {
            val key = config.ai.anthropicApiKey ?: return null
            return AnthropicModelClient(key, config.ai.anthropicModel ?: DEFAULT_MODEL)
        }
    }
}
