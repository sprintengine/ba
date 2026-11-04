package ie.bookanything.oauth

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.header
import io.ktor.server.response.respondText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

/**
 * An OAuth protocol error (RFC 6749 5.2, RFC 7591 3.2.2, RFC 8707): answered as `{"error","error_description"}`,
 * never in our API error envelope, because OAuth clients parse this format.
 */
class OAuthException(val status: HttpStatusCode, val error: String, val description: String) : RuntimeException(description) {
    companion object {
        fun invalidRequest(d: String) = OAuthException(HttpStatusCode.BadRequest, "invalid_request", d)
        fun invalidClient(d: String) = OAuthException(HttpStatusCode.Unauthorized, "invalid_client", d)
        fun invalidGrant(d: String) = OAuthException(HttpStatusCode.BadRequest, "invalid_grant", d)
        fun unsupportedGrantType(d: String) = OAuthException(HttpStatusCode.BadRequest, "unsupported_grant_type", d)
        fun invalidScope(d: String) = OAuthException(HttpStatusCode.BadRequest, "invalid_scope", d)
        fun invalidTarget(d: String) = OAuthException(HttpStatusCode.BadRequest, "invalid_target", d)
        fun invalidRedirectUri(d: String) = OAuthException(HttpStatusCode.BadRequest, "invalid_redirect_uri", d)
        fun invalidClientMetadata(d: String) = OAuthException(HttpStatusCode.BadRequest, "invalid_client_metadata", d)
        fun rateLimited() = OAuthException(
            HttpStatusCode.TooManyRequests, "temporarily_unavailable", "Too many requests. Please wait a moment and try again.",
        )
    }
}

@Serializable
private data class OAuthErrorBody(val error: String, @SerialName("error_description") val errorDescription: String)

internal val OAuthJson = Json { encodeDefaults = true; explicitNulls = false }

/** OAuth responses carry tokens: never cache them (RFC 6749 5.1). */
suspend fun ApplicationCall.respondOAuthJson(status: HttpStatusCode, body: String) {
    response.header(HttpHeaders.CacheControl, "no-store")
    response.header(HttpHeaders.Pragma, "no-cache")
    respondText(body, ContentType.Application.Json, status)
}

suspend fun ApplicationCall.respondOAuthError(e: OAuthException) =
    respondOAuthJson(e.status, OAuthJson.encodeToString(serializer<OAuthErrorBody>(), OAuthErrorBody(e.error, e.description)))
