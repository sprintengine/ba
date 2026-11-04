package ie.bookanything.ai

import com.anthropic.client.okhttp.AnthropicOkHttpClient
import ie.bookanything.support.LocalHttpServer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** The client's retry policy and what it sends, against a local server that always fails like an overloaded API. */
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

    @Test
    fun `a conversation sends each message with its role and blocks, tool calls included`() {
        LocalHttpServer { LocalHttpServer.Response(500, overloaded) }.use { server ->
            val sdk = AnthropicOkHttpClient.builder().apiKey("sk-ant-test").baseUrl(server.baseUrl)
                .timeout(Duration.ofSeconds(5)).maxRetries(0).build()
            val client = AnthropicModelClient("sk-ant-test", "claude-opus-5-5", sdk)
            val lookup = buildJsonObject { put("limit", 3) }
            val messages = listOf(
                ChatMessage(ChatRole.USER, listOf(ChatBlock.Text("Hi"))),
                ChatMessage(
                    ChatRole.ASSISTANT,
                    listOf(ChatBlock.Text("Let me look"), ChatBlock.ToolUse("toolu_1", "list_services", lookup)),
                ),
                ChatMessage(ChatRole.USER, listOf(ChatBlock.ToolResult("toolu_1", "[]", isError = true))),
            )
            val chat = ConverseRequest("system", emptyList(), messages, 100, Effort.LOW)
            assertFailsWith<AiModelException> { client.converse(chat, StreamSink.NONE) }

            val request = server.requests.single()
            // SDK 3 sends the key as a bearer token, on the API version it was built for (a new one is a migration to read).
            assertEquals("Bearer sk-ant-test", request.headers["authorization"])
            assertEquals("2026-10-21", request.headers["anthropic-version"])
            val expected = """
                [
                  {"role": "user", "content": [{"type": "text", "text": "Hi"}]},
                  {"role": "assistant", "content": [
                    {"type": "text", "text": "Let me look"},
                    {"type": "tool_use", "id": "toolu_1", "name": "list_services", "input": {"limit": 3}}
                  ]},
                  {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": "[]", "is_error": true}]}
                ]
            """
            assertEquals(Json.parseToJsonElement(expected), Json.parseToJsonElement(request.body.decodeToString()).jsonObject["messages"])
        }
    }
}
