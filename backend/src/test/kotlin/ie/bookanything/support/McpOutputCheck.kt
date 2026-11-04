package ie.bookanything.support

import ie.bookanything.mcp.McpTool
import io.modelcontextprotocol.kotlin.sdk.types.McpJson
import io.modelcontextprotocol.kotlin.sdk.types.ToolSchema
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.serializer
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Checks a `tools/call` result as an MCP client would: a successful result's `structuredContent` must validate against
 * the tool's `outputSchema` (the TypeScript SDK refuses it otherwise). Every test that calls a tool through
 * [OAuthClientSim] or `McpServerTest` goes through this, so each tool is checked against real results.
 */
object McpOutputCheck {
    fun schemaOf(schema: ToolSchema): JsonObject = McpJson.encodeToJsonElement(serializer<ToolSchema>(), schema).jsonObject

    fun assertValid(tools: List<McpTool<*>>, name: String, result: JsonObject) {
        if (result["isError"]?.jsonPrimitive?.content == "true") return
        val tool = tools.firstOrNull { it.name == name } ?: return // unknown tools are the server's to refuse
        val schema = assertNotNull(tool.tool.outputSchema, "$name has no outputSchema")
        val content = result["structuredContent"] as? JsonObject ?: fail("$name returned no structuredContent: $result")
        val problems = JsonSchemaCheck.problems(schemaOf(schema), content)
        assertTrue(problems.isEmpty(), "$name's structuredContent doesn't match its outputSchema:\n${problems.joinToString("\n")}")
    }
}
