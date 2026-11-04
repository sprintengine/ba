package ie.bookanything.offers

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/** Pure offer rules: does an offer cover a slot, and which offer is best for the customer. No I/O. */
object OfferMatcher {

    /** True when [offer] is active, covers [serviceId] and its schedule covers a slot starting at [start]. */
    fun matches(offer: OfferRule, serviceId: UUID, start: Instant, zone: ZoneId, now: Instant): Boolean =
        offer.status == OfferStatus.ACTIVE && serviceId in offer.serviceIds && scheduleCovers(offer.schedule, start, zone, now)

    /** Evaluated in the business timezone, so DST changes move nothing: "Tuesday 14:00" is always local 14:00. */
    fun scheduleCovers(s: OfferSchedule, start: Instant, zone: ZoneId, now: Instant): Boolean {
        val local = start.atZone(zone)
        val date = local.toLocalDate()
        if (s.validFrom != null && date.isBefore(s.validFrom)) return false
        if (s.validUntil != null && date.isAfter(s.validUntil)) return false
        if (s.daysOfWeek.isNotEmpty() && local.dayOfWeek.value !in s.daysOfWeek) return false
        if (s.windows.isNotEmpty() && s.windows.none { it.contains(local.toLocalTime()) }) return false
        if (s.lastMinuteHours != null) {
            if (!start.isAfter(now)) return false
            if (start.isAfter(now.plus(Duration.ofHours(s.lastMinuteHours.toLong())))) return false
        }
        return true
    }

    /** True while [offer] still has redemptions left. */
    fun hasCapacity(offer: OfferRule, redemptions: Int): Boolean = offer.maxRedemptions == null || redemptions < offer.maxRedemptions

    /**
     * The single offer to apply: the largest discount on [priceCents]; ties go to the older offer, then the lower id,
     * so the choice is deterministic. Offers that would take nothing off (e.g. on a free service) never apply.
     */
    fun best(
        offers: Collection<OfferRule>, serviceId: UUID, start: Instant, zone: ZoneId, now: Instant, priceCents: Int,
        redemptions: Map<UUID, Int> = emptyMap(),
    ): AppliedOffer? = offers
        .filter { matches(it, serviceId, start, zone, now) && hasCapacity(it, redemptions[it.id] ?: 0) }
        .map { AppliedOffer(it, priceCents, it.discount.amountOff(priceCents)) }
        .filter { it.discountCents > 0 }
        .sortedWith(compareByDescending<AppliedOffer> { it.discountCents }.thenBy { it.offer.createdAt }.thenBy { it.offer.id.toString() })
        .firstOrNull()
}
