package ie.bookanything.templates

import java.io.IOException

/** Fetches a public web page as plain text for the AI draft prompt. Returns null when it can't. */
fun interface WebsiteFetcher {
    fun fetchText(url: String): String?
}

class BlockedUrlException(message: String) : IOException(message)
