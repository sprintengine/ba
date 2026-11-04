package ie.bookanything.ai.usage

import ie.bookanything.ai.AiCaller
import ie.bookanything.ai.AiModel
import ie.bookanything.ai.AiModelException
import ie.bookanything.ai.ConverseReply
import ie.bookanything.ai.ConverseRequest
import ie.bookanything.ai.ModelClient
import ie.bookanything.ai.ModelReply
import ie.bookanything.ai.StopReason
import ie.bookanything.ai.StreamSink
import ie.bookanything.ai.StructuredRequest
import ie.bookanything.ai.TokenUsage

/**
 * The metering decorator: every model call reserves credits first (AI_LIMIT_REACHED when refused), then settles the
 * reservation with the provider's usage, including calls that fail part-way. This is the only [AiModel] that wraps a
 * [ModelClient], so no feature can call the model unmetered.
 */
class MeteredAiModel(private val client: ModelClient, private val meter: AiMeter) : AiModel {
    override val modelId: String get() = client.modelId

    override fun complete(caller: AiCaller, request: StructuredRequest): ModelReply =
        metered(caller) { client.structured(request).let { Settled(it, it.usage, it.stopReason, it.messageId) } }

    override fun converse(caller: AiCaller, request: ConverseRequest, sink: StreamSink): ConverseReply =
        metered(caller) { client.converse(request, sink).let { Settled(it, it.usage, it.stopReason, it.messageId) } }

    private data class Settled<T>(val value: T, val usage: TokenUsage, val stop: StopReason, val id: String?)

    // Releases the reservation on any failure (including cancellation) and rethrows; nothing is swallowed.
    @Suppress("TooGenericExceptionCaught")
    private fun <T> metered(caller: AiCaller, call: () -> Settled<T>): T {
        val reservation = meter.reserve(caller, client.modelId)
        val result = try {
            call()
        } catch (e: AiModelException) {
            if (e.usage == TokenUsage.NONE) meter.release(reservation) else meter.settle(reservation, e.usage, null, null)
            throw e
        } catch (e: Throwable) {
            meter.release(reservation)
            throw e
        }
        meter.settle(reservation, result.usage, result.stop, result.id)
        return result.value
    }
}
