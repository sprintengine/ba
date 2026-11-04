package ie.bookanything.site.stock

import ie.bookanything.site.ColorContrast
import ie.bookanything.site.PlanImageRules
import ie.bookanything.site.SiteAttribution
import ie.bookanything.site.SiteText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.slf4j.LoggerFactory
import java.util.concurrent.TimeUnit

/** Unsplash search (hotlinked `images.unsplash.com` URLs, photographer attribution, download tracking). */
class UnsplashStockImages(
    private val accessKey: String,
    private val baseUrl: String = "https://api.unsplash.com",
    private val client: OkHttpClient = OkHttpClient.Builder().callTimeout(10, TimeUnit.SECONDS).build(),
) : StockImageProvider {
    private val log = LoggerFactory.getLogger(UnsplashStockImages::class.java)
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }
    override val enabled = true

    @Serializable private data class Urls(val regular: String = "", val small: String = "")
    @Serializable private data class UserLinks(val html: String = "")
    @Serializable private data class User(val name: String = "", val links: UserLinks = UserLinks())
    @Serializable private data class Links(@SerialName("download_location") val downloadLocation: String = "")
    @Serializable private data class Photo(
        val id: String = "", val width: Int = 0, val height: Int = 0, val color: String? = null,
        @SerialName("alt_description") val altDescription: String? = null, val description: String? = null,
        val urls: Urls = Urls(), val user: User = User(), val links: Links = Links(),
    )
    @Serializable private data class SearchResponse(val results: List<Photo> = emptyList())

    override fun search(query: String, page: Int): List<StockPhoto> {
        val url = "$baseUrl/search/photos".toHttpUrl().newBuilder()
            .addQueryParameter("query", query)
            .addQueryParameter("per_page", "24")
            .addQueryParameter("page", page.toString())
            .addQueryParameter("orientation", "landscape")
            .addQueryParameter("content_filter", "high")
            .build()
        val body = try {
            client.newCall(authorized(Request.Builder().url(url)).build()).execute().use { response ->
                if (!response.isSuccessful) throw StockUnavailableException("Unsplash search failed with ${response.code}")
                response.body.string()
            }
        } catch (e: java.io.IOException) {
            throw StockUnavailableException("Unsplash search failed: ${e.message ?: e.javaClass.simpleName}", e)
        }
        val parsed = try { json.decodeFromString(serializer<SearchResponse>(), body) } catch (e: IllegalArgumentException) {
            throw StockUnavailableException("Unsplash returned an unexpected response", e)
        }
        return parsed.results.mapNotNull { toStockPhoto(it, query) }
    }

    override fun trackDownload(downloadLocation: String) {
        if (!downloadLocation.startsWith(StockImageProvider.DOWNLOAD_PREFIX)) return
        try {
            client.newCall(authorized(Request.Builder().url(downloadLocation)).build()).execute().close()
        } catch (e: java.io.IOException) { // Best effort, as Unsplash asks.
            log.info("Unsplash download tracking failed: {}", e.message)
        }
    }

    private fun authorized(builder: Request.Builder) = builder
        .header("Authorization", "Client-ID $accessKey")
        .header("Accept-Version", "v1")

    /** Only photos whose URLs pass the plan's own image rules are offered. */
    private fun toStockPhoto(p: Photo, query: String): StockPhoto? {
        val profile = "${p.user.links.html}?utm_source=bookanything&utm_medium=referral"
        if (p.id.isEmpty() || !PlanImageRules.STOCK_URL.matches(p.urls.regular) ||
            !PlanImageRules.STOCK_URL.matches(p.urls.small)
        ) {
            return null
        }
        if (!PlanImageRules.ATTRIBUTION_URL.matches(profile) || p.user.name.isBlank()) return null
        val alt = listOfNotNull(p.altDescription, p.description, query).firstNotNullOfOrNull {
            SiteText.clean(it, multiline = false)?.takeIf(String::isNotEmpty)
        }.orEmpty()
        return StockPhoto(
            id = p.id, url = p.urls.regular, thumbUrl = p.urls.small, width = p.width, height = p.height,
            color = ColorContrast.normalize(p.color),
            alt = SiteText.truncate(alt, 140),
            attribution = SiteAttribution(SiteText.truncate(p.user.name.trim(), 100), profile),
            downloadLocation = p.links.downloadLocation,
        )
    }
}
