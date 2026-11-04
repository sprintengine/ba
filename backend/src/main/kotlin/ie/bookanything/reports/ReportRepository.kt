package ie.bookanything.reports

import ie.bookanything.availability.SlotDataRepository
import ie.bookanything.availability.Windows
import ie.bookanything.booking.BookingStatus
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.int
import ie.bookanything.db.localDate
import ie.bookanything.db.long
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.uuid
import ie.bookanything.http.DateRange
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** The report summary (`GET /reports/summary`), also used by the assistant. Dates are in the business timezone. */
object ReportRepository {
    /**
     * Revenue per booking = paid − refunded, plus the price of completed pay-at-venue bookings (money taken at the
     * venue is only known once the booking is completed).
     */
    private const val REVENUE = "(b.amount_paid_cents - b.amount_refunded_cents + CASE WHEN b.payment_status = 'pay_at_venue' AND " +
        "b.status = 'completed' THEN b.price_cents ELSE 0 END)"

    fun summary(conn: Connection, b: BusinessRow, from: LocalDate, to: LocalDate): ReportSummary {
        val range = DateRange(from, to)
        val period = Period(b, range.startIn(b.zone), range.endIn(b.zone))
        return ReportSummary(
            from.toString(), to.toString(), b.currency, totals(conn, period).copy(newCustomers = newCustomers(conn, period)),
            byDay(conn, period, range), byService(conn, period), byResource(conn, period, range),
        )
    }

    /** The business and the instants bounding the report's days. */
    private class Period(val b: BusinessRow, val start: Instant, val end: Instant)

    private fun totals(conn: Connection, p: Period): ReportTotals = conn.queryOne(
        """
        SELECT count(*) FILTER (WHERE b.status <> 'expired') AS bookings,
            count(*) FILTER (WHERE b.status IN ('confirmed', 'completed')) AS confirmed,
            count(*) FILTER (WHERE b.status = 'cancelled') AS cancelled,
            count(*) FILTER (WHERE b.status = 'no_show') AS no_shows,
            COALESCE(sum($REVENUE), 0) AS revenue,
            COALESCE(sum(b.amount_refunded_cents), 0) AS refunded
        FROM bookings b WHERE b.business_id = ? AND b.start_at >= ? AND b.start_at < ?
        """.trimIndent(),
        p.b.id, p.start, p.end,
    ) { rs ->
        ReportTotals(
            rs.int("bookings"), rs.int("confirmed"), rs.int("cancelled"), rs.int("no_shows"),
            rs.long("revenue").toInt(), rs.long("refunded").toInt(), newCustomers = 0,
        )
    }!!

    private fun newCustomers(conn: Connection, p: Period): Int = conn.queryOne(
        "SELECT count(*) FROM customers WHERE business_id = ? AND created_at >= ? AND created_at < ?", p.b.id, p.start, p.end,
    ) { it.getInt(1) } ?: 0

    /** Every day of the range, including days without bookings. */
    private fun byDay(conn: Connection, p: Period, range: DateRange): List<ReportDay> {
        val rows = conn.query(
            """
            SELECT (b.start_at AT TIME ZONE ?)::date AS d, count(*) FILTER (WHERE b.status <> 'expired') AS n, COALESCE(sum($REVENUE), 0) AS revenue
            FROM bookings b WHERE b.business_id = ? AND b.start_at >= ? AND b.start_at < ?
            GROUP BY 1 ORDER BY 1
            """.trimIndent(),
            p.b.timezone, p.b.id, p.start, p.end,
        ) { it.localDate("d") to (it.int("n") to it.long("revenue").toInt()) }.toMap()
        return generateSequence(range.from) { it.plusDays(1) }.takeWhile { !it.isAfter(range.to) }.map { d ->
            val (n, r) = rows[d] ?: (0 to 0)
            ReportDay(d.toString(), n, r)
        }.toList()
    }

    private fun byService(conn: Connection, p: Period): List<ReportService> = conn.query(
        """
        SELECT s.id, s.name, count(b.id) AS n, COALESCE(sum($REVENUE), 0) AS revenue
        FROM bookings b JOIN services s ON s.id = b.service_id
        WHERE b.business_id = ? AND b.start_at >= ? AND b.start_at < ? AND b.status <> 'expired'
        GROUP BY s.id, s.name ORDER BY n DESC, s.name
        """.trimIndent(),
        p.b.id, p.start, p.end,
    ) { ReportService(it.uuid("id").toString(), it.str("name"), it.int("n"), it.long("revenue").toInt()) }

    /** Booked versus available minutes per active resource (utilisation, rounded to three decimals). */
    private fun byResource(conn: Connection, p: Period, range: DateRange): List<ReportResource> {
        val resources = conn.query(
            "SELECT id, name FROM resources WHERE business_id = ? AND is_active ORDER BY sort_order, name", p.b.id,
        ) { it.uuid("id") to it.str("name") }
        val booked = bookedMinutes(conn, p)
        // The slot engine's loaders: the same rules and closures availability is computed from.
        val ids = resources.map { it.first }.toSet()
        val rules = SlotDataRepository.rules(conn, p.b.id, ids, range.from, range.to)
        val overrides = SlotDataRepository.overrides(conn, p.b.id, ids, range.from, range.to)
        return resources.map { (id, name) ->
            val available = Windows.availableMinutes(id, range.from, range.to, p.b.zone, rules, overrides)
            val bookedMinutes = booked[id] ?: 0L
            ReportResource(
                id.toString(), name, bookedMinutes.toInt(), available.toInt(),
                if (available > 0) Math.round(bookedMinutes.toDouble() / available * 1000) / 1000.0 else 0.0,
            )
        }
    }

    /**
     * Allocated minutes inside the period per resource. Driven from the period's bookings (the (business_id, start_at)
     * index, widened by [ALLOCATION_LOOKBACK] and [ALLOCATION_LOOKAHEAD] so allocations that start before or reach past
     * their booking are still found), not from every allocation the business ever had: under row-level security the
     * range overlap can't use an index.
     */
    private fun bookedMinutes(conn: Connection, p: Period): Map<UUID, Long> = conn.query(
        """
        SELECT a.resource_id, COALESCE(sum(EXTRACT(EPOCH FROM (upper(a.time_range * tstzrange(?, ?)) - lower(a.time_range * tstzrange(?, ?)))) / 60), 0)::bigint AS minutes
        FROM bookings b JOIN booking_allocations a ON a.booking_id = b.id AND a.business_id = b.business_id
        WHERE b.business_id = ? AND b.start_at >= ? AND b.start_at < ?
          AND ${BookingStatus.sqlIn("b.status", UTILISED)} AND a.time_range && tstzrange(?, ?)
        GROUP BY a.resource_id
        """.trimIndent(),
        p.start, p.end, p.start, p.end, p.b.id, p.start.minus(ALLOCATION_LOOKBACK), p.end.plus(ALLOCATION_LOOKAHEAD), p.start, p.end,
    ) { it.uuid("resource_id") to it.long("minutes") }.toMap()

    /** Longer than any booking with its buffers (a day's duration, add-ons and up to 8 hours of buffer after). */
    private val ALLOCATION_LOOKBACK: Duration = Duration.ofDays(7)

    /** At least the longest buffer before a booking (8 hours), which its allocation starts with. */
    private val ALLOCATION_LOOKAHEAD: Duration = Duration.ofHours(8)

    /** Bookings whose time counts as booked: an unpaid hold doesn't yet. */
    private val UTILISED: Set<BookingStatus> =
        setOf(BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW, BookingStatus.PENDING_APPROVAL)
}
