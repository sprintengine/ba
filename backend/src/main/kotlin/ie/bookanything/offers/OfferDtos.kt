package ie.bookanything.offers

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** `{"type":"percent","percent":20}` or `{"type":"fixed","amountCents":500}`. */
@Serializable
sealed interface DiscountDto {
    @Serializable @SerialName("percent")
    data class Percent(val percent: Int) : DiscountDto

    @Serializable @SerialName("fixed")
    data class Fixed(val amountCents: Int) : DiscountDto
}

@Serializable
data class TimeWindowDto(val start: String, val end: String)

@Serializable
data class OfferScheduleDto(
    val daysOfWeek: List<Int> = emptyList(),
    val timeWindows: List<TimeWindowDto> = emptyList(),
    val lastMinuteHours: Int? = null,
)

@Serializable
data class OfferInput(
    val name: String,
    val description: String? = null,
    val serviceIds: List<String>,
    val discount: DiscountDto,
    val schedule: OfferScheduleDto = OfferScheduleDto(),
    val validFrom: String? = null,
    val validUntil: String? = null,
    val maxRedemptions: Int? = null,
    val active: Boolean = true,
)

@Serializable
data class OfferDto(
    val id: String,
    val name: String,
    val description: String?,
    val serviceIds: List<String>,
    val discount: DiscountDto,
    val schedule: OfferScheduleDto,
    val validFrom: String?,
    val validUntil: String?,
    val maxRedemptions: Int?,
    val status: String,
    val kind: String,
    /** "20% off", "€5 off". */
    val label: String,
    /** "Tue and Wed, 14:00–17:00" / "Starting within 3 hours". */
    val summary: String,
    val redemptions: Int,
    val createdAt: String,
    val updatedAt: String,
)

/** Public view of an active offer (business site, booking flow, marketplace, MCP). */
@Serializable
data class PublicOfferDto(
    val id: String,
    val name: String,
    val description: String?,
    val kind: String,
    val discount: DiscountDto,
    val label: String,
    val summary: String,
    val serviceIds: List<String>,
    val validUntil: String?,
)

/** Marks a discounted slot in availability responses. */
@Serializable
data class SlotOfferDto(val id: String, val name: String, val label: String, val originalPriceCents: Int, val priceCents: Int)

/** The applied offer recorded on a booking's price snapshot. */
@Serializable
data class BookingOfferDto(
    val id: String,
    val name: String,
    val label: String,
    val originalPriceCents: Int,
    val discountCents: Int,
)

@Serializable
data class OfferPreviewInput(val offer: OfferInput, val from: String? = null, val days: Int = 7)

@Serializable
data class PreviewSlotDto(
    val start: String,
    val serviceId: String,
    val serviceName: String,
    val originalPriceCents: Int,
    val priceCents: Int,
)

@Serializable
data class PreviewDayDto(val date: String, val slots: List<PreviewSlotDto>)

@Serializable
data class OfferPreviewDto(
    val timezone: String,
    val currency: String,
    val from: String,
    val to: String,
    /** Bookable slots of the chosen services in the range. */
    val totalSlots: Int,
    /** Slots the offer would discount (all of them, even when [days] is truncated). */
    val affectedSlots: Int,
    /** Affected slots per day (at most 200 listed). */
    val days: List<PreviewDayDto>,
)

/** Domain ↔ DTO mapping. */
object OfferMapping {
    fun discount(d: Discount): DiscountDto = when (d) {
        is Discount.Percent -> DiscountDto.Percent(d.percent)
        is Discount.Fixed -> DiscountDto.Fixed(d.amountCents)
    }

    fun schedule(s: OfferSchedule) = OfferScheduleDto(
        s.daysOfWeek.sorted(), s.windows.map { TimeWindowDto(it.start.toString(), it.end.toString()) }, s.lastMinuteHours,
    )
}
