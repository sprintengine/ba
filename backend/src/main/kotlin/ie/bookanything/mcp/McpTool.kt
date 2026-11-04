package ie.bookanything.mcp

import ie.bookanything.http.Errors
import ie.bookanything.oauth.Scope
import io.modelcontextprotocol.kotlin.sdk.server.Server
import io.modelcontextprotocol.kotlin.sdk.types.Icon
import io.modelcontextprotocol.kotlin.sdk.types.Tool
import io.modelcontextprotocol.kotlin.sdk.types.ToolAnnotations
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * One MCP tool: its definition for `tools/list`, the scope it needs (customer MCP only) and its handler, which runs
 * with the registry's context [C]. A registry is a list of these, so adding a tool is one entry.
 */
class McpTool<C : McpToolContext>(val tool: Tool, val scope: Scope?, val run: suspend C.(JsonObject) -> JsonElement) {
    val name: String get() = tool.name

    /**
     * The tool as `tools/list` shows it: with our icon, and `_meta.securitySchemes` (read by ChatGPT, which offers to
     * connect the account before a tool that needs it): `oauth2` with the tool's scope, or `noauth` on the anonymous server.
     */
    fun listed(appBaseUrl: String): Tool = tool.copy(
        icons = McpIcons.of(appBaseUrl),
        meta = JsonObject(tool.meta.orEmpty() + ("securitySchemes" to securitySchemes())),
    )

    private fun securitySchemes(): JsonArray = JsonArray(
        listOf(
            JsonObject(
                if (scope == null) {
                    mapOf("type" to JsonPrimitive("noauth"))
                } else {
                    mapOf("type" to JsonPrimitive("oauth2"), "scopes" to JsonArray(listOf(JsonPrimitive(scope.value))))
                },
            ),
        ),
    )
}

/** bookanything's icon for MCP clients (servers and tools), served by the frontend. */
object McpIcons {
    fun of(appBaseUrl: String): List<Icon> = listOf(
        Icon("$appBaseUrl/icon.svg", "image/svg+xml", listOf("any")),
        Icon("$appBaseUrl/icon-192.png", "image/png", listOf("192x192")),
        Icon("$appBaseUrl/icon-512.png", "image/png", listOf("512x512")),
    )
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
        addTool(t.listed(context.ctx.config.appBaseUrl)) { request ->
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

/**
 * Carrying out a prepared change (confirm_action): it books, moves or cancels with a business, or changes a customer's
 * booking, so it reaches beyond the user and their account (openWorldHint). The tools that only prepare a change (book,
 * cancel_booking, …) are not open-world: nothing reaches anyone until the change is confirmed or approved.
 */
val CARRY_OUT = ToolAnnotations(readOnlyHint = false, destructiveHint = true, idempotentHint = true, openWorldHint = true)
