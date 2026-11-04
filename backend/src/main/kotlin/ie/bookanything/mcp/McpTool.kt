package ie.bookanything.mcp

import ie.bookanything.http.Errors
import ie.bookanything.oauth.Scope
import io.modelcontextprotocol.kotlin.sdk.server.Server
import io.modelcontextprotocol.kotlin.sdk.types.Tool
import io.modelcontextprotocol.kotlin.sdk.types.ToolAnnotations
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * One MCP tool: its definition for `tools/list`, the scope it needs (customer MCP only) and its handler, which runs
 * with the registry's context [C]. A registry is a list of these, so adding a tool is one entry.
 */
class McpTool<C : McpToolContext>(val tool: Tool, val scope: Scope?, val run: suspend C.(JsonObject) -> JsonElement) {
    val name: String get() = tool.name
}

/** What every tool context offers: the app and a rate limit check for whoever is calling. */
interface McpToolContext {
    val ctx: ie.bookanything.AppContext

    /** Throws `RATE_LIMITED` when the caller (an IP for anonymous use, the grant or user when signed in) is over [limit]. */
    suspend fun limit(limit: ie.bookanything.http.RateLimiter.Limit)

    /** Whether the caller was granted [scope] (the customer MCP's OAuth scopes; anonymous callers have none). */
    fun has(scope: Scope): Boolean
}

/**
 * Adds [tools] to this server, bound to [context]; failures become `isError` results with our error code. A tool's
 * scope is checked here, for every call: the route's 403 `insufficient_scope` only sees a single JSON-RPC request,
 * and a batch (a JSON array) runs every call in it.
 */
fun <C : McpToolContext> Server.addTools(tools: List<McpTool<C>>, context: C) {
    tools.forEach { t ->
        addTool(t.tool) { request ->
            McpResults.run(t.name) {
                t.scope?.let { scope ->
                    if (!context.has(scope)) {
                        throw Errors.forbidden("This app wasn't given the ${scope.value} permission. Reconnect it to allow it.")
                    }
                }
                t.run(context, request.arguments ?: JsonObject(emptyMap()))
            }
        }
    }
}

val READ_ONLY = ToolAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true, openWorldHint = false)
