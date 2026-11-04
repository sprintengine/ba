package ie.bookanything.ai

import com.anthropic.client.okhttp.AnthropicOkHttpClient
import ie.bookanything.support.LocalHttpServer
import kotlinx.serialization.json.JsonObject
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** The client's retry policy, against a local server that always fails like an overloaded API. */
class AnthropicModelClientTest {
    private val overloaded = """{"type":"error","error":{"type":"api_error","message":"Internal server error"}}"""

    @Test
    fun `structured calls retry once, conversations keep the client's retries`() {
        LocalHttpServer { LocalHttpServer.Response(500, overloaded) }.use { server ->
            val sdk = AnthropicOkHttpClient.builder().apiKey("sk-ant-test").baseUrl(server.baseUrl)
                .timeout(Duration.ofSeconds(5)).maxRetries(2).build()
            val client = AnthropicModelClient("sk-ant-test", "claude-opus-5-5", sdk)

            assertFailsWith<AiModelException> { client.structured(StructuredRequest("system", "user", JsonObject(emptyMap()))) }
            assertEquals(1 + AnthropicModelClient.STRUCTURED_RETRIES, server.requests.size, "each attempt is billed: one retry")

            server.requests.clear()
            val hi = listOf(ChatMessage(ChatRole.USER, listOf(ChatBlock.Text("Hi"))))
            val chat = ConverseRequest("system", emptyList(), hi, 100, Effort.LOW)
            assertFailsWith<AiModelException> { client.converse(chat, StreamSink.NONE) }
            assertEquals(3, server.requests.size)
        }
    }
}
