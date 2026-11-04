package ie.bookanything.http

import io.ktor.server.application.ApplicationCall
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/** An inclusive range of calendar days in the business timezone, as availability, list and report requests take it. */
data class DateRange(val from: LocalDate, val to: LocalDate) {
    /** The number of days covered, counting both ends. */
    val days: Long get() = ChronoUnit.DAYS.between(from, to) + 1

    /** This range, or a field error on `to` when it ends before it starts or covers more than [maxDays] days. */
    fun requireValid(maxDays: Long): DateRange {
        if (to.isBefore(from)) throw Errors.field("to", "Must be on or after from")
        if (days > maxDays) throw Errors.field("to", "The range can be at most $maxDays days")
        return this
    }

    /** The first instant of [from] in [zone] (inclusive). */
    fun startIn(zone: ZoneId): Instant = from.startIn(zone)

    /** The first instant after [to] in [zone] (exclusive). */
    fun endIn(zone: ZoneId): Instant = to.plusDays(1).startIn(zone)
}

/** The first instant of this day in [zone] (midnight, or the first valid time on a DST-gap day). */
fun LocalDate.startIn(zone: ZoneId): Instant = atStartOfDay(zone).toInstant()

/** The required `from` and `to` query parameters (YYYY-MM-DD). */
fun ApplicationCall.requireQueryDateRange(): DateRange = DateRange(requireQueryDate("from"), requireQueryDate("to"))
