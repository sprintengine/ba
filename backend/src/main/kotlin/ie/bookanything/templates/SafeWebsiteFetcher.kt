package ie.bookanything.templates

import okhttp3.Response
import org.slf4j.LoggerFactory

/** OkHttp-based fetcher with [UrlGuard], an 8 s total timeout and a 500 KB body cap. */
class SafeWebsiteFetcher(
    timeoutMillis: Long = 8_000,
    private val maxBytes: Long = 500_000,
) : WebsiteFetcher {
    private val get = GuardedGet("website", LoggerFactory.getLogger(SafeWebsiteFetcher::class.java), timeoutMillis, followRedirects = true)

    override fun fetchText(url: String): String? = get.fetch(url, HEADERS, ::text)

    /** HTML as readable text, or plain text as is; null for any other content type. */
    internal fun text(response: Response): String? {
        val type = response.header("Content-Type")?.lowercase() ?: "text/html"
        if (TEXT_TYPES.none { type.startsWith(it) }) return null
        val source = response.body.source()
        source.request(maxBytes) // Reads at most maxBytes (+ buffer) and never more.
        val bytes = source.buffer.let { buf -> buf.readByteArray(minOf(buf.size, maxBytes)) }
        val text = String(bytes, response.body.contentType()?.charset() ?: Charsets.UTF_8)
        return if (type.startsWith("text/plain")) text.take(20_000) else HtmlText.extract(text)
    }

    private companion object {
        val HEADERS = listOf(
            "User-Agent" to "bookanything-setup-assistant/1.0 (+https://bookanything.ie)",
            "Accept" to "text/html,text/plain;q=0.9",
        )
        val TEXT_TYPES = listOf("text/html", "text/plain", "application/xhtml")
    }
}
