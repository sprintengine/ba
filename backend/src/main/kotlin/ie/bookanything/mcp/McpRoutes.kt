package ie.bookanything.mcp

import ie.bookanything.AppContext
import ie.bookanything.http.ApiError
import ie.bookanything.http.BodyLimits
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.openCors
import ie.bookanything.http.respondError
import ie.bookanything.mcp.business.businessMcpRoutes
import ie.bookanything.mcp.customer.customerMcpRoutes
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.ApplicationCall
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.response.header
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.modelcontextprotocol.kotlin.sdk.server.Server
import io.modelcontextprotocol.kotlin.sdk.server.StreamableHttpServerTransport
import io.modelcontextprotocol.kotlin.sdk.types.McpJson

/** Handles one stateless Streamable HTTP exchange (JSON responses, no session): each POST is a complete JSON-RPC exchange. */
suspend fun ApplicationCall.handleStatelessMcp(server: Server) {
    val transport = StreamableHttpServerTransport(
        StreamableHttpServerTransport.Configuration(enableJsonResponse = true, maxRequestBodySize = BodyLimits.DEFAULT),
    ).also { it.setSessionIdGenerator(null) }
    val session = server.createSession(transport)
    try {
        transport.handleRequest(null, this)
    } finally {
        session.close()
    }
}

suspend fun ApplicationCall.respondPostOnly() {
    response.header(HttpHeaders.Allow, HttpMethod.Post.value)
    respondError(HttpStatusCode.MethodNotAllowed, ApiError("NOT_FOUND", "Use POST."))
}

/**
 * `POST /v1/mcp` (anonymous), `POST /v1/mcp/customer` and, when switched on, `POST /v1/mcp/business` (OAuth). MCP's JSON
 * settings apply to these routes only.
 */
fun Route.mcpRoutes(ctx: AppContext) {
    route("/mcp") {
        install(ContentNegotiation) { json(McpJson) }
        // Browser-based MCP clients connect cross-origin; bearer tokens only, no cookies. Applies to /customer and /business
        // too. Mcp-Method and Mcp-Name are sent on every request from 2026-07-28 clients: a preflight refusing them fails
        // before the client can fall back to an older version.
        openCors(
            listOf(HttpMethod.Post, HttpMethod.Get, HttpMethod.Delete),
            headers = listOf(
                HttpHeaders.Authorization, HttpHeaders.Accept, "MCP-Protocol-Version", "Mcp-Method", "Mcp-Name", "Mcp-Session-Id",
                "Last-Event-ID",
            ),
            expose = listOf(HttpHeaders.WWWAuthenticate, "Mcp-Session-Id"),
        )
        post {
            ctx.rateLimiter.check(call, RateLimiter.MCP, ctx.now())
            call.handleStatelessMcp(AnonymousMcp.server(ctx, call))
        }
        get { call.respondPostOnly() }
        delete { call.respondPostOnly() }
        route("/customer") { customerMcpRoutes(ctx) }
        if (ctx.config.oauth.businessMcpEnabled) route("/business") { businessMcpRoutes(ctx) }
    }
}
