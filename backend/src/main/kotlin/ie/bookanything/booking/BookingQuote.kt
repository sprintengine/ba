package ie.bookanything.booking

import ie.bookanything.availability.AvailabilityService
import ie.bookanything.availability.Pricing
import ie.bookanything.business.BusinessRow
import ie.bookanything.offers.AppliedOffer
import ie.bookanything.offers.OfferPricing
import ie.bookanything.services.ServiceDef
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/**
 * What a new booking costs: the selection's list price, the offer it gets (at most one, the best for the customer;
 * docs/architecture.md section 19) and what online payment takes up front. The booking engine and Bo's
 * create_booking preview use the same quote.
 */
data class BookingQuote(val pricing: Pricing, val offer: AppliedOffer?, val paymentMode: String, val depositCents: Int?) {
    /** What the customer owes: the offer price, else the list price. Payments, deposits, refunds and reports use it. */
    val priceCents: Int get() = offer?.finalCents ?: pricing.priceCents

    /** What online payment takes now (the deposit for deposit services). */
    val dueNowCents: Int get() = dueOnline(paymentMode, depositCents, priceCents)

    companion object {
        /** The one "amount due online" rule: a deposit service takes its deposit (never more than the price), others the price. */
        fun dueOnline(paymentMode: String, depositCents: Int?, priceCents: Int): Int =
            if (paymentMode == "deposit") minOf(depositCents ?: priceCents, priceCents) else priceCents

        /**
         * The quote for a booking being made now, inside its transaction: a capped offer is locked and re-counted
         * ([OfferPricing.quoteForBooking]). Validates the option (required when the service has options) and add-ons.
         */
        fun forBooking(
            conn: Connection, business: BusinessRow, service: ServiceDef, optionId: UUID?, addonIds: List<UUID>, start: Instant,
            now: Instant,
        ): BookingQuote {
            val pricing = AvailabilityService.pricing(service, optionId, addonIds, requireOption = true)
            return of(service, pricing, OfferPricing.quoteForBooking(conn, business, service.id, pricing.priceCents, start, now))
        }

        /** The same quote for a preview (Bo's proposal card): reserves nothing. */
        fun preview(
            conn: Connection, business: BusinessRow, service: ServiceDef, optionId: UUID?, addonIds: List<UUID>, start: Instant,
            now: Instant,
        ): BookingQuote {
            val pricing = AvailabilityService.pricing(service, optionId, addonIds, requireOption = true)
            return of(service, pricing, OfferPricing.preview(conn, business, service.id, pricing.priceCents, start, now))
        }

        private fun of(service: ServiceDef, pricing: Pricing, offer: AppliedOffer?) =
            BookingQuote(pricing, offer, service.paymentMode, service.depositCents)
    }
}
