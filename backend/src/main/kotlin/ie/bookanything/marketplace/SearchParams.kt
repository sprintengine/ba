package ie.bookanything.marketplace

import ie.bookanything.geo.GeoPoint
import ie.bookanything.geo.IrishPlaces
import ie.bookanything.http.Validator

/** Raw search parameters as the REST query string and the MCP tools give them. */
data class SearchParams(
    val q: String? = null,
    val category: String? = null,
    val city: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    val radiusKm: Double? = null,
    /** "today" | "week" */
    val available: String? = null,
    /** YYYY-MM-DD: has availability on that date. */
    val date: String? = null,
    val minPriceCents: Int? = null,
    val maxPriceCents: Int? = null,
    val deals: Boolean = false,
    val limit: Int? = null,
    val cursor: String? = null,
)

/** Validates [SearchParams] into a [SearchFilter] (400 INVALID_REQUEST with field errors). */
object SearchFilters {
    const val MAX_LIMIT = 30
    const val DEFAULT_LIMIT = 12

    fun parse(p: SearchParams): SearchFilter {
        val v = Validator()
        val text = v.requireText(p.q, "q", MAX_TEXT_LENGTH, required = false)?.takeIf { it.length >= MIN_TEXT_LENGTH }
        val category = p.category?.trim()?.takeIf { it.isNotEmpty() }?.let { key ->
            MarketplaceCategories.byKey(key) ?: null.also { v.error("category", "Unknown category") }
        }
        val near = near(p, v)
        val availability = availability(p, v)
        v.range(p.minPriceCents, "minPrice", 0, MAX_PRICE_CENTS)
        v.range(p.maxPriceCents, "maxPrice", 0, MAX_PRICE_CENTS)
        if (p.minPriceCents != null && p.maxPriceCents != null && p.maxPriceCents < p.minPriceCents) {
            v.error("maxPrice", "Must be at least the minimum price")
        }
        val limit = p.limit ?: DEFAULT_LIMIT
        v.range(limit, "limit", 1, MAX_LIMIT)
        v.throwIfInvalid()
        return SearchFilter(
            text = text, category = category, near = near, availability = availability,
            minPriceCents = p.minPriceCents, maxPriceCents = p.maxPriceCents, dealsOnly = p.deals, limit = limit,
            cursor = SearchCursors.decode(p.cursor, byDistance = near != null),
        )
    }

    /** Where to search: around a point (lat/lng) or a known Irish city, within the radius; null for anywhere. */
    private fun near(p: SearchParams, v: Validator): NearFilter? {
        val radius = p.radiusKm ?: MarketplaceSearch.DEFAULT_RADIUS_KM
        if (radius.isNaN() || radius < 1.0 || radius > MarketplaceSearch.MAX_RADIUS_KM) {
            v.error("radiusKm", "Must be between 1 and ${MarketplaceSearch.MAX_RADIUS_KM.toInt()}")
        }
        return when {
            p.lat != null || p.lng != null -> nearPoint(p.lat, p.lng, radius, v)
            !p.city.isNullOrBlank() -> nearCity(p.city, p.radiusKm, v)
            else -> null
        }
    }

    /** Around a point; both coordinates are required. Null (with field errors) when anything so far is invalid. */
    private fun nearPoint(lat: Double?, lng: Double?, radiusKm: Double, v: Validator): NearFilter? {
        if (lat == null || lat !in -90.0..90.0) v.error("lat", "Must be a latitude between -90 and 90")
        if (lng == null || lng !in -180.0..180.0) v.error("lng", "Must be a longitude between -180 and 180")
        return if (v.isValid) NearFilter(GeoPoint(lat!!, lng!!), radiusKm, null) else null
    }

    /** Around a known city (by key or name), within its default radius unless one is given. */
    private fun nearCity(city: String, radiusKm: Double?, v: Validator): NearFilter? {
        val place = IrishPlaces.city(city) ?: IrishPlaces.cityByName(city)
        return place?.let { NearFilter(it.point, radiusKm ?: MarketplaceSearch.CITY_RADIUS_KM, it.name) }
            ?: null.also { v.error("city", "Unknown city") }
    }

    /** "Has free time": on a date, today or this week; null for any. */
    private fun availability(p: SearchParams, v: Validator): AvailabilityFilter? = when {
        p.date != null -> v.date(p.date, "date")?.let { AvailabilityFilter.On(it) }
        p.available == null || p.available == "any" -> null
        p.available == "today" -> AvailabilityFilter.Today
        p.available == "week" -> AvailabilityFilter.ThisWeek
        else -> null.also { v.error("available", "Must be today or week") }
    }
}

private const val MIN_TEXT_LENGTH = 2
private const val MAX_TEXT_LENGTH = 100
private const val MAX_PRICE_CENTS = 10_000_000
