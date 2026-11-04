package ie.bookanything.offers

import ie.bookanything.availability.ComputedSlot
import ie.bookanything.business.BusinessRow
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/** Loads offers for pricing and applies them to new bookings. */
object OfferPricing {
    fun book(conn: Connection, business: BusinessRow, now: Instant, serviceId: UUID? = null): OfferBook {
        val offers = OfferRepository.active(conn, business.id, serviceId)
        return OfferBook(offers, OfferRepository.redemptions(conn, business.id, offers.map { it.id }), business, now)
    }

    /**
     * [book] for each of [businesses] at once, with each one's active offers as stored (in [OfferRepository.list] order),
     * in two queries for all of them.
     */
    fun books(conn: Connection, businesses: Collection<BusinessRow>, now: Instant): Map<UUID, Pair<OfferBook, List<StoredOffer>>> {
        val ids = businesses.map { it.id }.toSet()
        val stored = OfferRepository.activeByBusiness(conn, ids)
        val redemptions = OfferRepository.redemptions(conn, ids, stored.values.flatten().map { it.rule.id })
        return businesses.associate { b ->
            val offers = stored[b.id].orEmpty()
            b.id to (OfferBook(offers.map { it.rule }, redemptions, b, now) to offers)
        }
    }

    /**
     * Flags the slots an offer discounts for availability views (public, staff and the assistant), priced like a new
     * booking of [serviceId] costing [priceCents].
     */
    fun slotOffers(
        conn: Connection, business: BusinessRow, serviceId: UUID, priceCents: Int, now: Instant,
    ): (ComputedSlot) -> SlotOfferDto? {
        val offers = book(conn, business, now, serviceId)
        return if (offers.isEmpty) { _ -> null } else { slot -> offers.slotOffer(serviceId, slot.start, priceCents) }
    }

    /**
     * The offer a new booking would get now, for previews (e.g. the assistant's proposal card). It reserves nothing:
     * the booking itself is priced by [quoteForBooking].
     */
    fun preview(conn: Connection, business: BusinessRow, serviceId: UUID, priceCents: Int, start: Instant, now: Instant): AppliedOffer? =
        book(conn, business, now, serviceId).best(serviceId, start, priceCents)

    /**
     * The offer for a new booking of [serviceId] at [start] costing [priceCents], inside the booking transaction.
     * A capped offer is locked and re-counted, so its last redemption can't be taken twice; if it is gone the next
     * best offer applies.
     */
    fun quoteForBooking(
        conn: Connection, business: BusinessRow, serviceId: UUID, priceCents: Int, start: Instant, now: Instant,
    ): AppliedOffer? {
        val candidates = OfferRepository.active(conn, business.id, serviceId).toMutableList()
        while (true) {
            val counts = OfferRepository.redemptions(conn, business.id, candidates.map { it.id })
            val best = OfferMatcher.best(candidates, serviceId, start, business.zone, now, priceCents, counts) ?: return null
            if (best.offer.maxRedemptions == null) return best
            OfferRepository.lock(conn, business.id, best.offer.id)
            val fresh = OfferRepository.redemptions(conn, business.id, listOf(best.offer.id))[best.offer.id] ?: 0
            if (OfferMatcher.hasCapacity(best.offer, fresh)) return best
            candidates.removeIf { it.id == best.offer.id }
        }
    }

    fun snapshot(applied: AppliedOffer, currency: String) = BookingOfferDto(
        applied.offer.id.toString(), applied.offer.name, OfferText.label(applied.offer.discount, currency), applied.originalCents,
        applied.discountCents,
    )

    fun toPublic(o: OfferRule, description: String?, currency: String) = PublicOfferDto(
        id = o.id.toString(), name = o.name, description = description, kind = o.kind.value, discount = OfferMapping.discount(o.discount),
        label = OfferText.label(o.discount, currency), summary = OfferText.summary(o.schedule),
        serviceIds = o.serviceIds.map { it.toString() }.sorted(), validUntil = o.schedule.validUntil?.toString(),
    )
}
