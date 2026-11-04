package ie.bookanything.ai

import ie.bookanything.http.ApiException
import kotlinx.serialization.DeserializationStrategy

/** What a structured-output call produced: the decoded output, or why it can't be used ([reason] is safe to log). */
sealed interface StructuredOutcome<out T> {
    data class Output<T>(val value: T) : StructuredOutcome<T>

    data class Unusable(val reason: String) : StructuredOutcome<Nothing>
}

/**
 * Makes a structured-output call and decodes the reply with [AiJson.modelOutput]. A refusal, truncation, failed call or
 * output that doesn't decode is [StructuredOutcome.Unusable], so the feature can fall back to its built-in generator.
 * An [ApiException] (e.g. `AI_LIMIT_REACHED` from the meter) is rethrown: it is never hidden behind a fallback.
 */
fun <T> AiModel.completeStructured(
    caller: AiCaller, request: StructuredRequest, output: DeserializationStrategy<T>,
): StructuredOutcome<T> = try {
    StructuredReplies.decode(complete(caller, request), output)
} catch (e: ApiException) {
    throw e
} catch (e: AiModelException) {
    StructuredOutcome.Unusable(e.reason)
} catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // AI fallback boundary: the caller uses its built-in generator.
    StructuredOutcome.Unusable("unexpected error: ${e.javaClass.simpleName}: ${e.message ?: e.javaClass.simpleName}")
}

object StructuredReplies {
    /** The reply's output, unless the model refused, ran out of tokens or wrote JSON that doesn't decode. */
    fun <T> decode(reply: ModelReply, output: DeserializationStrategy<T>): StructuredOutcome<T> = when (reply.stopReason) {
        StopReason.REFUSAL -> StructuredOutcome.Unusable("model refused" + reply.refusalExplanation?.let { ": $it" }.orEmpty())
        StopReason.MAX_TOKENS -> StructuredOutcome.Unusable("output truncated (max_tokens)")
        else -> try {
            StructuredOutcome.Output(AiJson.modelOutput.decodeFromString(output, reply.text))
        } catch (e: IllegalArgumentException) { // SerializationException or a failed `require`.
            StructuredOutcome.Unusable("output was not valid JSON for the schema: ${e.message?.take(200).orEmpty()}")
        }
    }
}
