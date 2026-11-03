package ie.bookanything.oauth

import java.net.URLDecoder
import java.util.Base64

/** HTTP Basic client identification at the token and revocation endpoints (RFC 6749 2.3.1). */
object OAuthBasic {
    private const val SCHEME = "Basic "

    /**
     * The client_id in an `Authorization: Basic` header, or null when the header is absent or another scheme. The user
     * part is form-urlencoded (RFC 6749 2.3.1); the password is not read. Some clients send a URL client_id (a metadata
     * document's) without encoding it, so `https://…` is read up to the last colon (our clients have no password, or an
     * ignored one). A malformed header is `invalid_client`.
     */
    fun clientId(header: String?): String? {
        if (header == null || !header.regionMatches(0, SCHEME, 0, SCHEME.length, ignoreCase = true)) return null
        val decoded = runCatching { String(Base64.getDecoder().decode(header.substring(SCHEME.length).trim()), Charsets.UTF_8) }
            .getOrNull()
        val user = decoded?.takeIf { ':' in it }?.let {
            if (it.startsWith("https://", ignoreCase = true)) it.substringBeforeLast(':') else it.substringBefore(':')
        }
        val clientId = user?.let { runCatching { URLDecoder.decode(it, Charsets.UTF_8) }.getOrNull() }?.trim()
        if (clientId.isNullOrEmpty()) throw OAuthException.invalidClient("Malformed Basic credentials: send client_id:")
        return clientId
    }
}
