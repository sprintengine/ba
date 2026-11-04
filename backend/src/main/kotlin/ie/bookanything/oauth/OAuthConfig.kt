package ie.bookanything.oauth

import java.net.URI
import java.time.Duration

/**
 * Where the authorization server and the MCP resources live, as clients see them. By default everything is on the
 * frontend origin (`APP_BASE_URL`): the consent page is the Next.js route `/oauth/authorize`, and Next.js rewrites
 * `/api/…`, `/.well-known/oauth-…`, `/mcp` and `/mcp/business` to this API.
 */
data class OAuthConfig(
    /** Authorization server issuer identifier (RFC 8414), e.g. `https://bookanything.ie`. */
    val issuer: String,
    /** Public base URL of this API, e.g. `https://bookanything.ie/api`. */
    val apiBaseUrl: String,
    /** Canonical URI of the customer MCP server (RFC 8707 resource / RFC 9728 `resource`), e.g. `https://bookanything.ie/mcp`. */
    val resource: String,
    /**
     * Canonical URI of the business MCP server, e.g. `https://bookanything.ie/mcp/business`; null while it is switched
     * off (`BUSINESS_MCP_ENABLED`): then it is not served, advertised or authorized.
     */
    val businessResource: String? = null,
    val accessTokenTtl: Duration = Duration.ofHours(1),
    val refreshTokenTtl: Duration = DEFAULT_REFRESH_TOKEN_TTL,
    val codeTtl: Duration = DEFAULT_CODE_TTL,
) {
    val authorizationEndpoint get() = "$issuer/oauth/authorize"
    val tokenEndpoint get() = "$apiBaseUrl/v1/oauth/token"
    val registrationEndpoint get() = "$apiBaseUrl/v1/oauth/register"
    val revocationEndpoint get() = "$apiBaseUrl/v1/oauth/revoke"

    /** Whether the business MCP is switched on (`BUSINESS_MCP_ENABLED`). */
    val businessMcpEnabled: Boolean get() = businessResource != null

    /** The resources this deployment serves. */
    val resources: List<McpResource> get() = listOfNotNull(McpResource.CUSTOMER, McpResource.BUSINESS.takeIf { businessResource != null })

    /** The scopes of the resources this deployment serves. */
    val scopes: List<Scope> get() = Scope.entries.filter { it.resource in resources }

    /** The URI of [resource]; it must be served. */
    fun url(resource: McpResource): String = when (resource) {
        McpResource.CUSTOMER -> this.resource
        McpResource.BUSINESS -> checkNotNull(businessResource) { "The business MCP is switched off" }
    }

    /** Path part of the resource ("/mcp"); its protected resource metadata is at `/.well-known/oauth-protected-resource/mcp`. */
    fun path(resource: McpResource): String = URI(url(resource)).rawPath.orEmpty().trimEnd('/')

    fun metadataUrl(resource: McpResource): String = URI(url(resource)).let {
        "${it.scheme}://${it.rawAuthority}/.well-known/oauth-protected-resource${path(resource)}"
    }

    val resourcePath: String get() = path(McpResource.CUSTOMER)
    val resourceMetadataUrl: String get() = metadataUrl(McpResource.CUSTOMER)

    /** Which served resource [raw] names (RFC 8707 comparison: scheme and host case-insensitive, trailing slash ignored). */
    fun resourceFor(raw: String?): McpResource? {
        if (raw.isNullOrBlank()) return null
        val c = canonical(raw) ?: return null
        return resources.firstOrNull { canonical(url(it)) == c }
    }

    fun isOurResource(raw: String?): Boolean = resourceFor(raw) != null

    /** The served resource whose metadata path is [path] ("/mcp/business"), if any. */
    fun resourceAtPath(path: String): McpResource? = resources.firstOrNull { path(it) == path.trimEnd('/') }

    companion object {
        fun canonical(raw: String): String? = runCatching {
            val u = URI(raw.trim())
            if (u.rawFragment != null || !u.isAbsolute) return null
            "${u.scheme.lowercase()}://${u.rawAuthority.lowercase()}${u.rawPath.orEmpty().trimEnd('/')}${u.rawQuery?.let { "?$it" }.orEmpty()}"
        }.getOrNull()

        /**
         * `BUSINESS_MCP_ENABLED` switches the business MCP on (`true`, the default) or off (`false`, a kill switch that stops
         * every member's app at once).
         */
        fun fromEnvironment(str: (String) -> String?, appBaseUrl: String): OAuthConfig {
            val issuer = (str("OAUTH_ISSUER") ?: appBaseUrl).trimEnd('/')
            val resource = (str("MCP_RESOURCE_URL") ?: "$appBaseUrl/mcp").trimEnd('/')
            val business = when (str("BUSINESS_MCP_ENABLED")?.trim()?.lowercase()) {
                "true", "1", "yes" -> true
                "false", "0", "no" -> false
                null, "" -> true
                else -> throw IllegalArgumentException("BUSINESS_MCP_ENABLED must be true or false")
            }
            return OAuthConfig(
                issuer = issuer,
                apiBaseUrl = (str("PUBLIC_API_URL") ?: "$appBaseUrl/api").trimEnd('/'),
                resource = resource,
                businessResource = if (business) (str("MCP_BUSINESS_RESOURCE_URL") ?: "$resource/business").trimEnd('/') else null,
            )
        }
    }
}

private val DEFAULT_REFRESH_TOKEN_TTL: Duration = Duration.ofDays(30)
private val DEFAULT_CODE_TTL: Duration = Duration.ofMinutes(5)
