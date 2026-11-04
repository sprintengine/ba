package ie.bookanything.mcp

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.createRouteScopedPlugin
import io.ktor.server.response.respondText

/**
 * The Streamable HTTP transport's `Origin` rule: an `Origin` header that is present and invalid gets 403 (with a
 * JSON-RPC error, its id null). Our MCP servers are public and take bearer tokens, not cookies, so DNS rebinding
 * (what the rule is for: a local server reached from a web page) gains an attacker nothing, and any real origin is
 * allowed: browser-based MCP clients run on their own sites. What is refused is an origin no real client sends: `null`
 * (sandboxed frames, `file:` pages, redirects across origins) and anything that isn't `scheme://host[:port]`. Once it
 * has responded, the route's handler doesn't run (routing skips a handled call).
 */
val McpOriginCheck = createRouteScopedPlugin("McpOriginCheck") {
    onCall { call ->
        val origin = call.request.headers[HttpHeaders.Origin] ?: return@onCall
        if (!McpOrigins.isValid(origin)) {
            call.respondText(
                """{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Forbidden: invalid Origin"}}""",
                ContentType.Application.Json, HttpStatusCode.Forbidden,
            )
        }
    }
}

object McpOrigins {
    /** `scheme://host[:port]`: a DNS name or IPv4 address (no userinfo), or an IPv6 literal; nothing after. */
    private val ORIGIN = Regex("^[a-z][a-z0-9+.-]*://(\\[[0-9a-f:.]+]|[a-z0-9._~-]+)(:[0-9]{1,5})?$", RegexOption.IGNORE_CASE)

    /** A serialized origin (RFC 6454), never `null`. */
    fun isValid(origin: String): Boolean = origin.length <= MAX_LENGTH && ORIGIN.matches(origin)

    private const val MAX_LENGTH = 300
}
