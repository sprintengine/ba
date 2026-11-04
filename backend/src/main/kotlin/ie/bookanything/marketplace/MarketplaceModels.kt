package ie.bookanything.marketplace

import ie.bookanything.business.Address
import ie.bookanything.business.Branding
import ie.bookanything.geo.GeoPoint
import ie.bookanything.offers.PublicOfferDto
import ie.bookanything.offers.SlotOfferDto
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.util.UUID

// ---------- Search input ----------

/** "Available today / this week / on a date", evaluated in each business's timezone. */
sealed interface AvailabilityFilter {
    fun window(today: LocalDate): ClosedRange<LocalDate>

    data object Today : AvailabilityFilter { override fun window(today: LocalDate) = today..today }
    data object ThisWeek : AvailabilityFilter { override fun window(today: LocalDate) = today..today.plusDays(6) }
    data class On(val date: LocalDate) : AvailabilityFilter { override fun window(today: LocalDate) = date..date }
}

data class NearFilter(val center: GeoPoint, val radiusKm: Double, val label: String?)

data class SearchFilter(
    val text: String? = null,
    val category: MarketplaceCategory? = null,
    val near: NearFilter? = null,
    val availability: AvailabilityFilter? = null,
    val minPriceCents: Int? = null,
    val maxPriceCents: Int? = null,
    val dealsOnly: Boolean = false,
    val limit: Int = 12,
    val cursor: SearchCursor? = null,
)

/** Keyset position: by distance when searching near a point, else by name. */
sealed interface SearchCursor {
    val id: UUID
    data class ByDistance(val distanceKm: Double, override val id: UUID) : SearchCursor
    data class ByName(val sortName: String, override val id: UUID) : SearchCursor
}

// ---------- Responses ----------

@Serializable
data class LatLng(val latitude: Double, val longitude: Double)

@Serializable
data class ListingBusinessDto(
    val id: String,
    val slug: String,
    val name: String,
    val description: String?,
    val timezone: String,
    val address: Address,
    val branding: Branding,
    val location: LatLng?,
)

@Serializable
data class NextSlotDto(
    val start: String,
    val serviceId: String,
    val serviceName: String,
    /** Services with options are shown with their cheapest option. */
    val optionId: String?,
    val optionName: String?,
    val priceCents: Int,
    val offer: SlotOfferDto?,
)

/** Ratings are only shown once real reviews exist; until then this is always null. */
@Serializable
data class RatingDto(val average: Double, val count: Int)

@Serializable
data class ListingDto(
    val business: ListingBusinessDto,
    val category: CategoryDto,
    val distanceKm: Double?,
    val rating: RatingDto?,
    val priceFromCents: Int?,
    val currency: String,
    /** Up to three earliest bookable times (next 7 days, or the availability filter's window). */
    val nextSlots: List<NextSlotDto>,
    val deals: List<PublicOfferDto>,
)

@Serializable
data class SearchCenterDto(val latitude: Double, val longitude: Double, val radiusKm: Double, val label: String?)

@Serializable
data class SearchResultDto(val items: List<ListingDto>, val nextCursor: String?, val center: SearchCenterDto?)

@Serializable
data class CityDto(
    val slug: String, val name: String, val county: String, val latitude: Double, val longitude: Double, val listingCount: Int,
)

@Serializable
data class MarketplaceMetaDto(val categories: List<CategoryDto>, val cities: List<CityDto>)

// ---------- Owner settings ----------

@Serializable
data class LocationDto(val latitude: Double, val longitude: Double, val precision: String, val source: String, val geocodedAt: String)

@Serializable
data class MarketplaceSettingsDto(
    val listed: Boolean,
    val category: String,
    /** Listing is a Pro and Business feature. */
    val eligible: Boolean,
    val location: LocationDto?,
    /** located | pending | not_found | missing_address */
    val locationStatus: String,
    val categories: List<CategoryDto>,
)

@Serializable
data class MarketplaceSettingsInput(val listed: Boolean, val category: String? = null)
