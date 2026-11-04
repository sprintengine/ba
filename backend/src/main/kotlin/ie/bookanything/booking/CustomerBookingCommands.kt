package ie.bookanything.booking

import ie.bookanything.audit.Actor
import ie.bookanything.auth.CurrentUser
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.availability.ShownSlots
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.Db
import ie.bookanything.http.DateRange
import ie.bookanything.http.Errors
import ie.bookanything.http.parseInstant
import java.sql.Connection
import java.time.Clock
import java.time.Instant
import java.util.UUID

/** A customer's own booking and its business. */
data class OwnBooking(val business: BusinessRow, val booking: BookingRow)

/**
 * What customers may do with their own bookings, with the same rules wherever they reach them: the manage link
 * (`/manage/{token}`), `/me` and AI assistants on the customer MCP. The conn-level commands run in the caller's
 * transaction; the `own` variants find a signed-in user's booking first and run in their own transactions.
 */
class CustomerBookingCommands(
    private val db: Db,
    private val clock: Clock,
    private val engine: BookingEngine,
    private val lifecycle: BookingLifecycle,
    private val availability: BookingAvailability,
) {
    /** Cancels under the customer policy: only while the business allows it online, refund per policy, emailed. */
    fun cancel(conn: Connection, business: BusinessRow, booking: BookingRow, reason: String?, actor: Actor, now: Instant): BookingRow =
        lifecycle.cancel(conn, business, booking.id, Cancellation.byCustomer(actor, trimReason(reason)), now)

    /** Moves the booking under the customer rules (notice window, its offer's schedule). */
    fun reschedule(
        conn: Connection, business: BusinessRow, booking: BookingRow, start: Instant, resourceId: UUID?, actor: Actor, now: Instant,
    ): BookingRow {
        requireMovable(business, booking, now)
        return engine.reschedule(conn, business, Reschedule.byCustomer(booking.id, start, resourceId, actor), now)
    }

    /** Free times the customer may move the booking to: those after [after], only the next one if the business says so. */
    fun availability(
        conn: Connection, business: BusinessRow, booking: BookingRow, range: DateRange, resourceId: UUID?, after: Instant?, now: Instant,
    ) = availability.forMove(
        conn, business, booking, range, resourceId, null, AvailabilityMode.PUBLIC, now, ShownSlots.forCustomer(business.policies, after),
    )

    /** The checkout link of a booking still held for payment (none once the business is suspended). */
    fun checkoutUrl(conn: Connection, business: BusinessRow, booking: BookingRow, now: Instant): String {
        if (business.isSuspended) throw Errors.policy("${business.name} isn't taking bookings or payments any more.")
        return engine.pendingCheckoutUrl(conn, business, booking, now)
    }

    /** One of [user]'s bookings (through a customer record linked to them), at any business; NOT_FOUND otherwise. */
    fun ownBooking(conn: Connection, user: CurrentUser, bookingId: UUID): OwnBooking {
        val booking = BookingRepository.load(conn, "b.id = ? AND c.user_id = ?", bookingId, user.id).firstOrNull()
            ?: throw Errors.notFound("Booking")
        val business = BusinessRepository.findById(conn, booking.businessId) ?: throw Errors.notFound("Booking")
        return OwnBooking(business, booking)
    }

    suspend fun ownBooking(user: CurrentUser, bookingId: UUID): OwnBooking = db.read { ownBooking(it, user, bookingId) }

    /** [cancel] for a signed-in customer's own booking. */
    suspend fun cancelOwn(user: CurrentUser, bookingId: UUID, reason: String?, actor: Actor): CustomerBookingDto {
        val (business, booking) = ownBooking(user, bookingId)
        val updated = db.tx(business.id) { conn -> cancel(conn, business, booking, reason, actor, clock.instant()) }
        return BookingViews.customerView(db.current(updated), business, clock.instant()) // with the refund made after the commit
    }

    /** [reschedule] for a signed-in customer's own booking; [start] is read in the business's timezone. */
    suspend fun rescheduleOwn(user: CurrentUser, bookingId: UUID, start: String, resourceId: UUID?, actor: Actor): CustomerBookingDto =
        rescheduleOwn(ownBooking(user, bookingId), start, resourceId, actor)

    /** Moves a booking already resolved with [ownBooking] (routes check ownership before they read the body). */
    suspend fun rescheduleOwn(own: OwnBooking, start: String, resourceId: UUID?, actor: Actor): CustomerBookingDto {
        val (business, booking) = own
        val at = parseInstant(start, "start", business.zone)
        val updated = db.tx(business.id) { conn -> reschedule(conn, business, booking, at, resourceId, actor, clock.instant()) }
        return BookingViews.customerView(updated, business, clock.instant())
    }

    private fun requireMovable(business: BusinessRow, booking: BookingRow, now: Instant) {
        if (!BookingViews.canReschedule(booking, business, now)) {
            throw Errors.policy("This booking can no longer be moved online. Please contact ${business.name}.")
        }
    }
}

private const val MAX_REASON_LENGTH = 500

/** A customer's cancellation reason as stored: trimmed, at most [MAX_REASON_LENGTH] characters, null when blank. */
internal fun trimReason(reason: String?): String? = reason?.trim()?.take(MAX_REASON_LENGTH)?.ifEmpty { null }
