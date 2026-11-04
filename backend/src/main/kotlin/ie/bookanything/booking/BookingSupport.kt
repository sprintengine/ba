package ie.bookanything.booking

import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.Db
import ie.bookanything.db.afterCommit
import ie.bookanything.http.Errors
import ie.bookanything.http.startIn
import ie.bookanything.observability.AppMetrics
import ie.bookanything.observability.Telemetry
import ie.bookanything.payments.PaymentRepository
import java.security.SecureRandom
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** Shared helpers for the booking transaction (locking, holds, references, answers, limits). */
object BookingSupport {
    private val random = SecureRandom()
    private const val CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

    fun newReference(conn: Connection, businessId: UUID): String {
        repeat(10) {
            val code = "BA-" + (1..6).map { CROCKFORD[random.nextInt(CROCKFORD.length)] }.joinToString("")
            if (!BookingRepository.referenceExists(conn, businessId, code)) return code
        }
        error("Could not allocate a booking reference")
    }

    /**
     * Expires stale holds (held and past hold_expires_at): status → expired, allocations released,
     * pending charges cancelled. Scoped to [resourceIds] when given, else all (periodic job).
     */
    fun expireStaleHolds(conn: Connection, now: Instant, businessId: UUID? = null, resourceIds: Collection<UUID>? = null): List<
        Pair<
            UUID,
            UUID,
            >,
        > {
        if (resourceIds != null && resourceIds.isEmpty()) return emptyList()
        val expired = BookingRepository.expireHolds(conn, now, businessId, resourceIds)
        if (expired.isNotEmpty()) {
            val ids = expired.map { it.first }
            AllocationRepository.release(conn, ids)
            PaymentRepository.cancelPendingCharges(conn, ids)
            conn.afterCommit { Telemetry.metrics.holds(AppMetrics.HoldOutcome.EXPIRED, expired.size) }
        }
        return expired
    }

    fun monthlyBookingCount(conn: Connection, business: BusinessRow, now: Instant): Long {
        val monthStart = LocalDate.ofInstant(now, business.zone).withDayOfMonth(1).startIn(business.zone)
        return BookingRepository.countCreatedSince(conn, business.id, monthStart)
    }

    /**
     * Takes the business's monthly count for this transaction when its plan limits bookings (false when it doesn't), so
     * bookings made at once count one after another: each counting first, they all saw the last place free.
     */
    fun lockBookingLimit(conn: Connection, business: BusinessRow): Boolean {
        if (business.plan.monthlyBookingLimit == null) return false
        BusinessRepository.lockMonthlyBookings(conn, business.id)
        return true
    }

    /** Refuses a new booking past the plan's monthly limit. Call it holding [lockBookingLimit]'s lock. */
    fun checkBookingLimit(conn: Connection, business: BusinessRow, now: Instant) {
        val limit = business.plan.monthlyBookingLimit ?: return
        if (monthlyBookingCount(conn, business, now) >= limit) {
            throw Errors.planLimit("${business.name} can't take more online bookings this month. Please contact them directly.")
        }
    }

    fun requireBlockingStatus(b: BookingRow, allowed: Set<BookingStatus>, action: String) {
        if (b.status !in allowed) throw Errors.policy("This booking can't be $action because it is ${b.status.label}.")
    }
}

/**
 * [booking] as it stands now, read in a new transaction. A cancellation's refund reaches the provider after its
 * transaction commits ([RefundSettlement]), so a response that reports the refund reads the booking again.
 */
suspend fun Db.current(booking: BookingRow): BookingRow =
    read(booking.businessId) { BookingRepository.get(it, booking.businessId, booking.id) } ?: booking
