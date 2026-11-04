package ie.bookanything.mcp

import ie.bookanything.http.ApiException
import ie.bookanything.http.ApiJson
import io.modelcontextprotocol.kotlin.sdk.types.CallToolResult
import io.modelcontextprotocol.kotlin.sdk.types.TextContent
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.slf4j.LoggerFactory

/** Turns a tool handler's result or failure into an MCP `tools/call` result. */
object McpResults {
    private val log = LoggerFactory.getLogger(McpResults::class.java)

    suspend fun run(tool: String, block: suspend () -> JsonElement): CallToolResult = try {
        val result = block()
        CallToolResult(
            content = listOf(TextContent(result.toString())),
            structuredContent = result as? JsonObject ?: JsonObject(mapOf("items" to result)),
        )
    } catch (e: ApiException) {
        val fields = if (e.fields.isEmpty()) "" else " " + e.fields.entries.joinToString("; ") { "${it.key}: ${it.value}" }
        error("${e.code}: ${e.message}$fields")
    } catch (e: SerializationException) {
        error("INVALID_REQUEST: ${e.message?.lineSequence()?.firstOrNull()?.take(300).orEmpty()}")
    } catch (e: IllegalArgumentException) {
        error("INVALID_REQUEST: ${e.message?.take(300).orEmpty()}")
    } catch (e: CancellationException) {
        throw e
    } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Tool boundary: an isError result, details in the log.
        log.error("mcp tool {} failed", tool, e)
        error("INTERNAL_SERVER_ERROR: Something went wrong. Please try again.")
    }

    private fun error(text: String) = CallToolResult(content = listOf(TextContent(text)), isError = true)

    fun <T> encode(serializer: KSerializer<T>, value: T): JsonElement = ApiJson.encodeToJsonElement(serializer, value)
}
