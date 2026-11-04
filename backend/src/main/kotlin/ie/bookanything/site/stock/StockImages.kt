package ie.bookanything.site.stock

import ie.bookanything.site.SiteAttribution
import kotlinx.serialization.Serializable

@Serializable
data class StockPhoto(
    val id: String,
    val url: String,
    val thumbUrl: String,
    val width: Int,
    val height: Int,
    val color: String?,
    val alt: String,
    val attribution: SiteAttribution,
    val downloadLocation: String,
)

/** The stock photo provider failed; [message] is safe to log. */
class StockUnavailableException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

/** Stock photos for the site editor (section 15.7). */
interface StockImageProvider {
    val enabled: Boolean

    /** One page of landscape photos for [query]. Throws [StockUnavailableException] when the provider fails. */
    fun search(query: String, page: Int): List<StockPhoto>

    /** Reports that a photo was chosen (required by Unsplash). Best effort: never throws. */
    fun trackDownload(downloadLocation: String)

    companion object {
        /** Only Unsplash's own API may be called for download tracking. */
        const val DOWNLOAD_PREFIX = "https://api.unsplash.com/photos/"
    }
}

/** Without an Unsplash key the editor offers generated backgrounds instead. */
object DisabledStockImages : StockImageProvider {
    override val enabled = false
    override fun search(query: String, page: Int): List<StockPhoto> = emptyList()
    override fun trackDownload(downloadLocation: String) = Unit
}
