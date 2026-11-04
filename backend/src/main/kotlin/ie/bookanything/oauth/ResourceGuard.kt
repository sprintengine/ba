package ie.bookanything.oauth

import ie.bookanything.auth.CurrentUser
import ie.bookanything.auth.UserRepository
import ie.bookanything.db.Db
import io.ktor.http.HttpHeaders
import io.ktor.server.application.ApplicationCall
import java.time.Clock
import java.util.UUID

/** Who is calling an MCP resource: the user, through which OAuth client, with which scopes. */
data class McpPrincipal(
    val user: CurrentUser,
    val clientId: String,
    val scopes: Set<Scope>,
    val grantId: UUID,
    val resource: McpResource = McpResource.CUSTOMER,
) {
    fun has(scope: Scope) = Scope.satisfies(scopes, scope)
}

sealed interface BearerCheck {
    data class Authorized(val principal: McpPrincipal) : BearerCheck
    data object Missing : BearerCheck
    data class Rejected(val description: String) : BearerCheck
}

/**
 * Validates access tokens for an MCP resource (OAuth 2.1 5.2): opaque, looked up by hash, unexpired, unrevoked and
 * issued for that resource (audience). Only our own tokens are accepted, never passed through.
 */
class ResourceGuard(private val config: OAuthConfig, private val store: TokenStore, private val db: Db, private val clock: Clock) {

    fun check(call: ApplicationCall, resource: McpResource = McpResource.CUSTOMER): BearerCheck {
        val header = call.request.headers[HttpHeaders.Authorization] ?: return BearerCheck.Missing
        if (!header.startsWith("Bearer ", ignoreCase = true)) return BearerCheck.Rejected("Use a Bearer access token")
        val token = header.substring(7).trim()
        if (SecretKind.of(token) != SecretKind.ACCESS ||
            token.length > MAX_TOKEN_LENGTH
        ) {
            return BearerCheck.Rejected("The access token is invalid")
        }
        val now = clock.instant()
        val record = store.findToken(token)
        if (!TokenPolicy.isUsableAccess(record, now, config, resource)) {
            return BearerCheck.Rejected("The access token is invalid, expired or revoked")
        }
        val user = loadUser(record!!.userId) ?: return BearerCheck.Rejected("The account no longer exists")
        store.touchGrant(record.grantId, now)
        return BearerCheck.Authorized(McpPrincipal(user, record.clientId, record.scopes, record.grantId, resource))
    }

    private fun loadUser(id: UUID): CurrentUser? = db.txBlocking(readOnly = true) { conn -> UserRepository.findActiveById(conn, id) }

    /** `WWW-Authenticate` for 401/403 (RFC 6750 3, RFC 9728 5.1): where the metadata is and which scopes are needed. */
    fun challenge(
        resource: McpResource = McpResource.CUSTOMER,
        scopes: Collection<Scope> = Scope.of(resource),
        error: String? = null,
        description: String? = null,
    ): String = buildList {
        add("resource_metadata=\"${config.metadataUrl(resource)}\"")
        add("scope=\"${Scope.format(scopes)}\"")
        if (error != null) add("error=\"$error\"")
        if (description != null) add("error_description=\"${description.replace("\"", "'")}\"")
    }.joinToString(", ", prefix = "Bearer ")
}

/** Our access tokens are well under this; anything longer is rejected before a lookup. */
private const val MAX_TOKEN_LENGTH = 200
