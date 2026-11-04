package ie.bookanything.availability

import ie.bookanything.http.startIn
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID

/*
 * Pure slot computation (docs/architecture.md section 5.1). No I/O: the caller loads all
 * rules, overrides and allocations for the range with a bounded number of queries and
 * passes them in. Everything here is deterministic and unit-testable.
 */

data class RuleSpec(
    val resourceId: UUID,
    val dayOfWeek: Int,
    val start: LocalTime,
    val end: LocalTime,
    val validFrom: LocalDate? = null,
    val validUntil: LocalDate? = null,
    val audienceGroupIds: Set<UUID> = emptySet(),
)

/** resourceId == null means a whole-business closure. */
data class OverrideSpec(
    val resourceId: UUID?,
    val date: LocalDate,
    val isAvailable: Boolean,
    val start: LocalTime? = null,
    val end: LocalTime? = null,
)

data class BusyAllocation(
    val bookingId: UUID,
    val resourceId: UUID,
    /** Blocked range including buffers. */
    val start: Instant,
    val end: Instant,
    val exclusive: Boolean,
    val serviceId: UUID,
    /** Service start of the booking (identifies a group session). */
    val sessionStart: Instant,
)

data class ResourceSpec(val id: UUID, val sortOrder: Int)

data class RequirementSpec(val id: UUID?, val quantity: Int, val pool: List<UUID>)

/** Who is asking: their customer group and which groups are restricted. */
data class AudienceContext(
    val groupId: UUID? = null,
    val restrictedGroupIds: Set<UUID> = emptySet(),
    val ignoreAudience: Boolean = false,
) {
    fun allows(audience: Set<UUID>): Boolean = when {
        ignoreAudience -> true
        audience.isEmpty() -> groupId == null || groupId !in restrictedGroupIds
        else -> groupId != null && groupId in audience
    }
}

data class MinuteInterval(val start: Int, val end: Int) {
    val length get() = end - start
}

data class TimeInterval(val start: Instant, val end: Instant) {
    fun contains(other: TimeInterval) = !other.start.isBefore(start) && !other.end.isAfter(end)
    fun overlaps(s: Instant, e: Instant) = s.isBefore(end) && start.isBefore(e)
}

data class Assignment(val requirementId: UUID?, val resourceId: UUID)

data class ComputedSlot(
    val start: Instant,
    val end: Instant,
    val assignments: List<Assignment>,
    val seatsLeft: Int?,
)

data class SlotQuery(
    val zone: ZoneId,
    val from: LocalDate,
    val to: LocalDate,
    val now: Instant,
    val serviceId: UUID,
    val durationMinutes: Int,
    val bufferBeforeMinutes: Int,
    val bufferAfterMinutes: Int,
    val stepMinutes: Int,
    /** Earliest allowed start (now + min notice), or now when notice is not enforced. */
    val earliestStart: Instant,
    /** Last allowed local date (today + max advance), or null for no limit. */
    val latestDate: LocalDate?,
    val capacity: Int,
    val requirements: List<RequirementSpec>,
    val resources: Map<UUID, ResourceSpec>,
    val rules: List<RuleSpec>,
    val overrides: List<OverrideSpec>,
    val busy: List<BusyAllocation>,
    val audience: AudienceContext,
    /** Booking whose own allocations are ignored (reschedule). */
    val excludeBookingId: UUID? = null,
    /** When set, only this exact start is evaluated. */
    val onlyStart: Instant? = null,
)

object SlotEngine {

    fun findSlots(q: SlotQuery): Map<LocalDate, List<ComputedSlot>> {
        val dates = generateSequence(q.from) { it.plusDays(1) }.takeWhile { !it.isAfter(q.to) }.toList()
        if (q.requirements.isEmpty() || q.requirements.any { it.pool.size < it.quantity }) return dates.associateWith { emptyList() }
        val poolIds = q.requirements.flatMap { it.pool }.toSet()
        val busy = q.busy.filter { it.resourceId in poolIds && it.bookingId != q.excludeBookingId }.groupBy { it.resourceId }
        return dates.associateWith { date ->
            if (q.latestDate != null && date.isAfter(q.latestDate)) emptyList() else slotsOn(q, Day.of(q, date, poolIds, busy))
        }
    }

    /** One date as the engine sees it: each pool resource's open windows, busy allocations and booked minutes. */
    private class Day(
        val windows: Map<UUID, List<TimeInterval>>,
        val busy: Map<UUID, List<BusyAllocation>>,
        val bookedMinutes: Map<UUID, Long>,
    ) {
        companion object {
            fun of(q: SlotQuery, date: LocalDate, poolIds: Set<UUID>, busy: Map<UUID, List<BusyAllocation>>): Day {
                val dayStart = date.startIn(q.zone)
                val dayEnd = date.plusDays(1).startIn(q.zone)
                // Open windows (and so every span checked) lie within the day, so only allocations overlapping it matter.
                val dayBusy = busy.mapValues { (_, list) -> list.filter { it.start.isBefore(dayEnd) && dayStart.isBefore(it.end) } }
                return Day(
                    windows = poolIds.associateWith { rid ->
                        Windows.toInstants(date, q.zone, Windows.localWindows(rid, date, q.rules, q.overrides, q.audience))
                    },
                    busy = dayBusy,
                    bookedMinutes = poolIds.associateWith { rid ->
                        dayBusy[rid].orEmpty().sumOf { b ->
                            val s = maxOf(b.start, dayStart)
                            val e = minOf(b.end, dayEnd)
                            if (e.isAfter(s)) Duration.between(s, e).toMinutes() else 0L
                        }
                    },
                )
            }
        }
    }

    private fun slotsOn(q: SlotQuery, day: Day): List<ComputedSlot> {
        val before = Duration.ofMinutes(q.bufferBeforeMinutes.toLong())
        val service = Duration.ofMinutes(q.durationMinutes.toLong())
        val after = Duration.ofMinutes(q.bufferAfterMinutes.toLong())
        val step = Duration.ofMinutes(maxOf(MIN_STEP_MINUTES, q.stepMinutes).toLong())
        return candidateStarts(day.windows.values.flatten(), before, service.plus(after), step)
            .filter { (q.onlyStart == null || it == q.onlyStart) && !it.isBefore(q.earliestStart) && !it.isBefore(q.now) }
            .mapNotNull { t -> assign(q, day, t, TimeInterval(t.minus(before), t.plus(service).plus(after)))?.copy(end = t.plus(service)) }
    }

    /**
     * The possible starts in [windows], in time order without duplicates: from each window's start plus [before], every
     * [step], while the service and the buffer after it ([rest]) still end inside the window.
     */
    internal fun candidateStarts(windows: List<TimeInterval>, before: Duration, rest: Duration, step: Duration): Set<Instant> {
        val starts = sortedSetOf<Instant>()
        for (w in windows) {
            var t = w.start.plus(before)
            while (!t.plus(rest).isAfter(w.end)) {
                starts.add(t)
                t = t.plus(step)
            }
        }
        return starts
    }

    /** A resource that could serve a requirement at one start, with what the deterministic choice orders by. */
    internal data class Candidate(val resourceId: UUID, val seatsUsed: Int, val allocated: Long, val sortOrder: Int)

    private fun assign(q: SlotQuery, day: Day, start: Instant, span: TimeInterval): ComputedSlot? {
        val session = q.capacity > 1
        val options = q.requirements.map { req ->
            req.pool.distinct().mapNotNull { rid ->
                seatsUsed(q, day, rid, start, span)?.let { seats ->
                    Candidate(rid, seats, day.bookedMinutes[rid] ?: 0L, q.resources[rid]?.sortOrder ?: 0)
                }
            }.sortedWith(
                compareBy<Candidate>(
                    { if (session) -it.seatsUsed else 0 }, { it.allocated }, { it.sortOrder }, { it.resourceId.toString() },
                ),
            )
        }
        val chosen = pickDistinct(options, q.requirements.map { it.quantity }) ?: return null
        return ComputedSlot(
            start = start,
            end = start,
            assignments = chosen.map { (idx, c) -> Assignment(q.requirements[idx].id, c.resourceId) },
            seatsLeft = if (session) q.capacity - chosen.maxOf { it.second.seatsUsed } else null,
        )
    }

    /**
     * Seats already taken on [rid] for a booking spanning [span] from [start], or null when it can't take it: the span
     * must fit an open window; a one-seat service needs the resource free, a group session may only share it with the
     * same session (same service and start, not exclusive) while seats remain.
     */
    private fun seatsUsed(q: SlotQuery, day: Day, rid: UUID, start: Instant, span: TimeInterval): Int? {
        val overlapping = day.busy[rid].orEmpty().filter { span.overlaps(it.start, it.end) }
        val used = overlapping.map { it.bookingId }.distinct().size
        return when {
            day.windows[rid].orEmpty().none { it.contains(span) } -> null
            q.capacity <= 1 -> if (overlapping.isEmpty()) 0 else null
            overlapping.any { it.exclusive || it.serviceId != q.serviceId || it.sessionStart != start } -> null
            else -> used.takeIf { it < q.capacity }
        }
    }

    /**
     * Picks `quantities[i]` distinct resources from `options[i]` for every requirement, trying candidates in order and
     * backtracking, so a resource never fills two places. Returns (requirement index, candidate) pairs, or null.
     */
    internal fun pickDistinct(options: List<List<Candidate>>, quantities: List<Int>): List<Pair<Int, Candidate>>? {
        val picker = DistinctPicker(options, quantities)
        return if (picker.fill(0, 0, quantities.firstOrNull() ?: 0)) picker.chosen else null
    }

    private class DistinctPicker(private val options: List<List<Candidate>>, private val quantities: List<Int>) {
        val chosen = ArrayList<Pair<Int, Candidate>>()
        private val used = HashSet<UUID>()

        /** Fills requirement [req] with [remaining] more resources from index [from], then the following requirements. */
        fun fill(req: Int, from: Int, remaining: Int): Boolean {
            if (req == options.size) return true
            if (remaining == 0) return fill(req + 1, 0, quantities.getOrElse(req + 1) { 0 })
            val candidates = options[req]
            for (i in from until candidates.size) {
                val c = candidates[i]
                if (c.resourceId !in used) {
                    used.add(c.resourceId)
                    chosen.add(req to c)
                    if (fill(req, i + 1, remaining - 1)) return true
                    used.remove(c.resourceId)
                    chosen.removeAt(chosen.size - 1)
                }
            }
            return false
        }
    }
}

/** Slots never start more often than every 5 minutes. */
private const val MIN_STEP_MINUTES = 5
