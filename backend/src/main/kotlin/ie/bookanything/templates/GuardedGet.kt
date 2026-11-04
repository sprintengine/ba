package ie.bookanything.templates

import okhttp3.Request
import okhttp3.Response
import org.slf4j.Logger
import java.io.IOException

/**
 * A GET of a user-supplied URL through a [UrlGuard.safeClient]. A URL [UrlGuard] refuses is never requested, and a
 * refused, failed or unsuccessful fetch is logged as "[what] fetch ..." and null. [read] sees successful responses only.
 */
class GuardedGet(private val what: String, private val log: Logger, timeoutMillis: Long, followRedirects: Boolean) {
    private val client = UrlGuard.safeClient(timeoutMillis, followRedirects)

    fun <T> fetch(url: String, headers: List<Pair<String, String>>, read: (Response) -> T?): T? {
        UrlGuard.problem(url)?.let { log.info("$what fetch refused ({}): {}", it, url); return null }
        return try {
            val request = Request.Builder().url(url.trim()).apply { headers.forEach { (k, v) -> header(k, v) } }.build()
            client.newCall(request).execute().use { response -> if (response.isSuccessful) read(response) else null }
        } catch (e: IOException) { // Includes BlockedUrlException from the SSRF guard.
            log.info("$what fetch failed for {}: {}", url, e.message)
            null
        } catch (e: IllegalArgumentException) { // Malformed URL.
            log.info("$what fetch failed for {}: {}", url, e.message)
            null
        }
    }
}
