package ie.bookanything.booking

import ie.bookanything.availability.Assignment
import ie.bookanything.db.PgState
import ie.bookanything.db.TstzRange
import ie.bookanything.db.UuidArray
import ie.bookanything.db.query
import ie.bookanything.db.sqlState
import ie.bookanything.db.update
import ie.bookanything.http.Errors
import java.sql.Connection
import java.sql.SQLException
import java.util.UUID

/**
 * `booking_allocations`: which resources a booking blocks and when. Active allocations of exclusive bookings may not
 * overlap (exclusion constraint), which is what finally prevents double booking.
 */
object AllocationRepository {
    /** What a caller is told when another booking took the time first. */
    private const val SLOT_TAKEN = "That time is no longer available."

    /** Serialises bookings per resource: locks the resource rows in id order (no deadlocks). */
    fun lockResources(conn: Connection, businessId: UUID, resourceIds: Collection<UUID>) {
        if (resourceIds.isEmpty()) return
        conn.query(
            "SELECT id FROM resources WHERE business_id = ? AND id = ANY(?) ORDER BY id FOR UPDATE", businessId,
            UuidArray(resourceIds.toSet()),
        ) { 1 }
    }

    /**
     * Adds an active allocation per assignment, each blocking [range]. An overlap with another exclusive booking (the
     * exclusion constraint) is `SLOT_UNAVAILABLE`; the transaction is then aborted, so callers that go on use a savepoint.
     */
    fun insert(conn: Connection, businessId: UUID, bookingId: UUID, assignments: List<Assignment>, range: TstzRange, exclusive: Boolean) {
        try {
            for (a in assignments) {
                conn.update(
                    "INSERT INTO booking_allocations " +
                        "(business_id, booking_id, resource_id, requirement_id, time_range, exclusive, active) VALUES (?, ?, ?, ?, ?, ?, true)",
                    businessId, bookingId, a.resourceId, a.requirementId, range, exclusive,
                )
            }
        } catch (e: SQLException) {
            if (e.sqlState() == PgState.EXCLUSION_VIOLATION) throw Errors.slotUnavailable(SLOT_TAKEN) else throw e
        }
    }

    /** Removes all of a booking's allocations (before allocating it again). */
    fun delete(conn: Connection, businessId: UUID, bookingId: UUID) {
        conn.update("DELETE FROM booking_allocations WHERE business_id = ? AND booking_id = ?", businessId, bookingId)
    }

    /** Frees a booking's resources (it stopped blocking: cancelled, expired, completed, no-show). */
    fun release(conn: Connection, businessId: UUID, bookingId: UUID) {
        conn.update("UPDATE booking_allocations SET active = false WHERE business_id = ? AND booking_id = ?", businessId, bookingId)
    }

    /** Frees the resources of several bookings (periodic tasks, across businesses). */
    fun release(conn: Connection, bookingIds: Collection<UUID>) {
        conn.update("UPDATE booking_allocations SET active = false WHERE booking_id = ANY(?)", UuidArray(bookingIds))
    }
}
