package ie.bookanything.oauth

import ie.bookanything.AppContext
import ie.bookanything.http.ApiException
import ie.bookanything.http.BodyLimits
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.openCors
import ie.bookanything.http.parseUuid
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveBoundedText
import ie.bookanything.http.receiveJsonObjectOrNull
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.parseQueryString
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.contentType
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer

// Per IP, with room for AI platforms that call from a few shared egress addresses for all of their users.
val OAUTH_TOKEN_LIMIT = RateLimiter.Limit("oauth-token", 600, 60)
val OAUTH_REGISTER_LIMIT = RateLimiter.Limit("oauth-register", 300, 3600)
val OAUTH_AUTHORIZE_LIMIT = RateLimiter.Limit("oauth-authorize", 60, 600)

/** Runs an OAuth protocol endpoint: rate limit, blocking work on IO, errors in OAuth's own JSON format. */
private suspend fun ApplicationCall.oauthEndpoint(
    ctx: AppContext, limit: RateLimiter.Limit, block: suspend () -> Pair<HttpStatusCode, String>,
) {
    try {
        try { ctx.rateLimiter.check(this, limit, ctx.now()) } catch (_: ApiException) { throw OAuthException.rateLimited() }
        val (status, body) = block()
        respondOAuthJson(status, body)
    } catch (e: OAuthException) {
        // RFC 6749 5.2: a client that authenticated with the Authorization header is told the scheme it may use.
        val basic = request.headers[HttpHeaders.Authorization]?.startsWith("Basic", ignoreCase = true) == true
        if (e.error == "invalid_client" && basic) response.header(HttpHeaders.WWWAuthenticate, "Basic realm=\"bookanything\"")
        respondOAuthError(e)
    }
}

private suspend fun ApplicationCall.formParams(): Map<String, String?> {
    if (request.contentType().withoutParameters() != ContentType.Application.FormUrlEncoded) {
        throw OAuthException.invalidRequest("Send the request as application/x-www-form-urlencoded")
    }
    val p = parseQueryString(receiveBoundedText(BodyLimits.OAUTH))
    return p.names().associateWith { p[it] }
}

/**
 * The form parameters, with `client_id` also accepted from HTTP Basic (RFC 6749 2.3.1): some clients identify themselves
 * that way even as public clients. Any password is ignored: our clients have no secret (`none`), and possession is
 * proven by PKCE or the refresh token. A `client_id` in the body wins (the header, unauthenticated, adds nothing then).
 */
private suspend fun ApplicationCall.clientParams(): Map<String, String?> {
    val params = formParams()
    if (!params["client_id"].isNullOrBlank()) return params
    val basic = OAuthBasic.clientId(request.headers[HttpHeaders.Authorization]) ?: return params
    return params + ("client_id" to basic)
}

/** `/.well-known/…` metadata at the routing root (the frontend rewrites the same paths on its origin). */
fun Route.oauthWellKnownRoutes(ctx: AppContext) {
    val server = ctx.oauth
    route("/.well-known") {
        openCors(listOf(HttpMethod.Get))
        get("/oauth-authorization-server") {
            call.respondOAuthJson(
                HttpStatusCode.OK,
                OAuthJson.encodeToString(serializer<AuthorizationServerMetadata>(), server.authorizationServerMetadata()),
            )
        }
        // RFC 9728: with the resource's path inserted (/.well-known/oauth-protected-resource/mcp, …/mcp/business), and
        // the customer resource's at the root too (clients that predate the path form).
        val prm = { r: McpResource ->
            OAuthJson.encodeToString(serializer<ProtectedResourceMetadata>(), server.protectedResourceMetadata(r))
        }
        get("/oauth-protected-resource") { call.respondOAuthJson(HttpStatusCode.OK, prm(McpResource.CUSTOMER)) }
        get("/oauth-protected-resource/{rest...}") {
            val rest = call.parameters.getAll("rest").orEmpty().joinToString("/")
            val resource = server.config.resourceAtPath("/$rest") ?: throw Errors.notFound()
            call.respondOAuthJson(HttpStatusCode.OK, prm(resource))
        }
    }
}

@Serializable
data class ConnectedAppDto(
    val id: String,
    val clientId: String,
    val name: String,
    val clientUri: String?,
    val kind: String,
    val redirectHost: String,
    /** customer (the user's bookings) | business (the businesses they belong to) */
    val audience: String,
    val scopes: List<ScopeDto>,
    val connectedAt: String,
    val lastUsedAt: String?,
)

/** `/v1/oauth/…` and `/v1/me/connected-apps`. */
fun Route.oauthRoutes(ctx: AppContext) {
    val server = ctx.oauth

    // Called by MCP clients, some from the browser: open CORS (no cookies involved).
    route("/oauth/register") {
        openCors(listOf(HttpMethod.Post))
        post {
            call.oauthEndpoint(ctx, OAUTH_REGISTER_LIMIT) {
                val body = call.receiveJsonObjectOrNull(BodyLimits.OAUTH)
                    ?: throw OAuthException.invalidClientMetadata("Send the client metadata as a JSON object")
                val registered = withContext(Dispatchers.IO) { server.clients.register(body, ctx.now()) }
                HttpStatusCode.Created to OAuthJson.encodeToString(serializer<RegistrationResponse>(), registered)
            }
        }
    }

    route("/oauth/token") {
        openCors(listOf(HttpMethod.Post), headers = listOf(HttpHeaders.Authorization), expose = listOf(HttpHeaders.WWWAuthenticate))
        post {
            call.oauthEndpoint(ctx, OAUTH_TOKEN_LIMIT) {
                val params = call.clientParams()
                HttpStatusCode.OK to OAuthJson.encodeToString(
                    serializer<TokenResponse>(), withContext(Dispatchers.IO) { server.tokens.exchange(params) },
                )
            }
        }
    }

    route("/oauth/revoke") {
        openCors(listOf(HttpMethod.Post), headers = listOf(HttpHeaders.Authorization), expose = listOf(HttpHeaders.WWWAuthenticate))
        post {
            call.oauthEndpoint(ctx, OAUTH_TOKEN_LIMIT) {
                val params = call.clientParams()
                withContext(Dispatchers.IO) { server.tokens.revoke(params) }
                HttpStatusCode.OK to "{}"
            }
        }
    }

    // The consent page (Next.js /oauth/authorize) calls these with the signed-in user's session.
    get("/oauth/authorize") {
        val user = ctx.auth.requireUser(call)
        val q = call.request.queryParameters
        val req = AuthorizeRequest(
            q["client_id"], q["redirect_uri"], q["response_type"], q["code_challenge"], q["code_challenge_method"],
            q["scope"], q["state"], q["resource"],
        )
        call.respond(withContext(Dispatchers.IO) { server.authorization.check(user, req) })
    }

    post("/oauth/authorize") {
        ctx.rateLimiter.check(call, OAUTH_AUTHORIZE_LIMIT, ctx.now())
        val user = ctx.auth.requireUser(call)
        val input = call.receiveBody<AuthorizeDecisionInput>(BodyLimits.OAUTH)
        call.respond(RedirectDto(withContext(Dispatchers.IO) { server.authorization.decide(user, input.request, input.approve) }))
    }

    get("/me/connected-apps") {
        val user = ctx.auth.requireUser(call)
        val apps = withContext(Dispatchers.IO) { server.store.activeGrants(user.id) }
        call.respond(
            apps.map { g ->
                ConnectedAppDto(
                    g.id.toString(), g.clientId, g.clientName, g.clientUri, g.clientKind, RedirectUris.displayHost(g.redirectUri),
                    // By its scopes: a grant for a resource since switched off still says what it was for.
                    (if (g.scopes.any { it.resource == McpResource.BUSINESS }) McpResource.BUSINESS else McpResource.CUSTOMER).value,
                    g.scopes.sortedBy { it.ordinal }.map { it.toDto() }, g.consentedAt.toString(), g.lastUsedAt?.toString(),
                )
            },
        )
    }

    delete("/me/connected-apps/{grantId}") {
        val user = ctx.auth.requireUser(call)
        val id = parseUuid(call.parameters["grantId"], "grantId")
        val revoked = withContext(Dispatchers.IO) { server.store.revokeUserGrant(user.id, id, ctx.now()) }
        if (!revoked) throw Errors.notFound("Connected app")
        call.respond(HttpStatusCode.NoContent)
    }
}
