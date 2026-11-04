package ie.bookanything.oauth

import ie.bookanything.auth.CurrentUser
import ie.bookanything.auth.MemberBusiness
import ie.bookanything.http.Errors
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Clock

/** The authorization request parameters (RFC 6749 4.1.1 + PKCE + RFC 8707 resource), as the consent page relays them. */
@Serializable
data class AuthorizeRequest(
    val clientId: String? = null,
    val redirectUri: String? = null,
    val responseType: String? = null,
    val codeChallenge: String? = null,
    val codeChallengeMethod: String? = null,
    val scope: String? = null,
    val state: String? = null,
    val resource: String? = null,
)

@Serializable
data class ConsentClientDto(
    val clientId: String,
    val name: String,
    val uri: String?,
    /** dynamic | metadata_document */
    val kind: String,
    val redirectUri: String,
    /** Shown prominently: where the user is sent back to. */
    val redirectHost: String,
    /** Only loopback/app redirects: anyone on the device could pose as this app, so the page warns. */
    val localOnly: Boolean,
)

@Serializable
data class ConsentUserDto(val email: String?, val name: String?)

/** A business a business-MCP connection will reach, with the user's role there. */
@Serializable
data class ConsentBusinessDto(
    val name: String,
    val slug: String,
    /** owner | admin | staff */
    val role: String,
    /**
     * False when its owner doesn't let this member use AI apps there (turned off, or owners and admins only): it is
     * listed, but the app can't use it until the owner allows it.
     */
    val aiAgentsAllowed: Boolean,
)

/** `GET /v1/oauth/authorize`: either show the consent screen or send the browser straight back with an error. */
@Serializable
sealed interface AuthorizeCheckDto {
    @Serializable @SerialName("consent")
    data class Consent(
        val client: ConsentClientDto,
        val scopes: List<ScopeDto>,
        val resource: String,
        /** customer (the user's own bookings, `/mcp`) | business (the businesses they belong to, `/mcp/business`) */
        val audience: String,
        val user: ConsentUserDto,
        /** The user already approved this app for these scopes. */
        val previouslyApproved: Boolean,
        /** For the business audience: every business the connection reaches (each call checks the role again). */
        val businesses: List<ConsentBusinessDto> = emptyList(),
    ) : AuthorizeCheckDto

    @Serializable @SerialName("redirect")
    data class Redirect(val redirectTo: String) : AuthorizeCheckDto
}

@Serializable
data class AuthorizeDecisionInput(val request: AuthorizeRequest, val approve: Boolean)

@Serializable
data class RedirectDto(val redirectTo: String)

/**
 * The authorization endpoint's logic behind the Next.js consent page (`/oauth/authorize`): the page signs the user in
 * with our normal web login (Clerk or dev auth), then calls these with the user's session.
 *
 * Errors about the client or redirect URI are shown on our page and never redirected (no open redirect,
 * RFC 6749 4.1.2.1); every other error goes back to the client's registered redirect URI with `state` and `iss`.
 */
class AuthorizationEndpoint(
    private val config: OAuthConfig,
    private val clients: ClientRegistry,
    private val store: TokenStore,
    private val clock: Clock,
    /** The businesses a user is an active member of (the business resource's consent lists them). */
    private val memberBusinesses: (java.util.UUID) -> List<MemberBusiness> = { emptyList() },
) {
    private data class Checked(
        val client: OAuthClient,
        val redirectUri: String,
        val scopes: Set<Scope>,
        val challenge: String,
        val target: McpResource,
    ) {
        fun resource(config: OAuthConfig) = config.url(target)
    }

    private sealed interface Validation {
        data class Ok(val checked: Checked) : Validation
        data class Failed(val redirectTo: String) : Validation
    }

    /** An RFC 6749 4.1.2.1 error sent back to the client's redirect URI. */
    private class Refusal(val error: String, val description: String)

    private fun validate(req: AuthorizeRequest): Validation {
        val clientId = req.clientId?.trim().orEmpty()
        val client = clients.resolve(clientId, clock.instant())
            ?: throw Errors.invalid(
                "This app isn't registered with bookanything, so it can't be connected.", mapOf("client_id" to "Unknown client"),
            )
        val redirect = req.redirectUri?.trim()
        if (redirect.isNullOrEmpty() || !RedirectUris.matches(client.redirectUris, redirect)) {
            throw Errors.invalid(
                "The app sent a return address it didn't register, so we stopped here for your safety.",
                mapOf("redirect_uri" to "Not registered for this client"),
            )
        }
        val target = target(req)
        return when (val refusal = refusal(req, target)) {
            // No refusal means a target and a challenge. Scopes are never refused: ones we don't have or of the other
            // server are dropped (ScopeRequest).
            null -> Validation.Ok(Checked(client, redirect, ScopeRequest.parse(req.scope, target!!), req.codeChallenge!!, target))
            else -> Validation.Failed(errorRedirect(redirect, req.state, refusal.error, refusal.description))
        }
    }

    /**
     * RFC 8707: the token may only be for one of our MCP resources. A client that names none gets the one its scopes
     * are for (the customer one unless it asks only for business scopes, and the business one is served).
     */
    private fun target(req: AuthorizeRequest): McpResource? {
        val raw = req.resource?.trim()?.takeIf { it.isNotEmpty() } ?: return ScopeRequest.impliedResource(req.scope)
            .takeIf { it in config.resources } ?: McpResource.CUSTOMER
        return config.resourceFor(raw)
    }

    /** The first problem with a request from a known client to one of its redirect URIs, or null. */
    private fun refusal(req: AuthorizeRequest, target: McpResource?): Refusal? = when {
        req.responseType != "code" -> Refusal("unsupported_response_type", "Only response_type=code is supported")
        !Pkce.isValidChallenge(req.codeChallenge) -> Refusal("invalid_request", "PKCE is required: send a S256 code_challenge")
        req.codeChallengeMethod != Pkce.METHOD -> Refusal("invalid_request", "code_challenge_method must be S256")
        target == null -> Refusal("invalid_target", "Unknown resource")
        req.state != null && req.state.length > 1000 -> Refusal("invalid_request", "state is too long")
        else -> null
    }

    /**
     * The businesses a business-resource connection reaches; refused on our page (not redirected: nothing is wrong with
     * the app) when the user belongs to none.
     */
    private fun businessesFor(user: CurrentUser, target: McpResource): List<ConsentBusinessDto> {
        if (target != McpResource.BUSINESS) return emptyList()
        val businesses = memberBusinesses(user.id)
        if (businesses.isEmpty()) {
            throw Errors.policy(
                "You aren't a member of a business on bookanything, so there's nothing for this app to manage. To book " +
                    "appointments from your AI assistant, connect it to ${config.url(McpResource.CUSTOMER)} instead.",
            )
        }
        return businesses.map { ConsentBusinessDto(it.name, it.slug, it.role.value, it.agentsAllowed) }
    }

    fun check(user: CurrentUser, req: AuthorizeRequest): AuthorizeCheckDto = when (val v = validate(req)) {
        is Validation.Failed -> AuthorizeCheckDto.Redirect(v.redirectTo)
        is Validation.Ok -> with(v.checked) {
            AuthorizeCheckDto.Consent(
                client = ConsentClientDto(
                    client.clientId, client.name, verifiedWebsite(client, redirectUri), client.kind.value,
                    redirectUri,
                    // The redirect this request uses: a client that also registered an https one is no safer on loopback.
                    RedirectUris.displayHost(redirectUri), !redirectUri.startsWith("https://", ignoreCase = true),
                ),
                scopes = scopes.sortedBy { it.ordinal }.map { it.toDto() },
                resource = resource(config),
                audience = target.value,
                user = ConsentUserDto(user.email, user.name),
                previouslyApproved = store.hasConsent(user.id, client.clientId, scopes, resource(config)),
                businesses = businessesFor(user, target),
            )
        }
    }

    /** Records consent and issues a code, or sends `access_denied`. Returns where to send the browser. */
    fun decide(user: CurrentUser, req: AuthorizeRequest, approve: Boolean): String {
        val c = when (val v = validate(req)) {
            is Validation.Failed -> return v.redirectTo
            is Validation.Ok -> v.checked
        }
        if (!approve) return errorRedirect(c.redirectUri, req.state, "access_denied", "The user declined")
        businessesFor(user, c.target)
        val now = clock.instant()
        val resource = c.resource(config)
        val grantId = store.recordConsent(user.id, c.client.clientId, c.scopes, resource, c.redirectUri, now)
        val code = store.issueCode(grantId, c.redirectUri, c.challenge, c.scopes, resource, now.plus(config.codeTtl))
        return RedirectUris.withParams(c.redirectUri, listOf("code" to code, "state" to req.state, "iss" to config.issuer))
    }

    /**
     * The app's website as far as we can vouch for it: a metadata document was served by its own host; a registered
     * (DCR) `client_uri` is self-asserted, so it is only shown when it is on the host the user returns to.
     */
    private fun verifiedWebsite(client: OAuthClient, redirectUri: String): String? {
        fun host(uri: String?) = uri?.let { runCatching { java.net.URI(it).host?.lowercase() }.getOrNull() }
        return when (client.kind) {
            ClientKind.METADATA_DOCUMENT ->
                client.uri?.takeIf { host(it) == host(client.clientId) } ?: host(client.clientId)?.let { "https://$it" }
            ClientKind.DYNAMIC -> client.uri?.takeIf { host(it) != null && host(it) == host(redirectUri) }
        }
    }

    /** RFC 6749 4.1.2.1 error response, with the issuer (RFC 9207). */
    private fun errorRedirect(redirectUri: String, state: String?, error: String, description: String) =
        RedirectUris.withParams(
            redirectUri, listOf("error" to error, "error_description" to description, "state" to state, "iss" to config.issuer),
        )
}
