package ie.bookanything.availability

import ie.bookanything.http.startIn
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.UUID

object Windows {
    /** Merges intervals into a sorted list of disjoint intervals. Touching intervals are joined. */
    fun merge(intervals: List<MinuteInterval>): List<MinuteInterval> {
        if (intervals.isEmpty()) return emptyList()
        val sorted = intervals.filter { it.end > it.start }.sortedBy { it.start }
        val out = ArrayList<MinuteInterval>()
        for (iv in sorted) {
            val last = out.lastOrNull()
            if (last != null && iv.start <= last.end) {
                out[out.size - 1] = MinuteInterval(last.start, maxOf(last.end, iv.end))
            } else {
                out.add(iv)
            }
        }
        return out
    }

    fun subtract(base: List<MinuteInterval>, cut: MinuteInterval): List<MinuteInterval> =
        base.flatMap { iv ->
            if (cut.end <= iv.start || cut.start >= iv.end) {
                listOf(iv)
            } else {
                listOfNotNull(
                    MinuteInterval(iv.start, cut.start).takeIf { it.length > 0 },
                    MinuteInterval(cut.end, iv.end).takeIf { it.length > 0 },
                )
            }
        }

    private fun minutes(t: LocalTime) = t.hour * 60 + t.minute

    /**
     * Local opening windows for one resource on one date:
     * rules (valid on the date, allowed for the audience) − unavailable overrides
     * + available overrides − whole-business closures, merged into disjoint intervals.
     */
    fun localWindows(
        resourceId: UUID,
        date: LocalDate,
        rules: List<RuleSpec>,
        overrides: List<OverrideSpec>,
        audience: AudienceContext,
    ): List<MinuteInterval> {
        val ruled = merge(rules.filter { it.opens(resourceId, date, audience) }.map { MinuteInterval(minutes(it.start), minutes(it.end)) })
        val own = overrides.filter { it.resourceId == resourceId && it.date == date }
        // Extra hours (available overrides) are open to everyone, so restricted groups don't get them.
        val extra = if (audience.allows(emptySet())) own.filter { it.isAvailable }.mapNotNull { it.interval() } else emptyList()
        val open = merge(closeAll(ruled, own.filter { !it.isAvailable }) + extra)
        return closeAll(open, overrides.filter { it.resourceId == null && it.date == date && !it.isAvailable })
    }

    /** Whether this rule opens [resourceId] on [date] for [audience] (day of week, validity dates, audience). */
    private fun RuleSpec.opens(resourceId: UUID, date: LocalDate, audience: AudienceContext): Boolean =
        this.resourceId == resourceId && dayOfWeek == date.dayOfWeek.value &&
            (validFrom == null || !date.isBefore(validFrom)) && (validUntil == null || !date.isAfter(validUntil)) &&
            audience.allows(audienceGroupIds)

    /** The override's time range, or null when it covers the whole day. */
    private fun OverrideSpec.interval(): MinuteInterval? =
        if (start != null && end != null) MinuteInterval(minutes(start), minutes(end)) else null

    /** [windows] minus each unavailable override; a whole-day one closes everything. */
    private fun closeAll(windows: List<MinuteInterval>, unavailable: List<OverrideSpec>): List<MinuteInterval> =
        unavailable.fold(windows) { open, o -> o.interval()?.let { subtract(open, it) }.orEmpty() }

    fun toInstants(date: LocalDate, zone: ZoneId, windows: List<MinuteInterval>): List<TimeInterval> =
        windows.map { TimeInterval(at(date, it.start, zone), at(date, it.end, zone)) }
            .filter { it.end.isAfter(it.start) }

    private fun at(date: LocalDate, minuteOfDay: Int, zone: ZoneId): Instant =
        if (minuteOfDay >= 24 * 60) {
            date.plusDays(1).startIn(zone)
        } else {
            ZonedDateTime.of(date, LocalTime.of(minuteOfDay / 60, minuteOfDay % 60), zone).toInstant()
        }

    /** Total open minutes (actual elapsed time, DST-aware) for a resource across a date range. */
    fun availableMinutes(
        resourceId: UUID, from: LocalDate, to: LocalDate, zone: ZoneId,
        rules: List<RuleSpec>, overrides: List<OverrideSpec>,
    ): Long {
        var total = 0L
        var d = from
        val audience = AudienceContext(ignoreAudience = true)
        while (!d.isAfter(to)) {
            toInstants(d, zone, localWindows(resourceId, d, rules, overrides, audience)).forEach {
                total += Duration.between(it.start, it.end).toMinutes()
            }
            d = d.plusDays(1)
        }
        return total
    }
}
