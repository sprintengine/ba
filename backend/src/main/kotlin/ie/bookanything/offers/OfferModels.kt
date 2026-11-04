package ie.bookanything.offers

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

/** How much an offer takes off the booking price. */
sealed interface Discount {
    /** The discount in cents for [priceCents], never more than the price. */
    fun amountOff(priceCents: Int): Int

    data class Percent(val percent: Int) : Discount {
        init { require(percent in 1..100) { "percent must be 1..100" } }

        // Half-up rounding to the cent, in the customer's favour at .5.
        override fun amountOff(priceCents: Int): Int =
            ((priceCents.toLong() * percent + PERCENT / 2) / PERCENT).toInt().coerceIn(0, priceCents)
    }

    data class Fixed(val amountCents: Int) : Discount {
        init { require(amountCents > 0) { "amount must be positive" } }
        override fun amountOff(priceCents: Int): Int = amountCents.coerceAtMost(priceCents).coerceAtLeast(0)
    }
}

/** A daily time range in the business timezone; a slot matches when its start is in `[start, end)`. */
data class TimeWindow(val start: LocalTime, val end: LocalTime) {
    init { require(end.isAfter(start)) { "window must end after it starts" } }
    fun contains(t: LocalTime) = !t.isBefore(start) && t.isBefore(end)
}

/**
 * When an offer applies. Every set condition must hold: the date range, the days of the week (empty = every day),
 * the time windows (empty = all day) and, when [lastMinuteHours] is set, the slot must start within that many hours.
 */
data class OfferSchedule(
    val daysOfWeek: Set<Int> = emptySet(),
    val windows: List<TimeWindow> = emptyList(),
    val lastMinuteHours: Int? = null,
    val validFrom: LocalDate? = null,
    val validUntil: LocalDate? = null,
)

enum class OfferKind { OFF_PEAK, LAST_MINUTE, ALWAYS;
    val value: String get() = name.lowercase()
}

enum class OfferStatus { ACTIVE, PAUSED;
    val value: String get() = name.lowercase()
    companion object { fun parse(raw: String) = valueOf(raw.uppercase()) }
}

/** An offer as the pricing rules see it. */
data class OfferRule(
    val id: UUID,
    val name: String,
    val serviceIds: Set<UUID>,
    val discount: Discount,
    val schedule: OfferSchedule,
    val maxRedemptions: Int?,
    val status: OfferStatus,
    val createdAt: Instant,
) {
    val kind: OfferKind get() = when {
        schedule.lastMinuteHours != null -> OfferKind.LAST_MINUTE
        schedule.daysOfWeek.isEmpty() && schedule.windows.isEmpty() -> OfferKind.ALWAYS
        else -> OfferKind.OFF_PEAK
    }
}

/** The offer applied to one booking price. */
data class AppliedOffer(val offer: OfferRule, val originalCents: Int, val discountCents: Int) {
    val finalCents: Int get() = originalCents - discountCents
}

private const val PERCENT = 100L
