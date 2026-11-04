package ie.bookanything.oauth

import ie.bookanything.templates.GuardedGet
import ie.bookanything.templates.UrlGuard
import okhttp3.CacheControl
import okhttp3.Response
import org.slf4j.LoggerFactory

/** A fetched Client ID Metadata Document with its HTTP cache lifetime. */
data class FetchedDocument(val body: String, val maxAgeSeconds: Long?)

/** Fetches Client ID Metadata Documents (the client_id is an https URL). Tests inject a fake: no network. */
fun interface ClientMetadataFetcher {
    /** The document, or null when it can't be fetched (not found, too big, not JSON, blocked address). */
    fun fetch(url: String): FetchedDocument?
}

/**
 * SSRF-safe fetch (draft-ietf-oauth-client-id-metadata-document section 6): https only, public addresses only
 * (checked on every connection, see [UrlGuard]), no redirects, 2 s timeout, 5 KB cap, JSON only.
 */
class HttpClientMetadataFetcher : ClientMetadataFetcher {
    private val get = GuardedGet(
        "client metadata", LoggerFactory.getLogger(HttpClientMetadataFetcher::class.java), timeoutMillis = 2_000, followRedirects = false,
    )

    override fun fetch(url: String): FetchedDocument? = if (url.startsWith("https://")) get.fetch(url, HEADERS, ::document) else null

    /** A JSON body of at most [MAX_BYTES], with its cache lifetime; null otherwise. */
    internal fun document(response: Response): FetchedDocument? {
        val type = response.header("Content-Type")?.lowercase().orEmpty()
        val source = response.body?.source()
        if (!(type.startsWith("application/json") || type.contains("+json")) || source == null) return null
        source.request(MAX_BYTES + 1)
        if (source.buffer.size > MAX_BYTES) return null
        val maxAge = CacheControl.parse(response.headers).maxAgeSeconds.takeIf { it >= 0 }?.toLong()
        return FetchedDocument(source.buffer.readUtf8(), maxAge)
    }

    companion object {
        const val MAX_BYTES = 5_120L
        private val HEADERS = listOf("Accept" to "application/json", "User-Agent" to "bookanything-oauth/1.0 (+https://bookanything.ie)")
    }
}
