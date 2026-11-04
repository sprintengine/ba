package ie.bookanything.offers

import ie.bookanything.availability.ComputedSlot
import ie.bookanything.booking.BookingRow
import ie.bookanything.business.BusinessRow
import ie.bookanything.http.Errors
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate

/**
 * A discounted booking keeps its price when moved, so customers may only move it to a time its offer's schedule
 * also covers (otherwise they could book an off-peak price and move to a peak slot). Staff can move it anywhere.
 * The offer's status and redemption cap don't matter here: the booking already holds its redemption.
 */
object OfferGuard {
    private fun rule(conn: Connection, business: BusinessRow, booking: BookingRow): OfferRule? =
        booking.offerId?.let { OfferRepository.get(conn, business.id, it)?.rule }

    private fun covers(rule: OfferRule, business: BusinessRow, start: Instant, now: Instant): Boolean =
        OfferMatcher.scheduleCovers(rule.schedule, start, business.zone, now)

    fun requireCovers(conn: Connection, business: BusinessRow, booking: BookingRow, newStart: Instant, now: Instant) {
        val rule = rule(conn, business, booking) ?: return
        if (!covers(rule, business, newStart, now)) {
            throw Errors.policy(
                "This booking has the \"${rule.name}\" price, which only applies at these times: ${OfferText.summary(rule.schedule)}. " +
                    "Choose one of those times, or cancel and book again.",
            )
        }
    }

    fun filter(
        conn: Connection, business: BusinessRow, booking: BookingRow, days: Map<LocalDate, List<ComputedSlot>>, now: Instant,
    ): Map<LocalDate, List<ComputedSlot>> {
        val rule = rule(conn, business, booking) ?: return days
        return days.mapValues { (_, slots) -> slots.filter { covers(rule, business, it.start, now) } }
    }
}
