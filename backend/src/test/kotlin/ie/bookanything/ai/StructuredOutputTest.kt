package ie.bookanything.ai

import ie.bookanything.http.ApiException
import ie.bookanything.http.Errors
import ie.bookanything.support.FakeAiModel
import ie.bookanything.support.reply
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.serializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class StructuredOutputTest {
    @Serializable
    data class Out(val name: String = "", val count: Int = 0)

    private val caller = AiCaller(AiFeature.BUSINESS_DRAFT, null, null)
    private val request = StructuredRequest("s", "u", JsonObject(emptyMap()))

    private fun outcome(model: AiModel) = model.completeStructured(caller, request, serializer<Out>())

    private fun failing(e: Exception) = FakeAiModel { throw e }

    @Test
    fun `output is decoded leniently`() {
        assertEquals(
            StructuredOutcome.Output(Out("a", 0)),
            outcome(FakeAiModel { reply("end_turn", """{"name":"a","count":null,"extra":true}""") }),
        )
    }

    @Test
    fun `refusals, truncation and bad JSON are unusable with a reason`() {
        assertEquals(
            StructuredOutcome.Unusable("model refused: policy"),
            outcome(FakeAiModel { reply("refusal", "", refusal = "policy") }),
        )
        assertEquals(StructuredOutcome.Unusable("model refused"), outcome(FakeAiModel { reply("refusal", "") }))
        assertEquals(StructuredOutcome.Unusable("output truncated (max_tokens)"), outcome(FakeAiModel { reply("max_tokens", "{") }))
        val bad = outcome(FakeAiModel { reply("end_turn", "not json") })
        assertEquals(true, (bad as StructuredOutcome.Unusable).reason.startsWith("output was not valid JSON for the schema: "))
    }

    @Test
    fun `failed calls are unusable but API errors are never hidden`() {
        assertEquals(StructuredOutcome.Unusable("timed out"), outcome(failing(AiModelException("timed out"))))
        assertEquals(
            StructuredOutcome.Unusable("unexpected error: IllegalStateException: boom"),
            outcome(failing(IllegalStateException("boom"))),
        )
        val limit = assertFailsWith<ApiException> { outcome(failing(Errors.aiLimit("out of credits"))) }
        assertEquals("AI_LIMIT_REACHED", limit.code)
    }
}
