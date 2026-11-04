package ie.bookanything.support

import ie.bookanything.mcp.business.BusinessTools
import ie.bookanything.mcp.customer.CustomerTools
import ie.bookanything.oauth.Pkce
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.parameters
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.URI
import java.net.URLDecoder
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.assertEquals

/**
 * Plays an MCP client: registers, runs the authorization code flow with PKCE and calls an MCP server: the customer one
 * by default, the business one with [business].
 */
class OAuthClientSim(
    private val api: Api,
    val redirectUri: String = "https://client.example/callback",
    val resource: String = "http://localhost:3000/mcp",
    val mcpPath: String = "/v1/mcp/customer",
) {
    lateinit var clientId: String
    val verifier = "v-" + ie.bookanything.auth.TokenService.randomToken(40)
    val challenge get() = Pkce.challengeFor(verifier)
    private val ids = AtomicInteger(0)

    suspend fun register(name: String = "Test Assistant", redirects: List<String> = listOf(redirectUri)): OAuthClientSim {
        val res = api.post(
            "/v1/oauth/register",
            jsonOf(
                "client_name" to name, "redirect_uris" to redirects, "token_endpoint_auth_method" to "none",
                "grant_types" to listOf("authorization_code", "refresh_token"),
            ),
        )
        assertStatus(HttpStatusCode.Created, res)
        clientId = res.obj().s("client_id")
        return this
    }

    fun authorizeParams(
        scope: String? = null, redirect: String = redirectUri, state: String = "state-123", withChallenge: Boolean = true,
        resource: String? = this.resource, method: String = "S256",
    ): Map<String, String?> = mapOf(
        "clientId" to clientId, "redirectUri" to redirect, "responseType" to "code",
        "codeChallenge" to if (withChallenge) challenge else null, "codeChallengeMethod" to method,
        "scope" to scope, "state" to state, "resource" to resource,
    )

    /** `GET /v1/oauth/authorize` as the consent page does. */
    suspend fun check(user: TestUser, params: Map<String, String?>): HttpResponse {
        val q = mapOf(
            "client_id" to params["clientId"], "redirect_uri" to params["redirectUri"], "response_type" to params["responseType"],
            "code_challenge" to params["codeChallenge"], "code_challenge_method" to params["codeChallengeMethod"],
            "scope" to params["scope"],
            "state" to params["state"], "resource" to params["resource"],
        )
            .filterValues { it != null }.entries.joinToString("&") { "${it.key}=${java.net.URLEncoder.encode(it.value, Charsets.UTF_8)}" }
        return api.get("/v1/oauth/authorize?$q", user.token)
    }

    /** Approves (or denies) and returns the redirect the browser is sent to. */
    suspend fun decide(user: TestUser, params: Map<String, String?>, approve: Boolean = true): String {
        val res = api.post("/v1/oauth/authorize", jsonOf("request" to params, "approve" to approve), user.token)
        assertStatus(HttpStatusCode.OK, res)
        return res.obj().s("redirectTo")
    }

    fun query(url: String): Map<String, String> = URI(url).rawQuery.orEmpty().split('&').filter { it.isNotEmpty() }.associate {
        val (k, v) = it.split('=', limit = 2)
        k to URLDecoder.decode(v, Charsets.UTF_8)
    }

    suspend fun code(user: TestUser, scope: String? = null): String = query(decide(user, authorizeParams(scope))).getValue("code")

    suspend fun token(vararg form: Pair<String, String?>): HttpResponse = api.client.submitForm(
        "/v1/oauth/token",
        parameters {
            form.forEach { (k, v) -> if (v != null) append(k, v) }
        },
    )

    suspend fun exchange(code: String, verifier: String = this.verifier, redirect: String = redirectUri) = token(
        "grant_type" to "authorization_code", "code" to code, "client_id" to clientId, "redirect_uri" to redirect,
        "code_verifier" to verifier, "resource" to resource,
    )

    suspend fun refresh(refreshToken: String, scope: String? = null) =
        token("grant_type" to "refresh_token", "refresh_token" to refreshToken, "client_id" to clientId, "scope" to scope)

    /** Access + refresh token for [user] via the whole flow. */
    suspend fun connect(user: TestUser, scope: String? = null): JsonObject {
        val res = exchange(code(user, scope))
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()
    }

    suspend fun mcp(
        accessToken: String?, method: String, params: JsonObject = JsonObject(emptyMap()),
    ): HttpResponse = api.client.post(mcpPath) {
        if (accessToken != null) header(HttpHeaders.Authorization, "Bearer $accessToken")
        header("Accept", "application/json, text/event-stream")
        header("MCP-Protocol-Version", "2025-11-25")
        contentType(ContentType.Application.Json)
        setBody(
            buildJsonObject {
                put("jsonrpc", "2.0"); put("id", ids.incrementAndGet()); put("method", method); put(
                    "params",
                    params,
                )
            }.toString(),
        )
    }

    suspend fun rpc(accessToken: String, method: String, params: JsonObject = JsonObject(emptyMap())): JsonObject {
        val res = mcp(accessToken, method, params)
        val text = res.bodyAsText()
        assertEquals(HttpStatusCode.OK, res.status, text)
        return parse(text).jsonObject["result"]!!.jsonObject
    }

    /** `tools/call`; returns the result (check [isError]). */
    suspend fun call(accessToken: String, tool: String, args: JsonElement = JsonObject(emptyMap())): JsonObject =
        rpc(accessToken, "tools/call", buildJsonObject { put("name", tool); put("arguments", args) }).also {
            McpOutputCheck.assertValid(if (mcpPath == BUSINESS_MCP_PATH) BusinessTools.ALL else CustomerTools.ALL, tool, it)
        }

    /** The same app (same client id), connecting to the business MCP. */
    fun forBusiness(): OAuthClientSim =
        OAuthClientSim(api, redirectUri, BUSINESS_RESOURCE, BUSINESS_MCP_PATH).also { it.clientId = clientId }

    companion object {
        const val BUSINESS_RESOURCE = "http://localhost:3000/mcp/business"
        const val BUSINESS_MCP_PATH = "/v1/mcp/business"

        /** A new app connecting to the business MCP. */
        fun business(api: Api, redirectUri: String = "https://client.example/callback") =
            OAuthClientSim(api, redirectUri, BUSINESS_RESOURCE, BUSINESS_MCP_PATH)

        fun isError(result: JsonObject) = result["isError"]?.jsonPrimitive?.content == "true"
        fun text(result: JsonObject) = result["content"]!!.jsonArray.first().jsonObject["text"]!!.jsonPrimitive.content
        fun data(result: JsonObject) = result["structuredContent"]!!.jsonObject
    }
}
