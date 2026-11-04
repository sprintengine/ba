package ie.bookanything.offers

import ie.bookanything.business.BusinessRow
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** The active offers of one business with their redemption counts: prices any number of slots with pure rules. */
class OfferBook(
    val offers: List<OfferRule>,
    private val redemptions: Map<UUID, Int>,
    private val business: BusinessRow,
    private val now: Instant,
) {
    fun best(serviceId: UUID, start: Instant, priceCents: Int): AppliedOffer? =
        OfferMatcher.best(offers, serviceId, start, business.zone, now, priceCents, redemptions)

    fun slotOffer(serviceId: UUID, start: Instant, priceCents: Int): SlotOfferDto? = best(serviceId, start, priceCents)?.let {
        SlotOfferDto(
            it.offer.id.toString(), it.offer.name, OfferText.label(it.offer.discount, business.currency), it.originalCents, it.finalCents,
        )
    }

    /** Offers a customer can still get: active, not past their end date and not sold out. */
    fun current(): List<OfferRule> {
        val today = LocalDate.ofInstant(now, business.zone)
        return offers.filter { o ->
            (o.schedule.validUntil == null || !o.schedule.validUntil.isBefore(today)) && OfferMatcher.hasCapacity(o, redemptions[o.id] ?: 0)
        }
    }

    val isEmpty: Boolean get() = offers.isEmpty()
}
