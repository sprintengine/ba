package ie.bookanything.oauth

import java.net.URI

/**
 * Redirect URI rules. Registration accepts https URLs, http on a loopback address (native apps, RFC 8252 7.3) and
 * private-use schemes of native apps. Authorization requests must match a registered URI exactly, except that a
 * loopback redirect may use any port (RFC 8252 7.3: native apps pick an ephemeral port per session).
 */
object RedirectUris {
    private val LOOPBACK_HOSTS = setOf("localhost", "127.0.0.1", "[::1]", "::1")
    private val SCHEME = Regex("^[a-z][a-z0-9+.-]*$")
    private val BLOCKED_SCHEMES = setOf(
        "javascript", "data", "file", "vbscript", "about", "blob", "ftp", "ws", "wss", "mailto", "tel", "sms", "intent", "chrome",
        "view-source",
    )
    const val MAX_LENGTH = 2000

    private fun parse(uri: String): URI? = runCatching { URI(uri) }.getOrNull()?.takeIf { it.isAbsolute }

    /** A problem with [uri] as a registered redirect, or null when it is acceptable. */
    fun problem(uri: String): String? {
        if (uri.length > MAX_LENGTH) return "is too long"
        val u = parse(uri) ?: return "must be an absolute URI"
        if (u.rawFragment != null) return "must not contain a fragment"
        if (u.rawUserInfo != null) return "must not contain credentials"
        val scheme = u.scheme.lowercase()
        return when {
            scheme == "https" -> if (u.host.isNullOrEmpty()) "must have a host" else null
            scheme == "http" -> if (isLoopback(uri)) null else "http is only allowed for localhost (use https)"
            !SCHEME.matches(scheme) || scheme in BLOCKED_SCHEMES -> "uses a scheme that is not allowed"
            else -> null
        }
    }

    fun isLoopback(uri: String): Boolean {
        val u = parse(uri) ?: return false
        return u.scheme.equals("http", ignoreCase = true) && u.host?.lowercase() in LOOPBACK_HOSTS
    }

    /** True when [requested] is one of [registered] (exact), or the same loopback redirect on another port. */
    fun matches(registered: Collection<String>, requested: String): Boolean {
        if (requested in registered) return true
        if (!isLoopback(requested)) return false
        val r = parse(requested) ?: return false
        return registered.any { reg ->
            val g = parse(reg)
            g != null && isLoopback(reg) && g.host.equals(r.host, ignoreCase = true) && g.rawPath.orEmpty() == r.rawPath.orEmpty() &&
                g.rawQuery == r.rawQuery
        }
    }

    /** What the consent screen shows as the destination: the https host, "this device" or the app scheme. */
    fun displayHost(uri: String): String {
        val u = parse(uri) ?: return uri
        return when {
            isLoopback(uri) -> "${u.host} (an app on this device)"
            u.scheme.equals("https", ignoreCase = true) -> u.host
            else -> "${u.scheme}: (an app on this device)"
        }
    }

    /** Appends query parameters to a redirect URI, keeping its own query. */
    fun withParams(uri: String, params: List<Pair<String, String?>>): String {
        val encoded = params.filter { it.second != null }.joinToString("&") { (k, v) ->
            "${java.net.URLEncoder.encode(k, Charsets.UTF_8)}=${java.net.URLEncoder.encode(v, Charsets.UTF_8)}"
        }
        if (encoded.isEmpty()) return uri
        return uri + (if (uri.contains('?')) "&" else "?") + encoded
    }
}
