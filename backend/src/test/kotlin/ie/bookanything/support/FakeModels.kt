package ie.bookanything.support

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
import ie.bookanything.ai.fake.FakeScript
import ie.bookanything.ai.fake.ScriptedModelClient
import kotlinx.serialization.json.JsonObject
import java.util.concurrent.CopyOnWriteArrayList

/** A structured-output reply, as the provider would send it, with plausible usage for metering. */
fun reply(stop: String, text: String, refusal: String? = null, usage: TokenUsage = TokenUsage(input = 2_000, output = 3_000)) =
    ModelReply(StopReason.parse(stop), text, refusal, usage, "msg_test")

/**
 * A raw [ModelClient] for integration tests: structured requests answered by [structured]; conversations by a
 * [ScriptedModelClient] when a script is given. Everything is recorded.
 */
class FakeModelClient(
    private val structured: (StructuredRequest) -> ModelReply = { throw AiModelException("no structured reply scripted") },
    script: FakeScript? = null,
) : ModelClient {
    override val modelId = "claude-opus-5-5"
    val structuredRequests = CopyOnWriteArrayList<StructuredRequest>()
    val conversations = CopyOnWriteArrayList<ConverseRequest>()
    @Volatile private var scripted = script?.let(::ScriptedModelClient)

    /** Replaces the conversation script (tests set it once the ids it refers to exist). */
    fun script(json: String) {
        scripted = ScriptedModelClient(FakeScript.parse(json))
    }

    override fun structured(request: StructuredRequest): ModelReply {
        structuredRequests += request
        return structured.invoke(request)
    }

    override fun converse(request: ConverseRequest, sink: StreamSink): ConverseReply {
        conversations += request
        return scripted?.converse(request, sink) ?: throw AiModelException("no conversation scripted")
    }

    companion object {
        fun scripted(json: String) = FakeModelClient(script = FakeScript.parse(json))
    }
}

/** An unmetered [AiModel] for unit tests of generators (production code only ever gets the metered one). */
class FakeAiModel(private val reply: (user: String) -> ModelReply) : AiModel {
    override val modelId = "claude-opus-5-5"
    val prompts = CopyOnWriteArrayList<String>()
    val callers = CopyOnWriteArrayList<AiCaller>()
    var lastSchema: JsonObject? = null
    var lastSystem: String? = null

    override fun complete(caller: AiCaller, request: StructuredRequest): ModelReply {
        callers += caller; prompts += request.user; lastSchema = request.schema; lastSystem = request.system
        return reply(request.user)
    }

    override fun converse(caller: AiCaller, request: ConverseRequest, sink: StreamSink): ConverseReply =
        throw AiModelException("not used")
}
