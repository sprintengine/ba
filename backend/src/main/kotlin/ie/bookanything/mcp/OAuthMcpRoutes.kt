package ie.bookanything.mcp

import ie.bookanything.AppContext
import ie.bookanything.http.ApiError
import ie.bookanything.http.BodyLimits
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.ReplayableBody
import ie.bookanything.http.receiveJsonObjectOrNull
import ie.bookanything.http.respondError
import ie.bookanything.oauth.BearerCheck
import ie.bookanything.oauth.McpPrincipal
import ie.bookanything.oauth.McpResource
import ie.bookanything.oauth.Scope
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.header
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.modelcontextprotocol.kotlin.sdk.server.Server
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** For `tools/call`, the tool name in the JSON-RPC body (the MCP transport reads the body again: [ReplayableBody]). */
private suspend fun ApplicationCall.calledTool(): String? {
    val body = receiveJsonObjectOrNull(BodyLimits.DEFAULT) ?: return null
    if ((body["method"] as? JsonPrimitive)?.content != "tools/call") return null
    return ((body["params"] as? JsonObject)?.get("name") as? JsonPrimitive)?.content
}

/**
 * A signed-in MCP server at this route (stateless Streamable HTTP, OAuth 2.1 bearer tokens from our authorization
 * server, each for exactly one [resource]). No or bad token → 401 with `WWW-Authenticate` pointing at the resource's
 * protected resource metadata; a tool call without its scope ([scopeFor]) → 403 `insufficient_scope` naming the scopes
 * needed. A per-IP ceiling bounds floods before authentication, then each grant has its own limit.
 */
fun Route.oauthMcpRoutes(
    ctx: AppContext,
    resource: McpResource,
    ipLimit: RateLimiter.Limit,
    scopeFor: (String) -> Scope?,
    server: suspend (ApplicationCall, McpPrincipal) -> Server,
) {
    install(ReplayableBody) { maxBytes = BodyLimits.DEFAULT }

    suspend fun ApplicationCall.authorize(): McpPrincipal? {
        val guard = ctx.oauth.guard
        return when (val check = withContext(Dispatchers.IO) { guard.check(this@authorize, resource) }) {
            is BearerCheck.Authorized -> check.principal
            BearerCheck.Missing -> {
                response.header(HttpHeaders.WWWAuthenticate, guard.challenge(resource))
                respondError(
                    HttpStatusCode.Unauthorized, ApiError("UNAUTHENTICATED", "Connect your bookanything account to use this server."),
                )
                null
            }
            is BearerCheck.Rejected -> {
                response.header(
                    HttpHeaders.WWWAuthenticate, guard.challenge(resource, error = "invalid_token", description = check.description),
                )
                respondError(HttpStatusCode.Unauthorized, ApiError("UNAUTHENTICATED", check.description))
                null
            }
        }
    }

    post {
        ctx.rateLimiter.check(call, ipLimit, ctx.now())
        val principal = call.authorize() ?: return@post
        ctx.rateLimiter.checkKey("grant:${principal.grantId}", RateLimiter.MCP, ctx.now())
        val required = call.calledTool()?.let(scopeFor)
        if (required != null && !principal.has(required)) {
            call.response.header(
                HttpHeaders.WWWAuthenticate,
                ctx.oauth.guard.challenge(
                    resource, principal.scopes + required, "insufficient_scope", "This needs the ${required.value} permission",
                ),
            )
            call.respondError(
                HttpStatusCode.Forbidden,
                ApiError("FORBIDDEN", "This app wasn't given the ${required.value} permission. Reconnect it to allow it."),
            )
            return@post
        }
        call.handleStatelessMcp(server(call, principal))
    }
    get { if (call.authorize() != null) call.respondPostOnly() }
    delete { if (call.authorize() != null) call.respondPostOnly() }
}
