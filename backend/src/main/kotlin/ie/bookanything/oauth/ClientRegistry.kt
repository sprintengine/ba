package ie.bookanything.oauth

import ie.bookanything.db.Db
import ie.bookanything.db.Jsonb
import ie.bookanything.db.TextArray
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.stringList
import ie.bookanything.db.update
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import java.net.URI
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

enum class ClientKind(val value: String) { DYNAMIC("dynamic"), METADATA_DOCUMENT("metadata_document") }

/** A registered OAuth client. All clients are public (no secret) and must use PKCE. */
data class OAuthClient(val clientId: String, val kind: ClientKind, val name: String, val uri: String?, val redirectUris: List<String>)

@Serializable
data class RegistrationResponse(
    @SerialName("client_id") val clientId: String,
    @SerialName("client_id_issued_at") val clientIdIssuedAt: Long,
    @SerialName("client_name") val clientName: String,
    @SerialName("client_uri") val clientUri: String? = null,
    @SerialName("redirect_uris") val redirectUris: List<String>,
    @SerialName("grant_types") val grantTypes: List<String> = listOf("authorization_code", "refresh_token"),
    @SerialName("response_types") val responseTypes: List<String> = listOf("code"),
    @SerialName("token_endpoint_auth_method") val tokenEndpointAuthMethod: String = "none",
)

/**
 * OAuth clients: Dynamic Client Registration (RFC 7591, kept for clients that don't support metadata documents)
 * and Client ID Metadata Documents (the client_id is an https URL serving the client's metadata; preferred by the
 * current MCP authorization spec). Metadata documents are cached in `oauth_clients` per their HTTP cache lifetime.
 */
class ClientRegistry(private val db: Db, private val fetcher: ClientMetadataFetcher) {
    private val fetches = Semaphore(MAX_CONCURRENT_FETCHES)

    /** client_id -> until when its document is not fetched again (the last fetch failed). Bounded by [rememberFailure]. */
    private val failures = ConcurrentHashMap<String, Instant>()

    companion object {
        const val MAX_REDIRECT_URIS = 10
        private val SUPPORTED_GRANTS = setOf("authorization_code", "refresh_token")
        private const val DEFAULT_CACHE_SECONDS = 3_600L
        private const val MIN_CACHE_SECONDS = 300L
        private const val MAX_CACHE_SECONDS = 86_400L
        private const val MAX_CLIENT_ID_LENGTH = 512

        /** Metadata documents fetched at once; another request waits up to [FETCH_WAIT_MILLIS] for a turn, then fails. */
        const val MAX_CONCURRENT_FETCHES = 4
        const val FETCH_WAIT_MILLIS = 2_000L

        /** How long a document that failed is not fetched again, and how many such client_ids are remembered. */
        val FAILURE_TTL: Duration = Duration.ofMinutes(5)
        private const val MAX_REMEMBERED_FAILURES = 1_000

        /** Client ID Metadata Document URLs: https with a path, no fragment, credentials or dot segments. */
        fun isMetadataDocumentId(clientId: String): Boolean {
            if (!clientId.startsWith("https://") || clientId.length > MAX_CLIENT_ID_LENGTH) return false
            val u = runCatching { URI(clientId) }.getOrNull() ?: return false
            val path = u.rawPath.orEmpty()
            return u.host != null && u.rawFragment == null && u.rawUserInfo == null && path.length > 1 &&
                path.split('/').none { it == "." || it == ".." }
        }

        private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.trim()
        private fun JsonObject.strings(key: String): List<String>? =
            (this[key] as? JsonArray)?.map { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content ?: return null }
    }

    /** RFC 7591 registration. Every client is public: `token_endpoint_auth_method` is always `none`. */
    fun register(body: JsonObject, now: Instant): RegistrationResponse {
        val redirects = body.strings("redirect_uris") ?: throw OAuthException.invalidRedirectUri("redirect_uris must be an array of URIs")
        if (redirects.isEmpty() || redirects.size > MAX_REDIRECT_URIS) {
            throw OAuthException.invalidRedirectUri(
                "Register 1 to $MAX_REDIRECT_URIS redirect URIs",
            )
        }
        redirects.forEach { uri -> RedirectUris.problem(uri)?.let { throw OAuthException.invalidRedirectUri("$uri $it") } }
        body.strings("grant_types")?.let { grants ->
            if (!SUPPORTED_GRANTS.containsAll(grants)) {
                throw OAuthException.invalidClientMetadata(
                    "Supported grant_types: authorization_code, refresh_token",
                )
            }
        }
        body.strings("response_types")?.let {
            if (it.any { t -> t != "code" }) throw OAuthException.invalidClientMetadata("Only the code response type is supported")
        }
        val name = body.string("client_name")?.take(100)?.takeIf { it.isNotEmpty() } ?: RedirectUris.displayHost(redirects.first())
        val uri = body.string("client_uri")?.takeIf { it.startsWith("https://") && it.length <= 500 }
        val clientId = "dyn_" + ie.bookanything.auth.TokenService.randomToken(18)
        db.txBlocking { conn ->
            conn.update(
                "INSERT INTO oauth_clients (client_id, kind, client_name, client_uri, redirect_uris, metadata, created_at) VALUES (?, " +
                    "'dynamic', ?, ?, ?, ?, ?)",
                clientId, name, uri, TextArray(redirects), Jsonb(body), now,
            )
        }
        return RegistrationResponse(clientId, now.epochSecond, name, uri, redirects)
    }

    /** The client for [clientId] as stored (registered, or a metadata document fetched before). Never fetches. */
    fun findStored(clientId: String): OAuthClient? = stored(clientId)?.first

    /** The client for [clientId]: a registered one, or a metadata document (cached, else fetched and validated). */
    fun resolve(clientId: String, now: Instant): OAuthClient? {
        val stored = stored(clientId)
        if (stored != null && (stored.first.kind == ClientKind.DYNAMIC || stored.second?.isAfter(now) == true)) return stored.first
        if (!isMetadataDocumentId(clientId)) return null
        // Fetch (or refresh) the metadata document; if a refresh fails, keep using the cached copy.
        return fetchDocument(clientId, now) ?: stored?.first
    }

    /** The stored client and when its metadata document is due to be fetched again (null for registered clients). */
    private fun stored(clientId: String): Pair<OAuthClient, Instant?>? {
        if (clientId.isBlank() || clientId.length > MAX_CLIENT_ID_LENGTH) return null
        return db.txBlocking(readOnly = true) { conn ->
            conn.queryOne(
                "SELECT client_id, kind, client_name, client_uri, redirect_uris, refresh_after FROM oauth_clients WHERE client_id = ?",
                clientId,
            ) {
                OAuthClient(
                    it.str("client_id"), if (it.str("kind") == "dynamic") ClientKind.DYNAMIC else ClientKind.METADATA_DOCUMENT,
                    it.str("client_name"), it.strOrNull("client_uri"), it.stringList("redirect_uris"),
                ) to it.instantOrNull("refresh_after")
            }
        }
    }

    /**
     * Fetches [clientId]'s document, at most [MAX_CONCURRENT_FETCHES] at a time. A document that could not be fetched or
     * was invalid is not fetched again for [FAILURE_TTL], so repeating a bad client_id costs no further requests.
     */
    private fun fetchDocument(clientId: String, now: Instant): OAuthClient? {
        failures[clientId]?.let { until -> if (until.isAfter(now)) return null else failures.remove(clientId, until) }
        // Busy with other fetches: refuse this one, without counting it as a failure of the document.
        if (!fetches.tryAcquire(FETCH_WAIT_MILLIS, TimeUnit.MILLISECONDS)) return null
        val client = try { fetchAndStore(clientId, now) } finally { fetches.release() }
        if (client == null) rememberFailure(clientId, now)
        return client
    }

    private fun rememberFailure(clientId: String, now: Instant) {
        if (failures.size >= MAX_REMEMBERED_FAILURES) {
            failures.entries.removeIf { !it.value.isAfter(now) }
            if (failures.size >= MAX_REMEMBERED_FAILURES) failures.clear()
        }
        failures[clientId] = now.plus(FAILURE_TTL)
    }

    private fun fetchAndStore(clientId: String, now: Instant): OAuthClient? {
        val doc = fetcher.fetch(clientId) ?: return null
        val json = runCatching { ie.bookanything.http.ApiJson.parseToJsonElement(doc.body).jsonObject }.getOrNull() ?: return null
        // The document must name itself exactly (draft-ietf-oauth-client-id-metadata-document 4.1).
        if (json.string("client_id") != clientId) return null
        val redirects = json.strings("redirect_uris")?.takeIf { it.isNotEmpty() && it.size <= MAX_REDIRECT_URIS } ?: return null
        if (redirects.any { RedirectUris.problem(it) != null }) return null
        // We only support public clients (PKCE, no client authentication).
        json.string("token_endpoint_auth_method")?.let { if (it != "none") return null }
        val name = json.string("client_name")?.take(100)?.takeIf { it.isNotEmpty() } ?: return null
        val uri = json.string("client_uri")?.takeIf { it.startsWith("https://") && it.length <= 500 }
        val ttl = (doc.maxAgeSeconds ?: DEFAULT_CACHE_SECONDS).coerceIn(MIN_CACHE_SECONDS, MAX_CACHE_SECONDS)
        db.txBlocking { conn ->
            conn.update(
                """
                INSERT INTO oauth_clients (client_id, kind, client_name, client_uri, redirect_uris, metadata, created_at, refresh_after)
                VALUES (?, 'metadata_document', ?, ?, ?, ?, ?, ?)
                ON CONFLICT (client_id) DO UPDATE SET client_name = EXCLUDED.client_name, client_uri = EXCLUDED.client_uri,
                    redirect_uris = EXCLUDED.redirect_uris, metadata = EXCLUDED.metadata, refresh_after = EXCLUDED.refresh_after
                WHERE oauth_clients.kind = 'metadata_document'
                """.trimIndent(),
                clientId, name, uri, TextArray(redirects), Jsonb(json), now, now.plusSeconds(ttl),
            )
        }
        return OAuthClient(clientId, ClientKind.METADATA_DOCUMENT, name, uri, redirects)
    }
}
