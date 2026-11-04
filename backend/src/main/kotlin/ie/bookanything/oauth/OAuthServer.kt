package ie.bookanything.oauth

import ie.bookanything.auth.MemberBusinesses
import ie.bookanything.db.Db
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Clock

/** RFC 8414 authorization server metadata. */
@Serializable
data class AuthorizationServerMetadata(
    val issuer: String,
    @SerialName("authorization_endpoint") val authorizationEndpoint: String,
    @SerialName("token_endpoint") val tokenEndpoint: String,
    @SerialName("registration_endpoint") val registrationEndpoint: String,
    @SerialName("revocation_endpoint") val revocationEndpoint: String,
    @SerialName("scopes_supported") val scopesSupported: List<String>,
    @SerialName("response_types_supported") val responseTypesSupported: List<String> = listOf("code"),
    @SerialName("response_modes_supported") val responseModesSupported: List<String> = listOf("query"),
    @SerialName("grant_types_supported") val grantTypesSupported: List<String> = listOf("authorization_code", "refresh_token"),
    @SerialName("token_endpoint_auth_methods_supported") val tokenEndpointAuthMethodsSupported: List<String> = listOf("none"),
    @SerialName("revocation_endpoint_auth_methods_supported") val revocationEndpointAuthMethodsSupported: List<String> = listOf("none"),
    @SerialName("code_challenge_methods_supported") val codeChallengeMethodsSupported: List<String> = listOf(Pkce.METHOD),
    @SerialName("client_id_metadata_document_supported") val clientIdMetadataDocumentSupported: Boolean = true,
    @SerialName("authorization_response_iss_parameter_supported") val issParameterSupported: Boolean = true,
    @SerialName("service_documentation") val serviceDocumentation: String,
)

/** RFC 9728 protected resource metadata of one of our MCP servers. */
@Serializable
data class ProtectedResourceMetadata(
    val resource: String,
    @SerialName("authorization_servers") val authorizationServers: List<String>,
    @SerialName("scopes_supported") val scopesSupported: List<String>,
    @SerialName("bearer_methods_supported") val bearerMethodsSupported: List<String> = listOf("header"),
    @SerialName("resource_name") val resourceName: String = "bookanything",
    @SerialName("resource_documentation") val resourceDocumentation: String,
)

/**
 * Our minimal OAuth 2.1 authorization server for the signed-in MCP servers (docs/architecture.md section 20): the
 * customer one and, when switched on, the business one.
 */
class OAuthServer(val config: OAuthConfig, db: Db, fetcher: ClientMetadataFetcher, clock: Clock, val store: TokenStore = PgTokenStore(db)) {
    val clients = ClientRegistry(db, fetcher)
    val authorization = AuthorizationEndpoint(config, clients, store, clock) { userId ->
        db.txBlocking(readOnly = true) { conn -> MemberBusinesses.list(conn, userId) }
    }
    val tokens = TokenEndpoint(config, clients, store, clock)
    val guard = ResourceGuard(config, store, db, clock)

    private val docs get() = "${config.issuer}/help/ai-assistant"

    private fun docs(resource: McpResource) = when (resource) {
        McpResource.CUSTOMER -> docs
        McpResource.BUSINESS -> "${config.issuer}/help/ai-agents-for-business"
    }

    fun authorizationServerMetadata() = AuthorizationServerMetadata(
        issuer = config.issuer, authorizationEndpoint = config.authorizationEndpoint, tokenEndpoint = config.tokenEndpoint,
        registrationEndpoint = config.registrationEndpoint, revocationEndpoint = config.revocationEndpoint,
        // offline_access is accepted (clients add it to ask for refresh tokens, which we always issue).
        scopesSupported = config.scopes.map { it.value } + Scope.OFFLINE_ACCESS, serviceDocumentation = docs,
    )

    fun protectedResourceMetadata(resource: McpResource = McpResource.CUSTOMER) = ProtectedResourceMetadata(
        resource = config.url(resource), authorizationServers = listOf(config.issuer),
        scopesSupported = Scope.of(resource).map { it.value },
        resourceName = if (resource == McpResource.BUSINESS) "bookanything for business" else "bookanything",
        resourceDocumentation = docs(resource),
    )
}
