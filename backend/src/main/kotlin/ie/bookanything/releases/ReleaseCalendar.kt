package ie.bookanything.releases

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.TemporalAdjusters

/** When a schedule opens each day (docs/architecture.md section 21). Pure: no I/O, no clock. */
object ReleaseCalendar {
    /** Every date released together with another lies within this many days of it (a week, or a weekend skipped). */
    private const val SAME_RELEASE_SPAN = 6L

    /** The local date on which [date] is released. */
    fun releaseDate(t: ReleaseTiming, date: LocalDate): LocalDate = when (t.cadence) {
        ReleaseCadence.DAILY -> date.minusDays(t.daysBefore.toLong()).let { if (t.weekdaysOnly) weekdayOnOrBefore(it) else it }
        ReleaseCadence.WEEKLY -> date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
            .minusWeeks(t.weeksAhead.toLong()).plusDays(t.weekday - 1L)
    }

    /**
     * The instant the schedule opens [date]: its release date at the release time in [zone]. A release time that doesn't
     * exist that day (the spring DST gap) moves forward by the gap, as [ZonedDateTime.of] resolves it.
     */
    fun scheduledAt(t: ReleaseTiming, date: LocalDate, zone: ZoneId): Instant =
        ZonedDateTime.of(releaseDate(t, date), t.time, zone).toInstant()

    /** When [date] opens: at [change]'s time when one moved it (null when it is held), else on schedule. */
    fun opensAt(t: ReleaseTiming, change: ReleaseChange?, date: LocalDate, zone: ZoneId): Instant? =
        if (change != null) change.opensAt else scheduledAt(t, date, zone)

    /** The dates the schedule releases at the same moment as [date] (its week, or a Friday's weekend), in order. */
    fun sameRelease(t: ReleaseTiming, date: LocalDate): List<LocalDate> {
        val release = releaseDate(t, date)
        return (-SAME_RELEASE_SPAN..SAME_RELEASE_SPAN).map { date.plusDays(it) }.filter { releaseDate(t, it) == release }
    }

    /**
     * How many days after its release date a day can be: every day further ahead of today than this is released after
     * today, so it can't have opened on schedule yet.
     */
    fun reachDays(t: ReleaseTiming): Long = when (t.cadence) {
        ReleaseCadence.DAILY -> t.daysBefore + (if (t.weekdaysOnly) WEEKEND_DAYS else 0L)
        ReleaseCadence.WEEKLY -> ReleaseTiming.DAYS_PER_WEEK.toLong() * t.weeksAhead + ReleaseTiming.DAYS_PER_WEEK - 1
    }

    /**
     * The days [old] has already opened by [now] that [new] would close again, with when each opened: changing a
     * schedule's timing keeps them open (section 21). Days in [changed] keep their change either way, so they're left out.
     */
    fun closedByChange(
        old: ReleaseTiming, new: ReleaseTiming, changed: Set<LocalDate>, zone: ZoneId, now: Instant,
    ): Map<LocalDate, Instant> {
        val today = LocalDate.ofInstant(now, zone)
        return (0..reachDays(old)).map { today.plusDays(it) }.filter { it !in changed }.mapNotNull { date ->
            val opened = scheduledAt(old, date, zone)
            (date to opened).takeIf { !opened.isAfter(now) && scheduledAt(new, date, zone).isAfter(now) }
        }.toMap()
    }

    private fun weekdayOnOrBefore(d: LocalDate): LocalDate = when (d.dayOfWeek) {
        DayOfWeek.SATURDAY -> d.minusDays(1)
        DayOfWeek.SUNDAY -> d.minusDays(WEEKEND_DAYS)
        else -> d
    }

    private const val WEEKEND_DAYS = 2L
}
