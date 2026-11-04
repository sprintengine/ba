package ie.bookanything.geo

/** How precisely a point locates the business. */
enum class GeoPrecision { ADDRESS, POSTCODE, CITY;
    val value: String get() = name.lowercase()
}

data class GeocodeQuery(
    val line1: String?,
    val line2: String?,
    val city: String?,
    val postcode: String?,
    /** ISO 3166-1 alpha-2, e.g. "IE". */
    val country: String,
) {
    val isEmpty: Boolean get() = listOf(line1, line2, city, postcode).all { it.isNullOrBlank() }

    /** Normalised address; a stored location is only reused while this is unchanged. */
    val key: String get() = listOf(line1, line2, city, postcode, country)
        .joinToString("|") { it?.trim()?.lowercase()?.replace(Regex("\\s+"), " ").orEmpty() }

    val singleLine: String get() = listOf(line1, line2, city, postcode).mapNotNull {
        it?.trim()?.takeIf(String::isNotEmpty)
    }.joinToString(", ")
}

data class GeocodeResult(val point: GeoPoint, val precision: GeoPrecision, val source: String)

/**
 * Turns a business address into coordinates. Implementations: [MapboxGeocoder] (production, behind
 * `MAPBOX_ACCESS_TOKEN`) and [TableGeocoder] (deterministic, built-in Irish places; development, tests and the
 * fallback). Calls may block on the network: run them from the job worker, never inside a request transaction.
 */
fun interface Geocoder {
    /** Null when the address can't be located. Throws on transient failures (the job retries). */
    fun geocode(query: GeocodeQuery): GeocodeResult?
}

/** Tries [primary], then [fallback] when the primary finds nothing. */
class FallbackGeocoder(private val primary: Geocoder, private val fallback: Geocoder) : Geocoder {
    override fun geocode(query: GeocodeQuery): GeocodeResult? = primary.geocode(query) ?: fallback.geocode(query)
}
