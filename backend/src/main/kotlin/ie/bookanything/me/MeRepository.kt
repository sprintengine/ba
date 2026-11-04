package ie.bookanything.me

import ie.bookanything.booking.BookingRepository
import ie.bookanything.booking.BookingRow
import ie.bookanything.booking.BookingStatus
import ie.bookanything.business.Branding
import ie.bookanything.db.exists
import ie.bookanything.db.jsonOr
import ie.bookanything.db.query
import ie.bookanything.db.str
import ie.bookanything.db.uuid
import kotlinx.serialization.serializer
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/** Queries across businesses for the signed-in user (`/me`); unscoped, always filtered by the user. */
object MeRepository {
    /** The user's active memberships of businesses that are not suspended, by business name. */
    fun memberships(conn: Connection, userId: UUID): List<MeMembership> = conn.query(
        """
        SELECT b.id, b.slug, b.name, m.role::text AS role, b.branding::text AS branding
        FROM business_members m JOIN businesses b ON b.id = m.business_id
        WHERE m.user_id = ? AND m.status = 'active' AND b.status <> 'suspended'
        ORDER BY b.name
        """.trimIndent(),
        userId,
    ) {
        MeMembership(
            it.uuid("id").toString(), it.str("slug"), it.str("name"), it.str("role"),
            it.jsonOr("branding", serializer<Branding>(), Branding()),
        )
    }

    /**
     * The user's bookings still to come (holding their time and not yet ended), soonest first. Not limited: they are
     * what the account page is for, and a customer only has so many.
     */
    fun upcomingBookings(conn: Connection, userId: UUID, now: Instant): List<BookingRow> =
        BookingRepository.load(conn, "c.user_id = ? AND $BLOCKING AND b.end_at > ?", userId, now)

    /** The user's other bookings (ended, cancelled, no-shows), latest first, at most [limit]. Expired holds are left out. */
    fun pastBookings(conn: Connection, userId: UUID, now: Instant, limit: Int): List<BookingRow> = BookingRepository.load(
        conn, "c.user_id = ? AND b.status <> 'expired' AND NOT ($BLOCKING AND b.end_at > ?)", userId, now,
        suffix = "ORDER BY b.start_at DESC, b.id DESC LIMIT $limit",
    )

    /** Whether any business has a (non-expired) booking for a customer record linked to the user. */
    fun hasBookings(conn: Connection, userId: UUID): Boolean = conn.exists(
        // Joined on business_id too, so the (business_id, customer_id) index finds the bookings instead of a scan of all of them.
        "SELECT 1 FROM bookings b JOIN customers c ON c.id = b.customer_id AND c.business_id = b.business_id " +
            "WHERE c.user_id = ? AND b.status <> 'expired'",
        userId,
    )

    /** [BookingStatus.isBlocking] in SQL. */
    private val BLOCKING = BookingStatus.sqlIn("b.status", BookingStatus.BLOCKING)
}
