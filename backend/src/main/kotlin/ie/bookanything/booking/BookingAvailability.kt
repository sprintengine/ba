package ie.bookanything.booking

import ie.bookanything.availability.AvailabilityDto
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.availability.AvailabilityRequest
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.availability.ShownSlots
import ie.bookanything.business.BusinessRow
import ie.bookanything.http.DateRange
import ie.bookanything.offers.OfferGuard
import ie.bookanything.offers.OfferPricing
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/**
 * Free times as the booking screens show them: for a new booking (public, staff, Bo and the MCP tools), each slot
 * priced like the booking it would become; and for moving an existing booking.
 */
class BookingAvailability(private val engine: BookingEngine) {
    /** Free times for a new booking of [req]'s selection; slots an offer discounts carry it (docs/architecture.md section 19). */
    fun forNewBooking(conn: Connection, req: AvailabilityRequest, now: Instant): AvailabilityDto {
        val pricing = AvailabilityService.pricing(req.service, req.optionId, req.addonIds)
        return AvailabilityService.toDto(
            req, AvailabilityService.computeDays(conn, req, now), pricing.durationMinutes,
            OfferPricing.slotOffers(conn, req.business, req.service.id, pricing.priceCents, now),
        )
    }

    /**
     * Free times to move [booking] to: its own service, duration and customer group, with its own allocations ignored
     * (a booking may move into a slot that overlaps its current time). Customers only see times its offer covers, and of
     * those the ones [shown] lets through, with the person they chose unless they choose again ([SlotCheck.keptChoice]).
     */
    fun forMove(
        conn: Connection, business: BusinessRow, booking: BookingRow, range: DateRange, selectedResourceId: UUID?,
        forcedResourceIds: List<UUID>?, mode: AvailabilityMode, now: Instant, shown: ShownSlots = ShownSlots.ALL,
    ): AvailabilityDto {
        val service = engine.loadService(conn, business.id, booking.serviceId)
        val req = AvailabilityRequest(
            business = business, service = service, groupId = booking.groupId, selectedResourceId = selectedResourceId,
            keptResourceId = SlotCheck.keptChoice(booking, service, mode), forcedResourceIds = forcedResourceIds, from = range.from,
            to = range.to, mode = mode, excludeBookingId = booking.id, fixedDurationMinutes = booking.durationMinutes, shown = shown,
        )
        val days = AvailabilityService.computeDays(conn, req, now)
        // Customers only see times the booking's offer covers.
        val allowed = if (mode == AvailabilityMode.PUBLIC) {
            days.copy(slots = OfferGuard.filter(conn, business, booking, days.slots, now))
        } else {
            days
        }
        return AvailabilityService.toDto(req, allowed, booking.durationMinutes)
    }
}
