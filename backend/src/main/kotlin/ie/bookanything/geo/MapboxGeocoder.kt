package ie.bookanything.geo

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Mapbox Geocoding API v6 forward geocoding (https://docs.mapbox.com/api/search/geocoding/).
 *
 * Uses `permanent=true`: Mapbox's terms only allow *storing* results from permanent geocoding, and we store the
 * point per business. Requests are one per address change (from the job worker), so usage stays tiny.
 * Non-2xx and network errors throw [IOException] so the job retries with backoff.
 */
class MapboxGeocoder(
    private val accessToken: String,
    private val baseUrl: String = "https://api.mapbox.com",
    private val client: OkHttpClient = OkHttpClient.Builder().callTimeout(8, TimeUnit.SECONDS).build(),
) : Geocoder {
    private val json = Json { ignoreUnknownKeys = true }

    override fun geocode(query: GeocodeQuery): GeocodeResult? {
        if (query.isEmpty) return null
        val url = "${baseUrl.trimEnd('/')}/search/geocode/v6/forward".toHttpUrl().newBuilder()
            .addQueryParameter("q", query.singleLine)
            .addQueryParameter("country", query.country.lowercase())
            .addQueryParameter("limit", "1")
            .addQueryParameter("permanent", "true")
            .addQueryParameter("access_token", accessToken)
            .build()
        client.newCall(Request.Builder().url(url).header("Accept", "application/json").build()).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Mapbox geocoding failed with HTTP ${response.code}")
            val body = response.body.string().ifEmpty { throw IOException("Mapbox geocoding returned no body") }
            return parse(body)
        }
    }

    /** Reads the first GeoJSON feature: `geometry.coordinates` is `[longitude, latitude]`. */
    fun parse(body: String): GeocodeResult? {
        val feature = json.parseToJsonElement(body).jsonObject["features"]?.jsonArray?.firstOrNull()?.jsonObject ?: return null
        val coords = feature["geometry"]?.jsonObject?.get("coordinates")?.jsonArray ?: return null
        val lng = coords.getOrNull(0)?.jsonPrimitive?.doubleOrNull ?: return null
        val lat = coords.getOrNull(1)?.jsonPrimitive?.doubleOrNull ?: return null
        val type = (feature["properties"] as? JsonObject)?.get("feature_type")?.jsonPrimitive?.contentOrNull
        val precision = when (type) {
            "address", "street", "secondary_address" -> GeoPrecision.ADDRESS
            "postcode" -> GeoPrecision.POSTCODE
            else -> GeoPrecision.CITY
        }
        return runCatching { GeocodeResult(GeoPoint(lat, lng), precision, SOURCE) }.getOrNull()
    }

    companion object {
        const val SOURCE = "mapbox"
    }
}
