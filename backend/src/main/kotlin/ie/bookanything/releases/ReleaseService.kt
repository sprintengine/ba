package ie.bookanything.releases

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.business.BusinessRow
import ie.bookanything.customers.CustomerGroupRepository
import ie.bookanything.http.DateRange
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.http.formatInstant
import ie.bookanything.http.parseInstant
import ie.bookanything.http.startIn
import ie.bookanything.services.ServiceRepository
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** Release schedule commands (owner/admin; docs/architecture.md section 21). Every method runs in the caller's transaction. */
object ReleaseService {
    const val MAX_SCHEDULES = 20
    const val MAX_RANGE_DAYS = 31L

    fun list(conn: Connection, business: BusinessRow): List<ReleaseScheduleDto> =
        ReleaseRepository.list(conn, business.id).map { toDto(it, business) }

    fun create(conn: Connection, business: BusinessRow, input: ReleaseScheduleInput, actor: Actor, now: Instant): ReleaseScheduleDto {
        ReleaseRepository.lock(conn, business.id)
        val existing = ReleaseRepository.list(conn, business.id)
        if (existing.size >= MAX_SCHEDULES) throw Errors.policy("A business can have at most $MAX_SCHEDULES release schedules.")
        val spec = validated(conn, business, input, existing.map { it.schedule })
        val id = ReleaseRepository.insert(conn, business.id, spec, now)
        Audit.record(conn, business.id, actor, "release_schedule.created", "release_schedule", id, audit(spec))
        return get(conn, business, id)
    }

    /**
     * Replaces a schedule. Days its old timing already opened stay open ([ReleaseCalendar.closedByChange]): changing the
     * time never closes a day people can already book; holding it does that.
     */
    fun update(
        conn: Connection, business: BusinessRow, id: UUID, input: ReleaseScheduleInput, actor: Actor, now: Instant,
    ): ReleaseScheduleDto {
        ReleaseRepository.lock(conn, business.id)
        val existing = ReleaseRepository.list(conn, business.id).map { it.schedule }
        val old = existing.firstOrNull { it.id == id } ?: throw Errors.notFound("Release schedule")
        val spec = validated(conn, business, input, existing.filter { it.id != id })
        if (old.status == ReleaseStatus.ACTIVE && spec.status == ReleaseStatus.ACTIVE && old.timing != spec.timing) {
            keepOpen(conn, business, old, spec.timing, actor, now)
        }
        ReleaseRepository.update(conn, business.id, id, spec, now)
        Audit.record(conn, business.id, actor, "release_schedule.updated", "release_schedule", id, audit(spec))
        return get(conn, business, id)
    }

    fun delete(conn: Connection, business: BusinessRow, id: UUID, actor: Actor) {
        val stored = ReleaseRepository.get(conn, business.id, id) ?: throw Errors.notFound("Release schedule")
        ReleaseRepository.delete(conn, business.id, id)
        Audit.record(conn, business.id, actor, "release_schedule.deleted", "release_schedule", id, mapOf("name" to stored.schedule.name))
    }

    /** Each active schedule's release of every day in [range], with how many free times each will open. */
    fun releases(conn: Connection, business: BusinessRow, range: DateRange, now: Instant, only: UUID? = null): ReleasesDto {
        range.requireValid(MAX_RANGE_DAYS)
        val schedules = ReleaseRepository.list(conn, business.id).map { it.schedule }
            .filter { it.status == ReleaseStatus.ACTIVE && (only == null || it.id == only) }
        val changes = ReleaseRepository.changes(conn, business.id, schedules.map { it.id }.toSet(), range.from, range.to)
            .associateBy { it.change.scheduleId to it.change.date }
        val times = ReleaseTimes.count(conn, business, schedules, range, now)
        val zone = business.zone
        val dates = generateSequence(range.from) { it.plusDays(1) }.takeWhile { !it.isAfter(range.to) }.toList()
        return ReleasesDto(
            business.timezone, range.from.toString(), range.to.toString(),
            schedules.map { s ->
                ScheduleReleasesDto(
                    s.id.toString(), s.name,
                    dates.map { date ->
                        val stored = changes[s.id to date]
                        val scheduled = ReleaseCalendar.scheduledAt(s.timing, date, zone)
                        val opensAt = if (stored != null) stored.change.opensAt else scheduled
                        ReleaseDayDto(
                            date = date.toString(), scheduledAt = formatInstant(scheduled, zone),
                            opensAt = opensAt?.let { formatInstant(it, zone) }, state = state(opensAt, stored != null, now).wire,
                            changed = stored != null, changedBy = stored?.changedBy,
                            changedAt = stored?.changedAt?.let { formatInstant(it, zone) }, times = times[s.id]?.get(date) ?: 0,
                        )
                    },
                )
            },
        )
    }

    /**
     * Opens one release now, moves it or holds it: just [date], or ([ReleaseChangeInput.scope] "release") every day the
     * schedule opens at the same moment as it. Days before today are left alone.
     */
    fun changeRelease(
        conn: Connection, business: BusinessRow, scheduleId: UUID, date: LocalDate, input: ReleaseChangeInput, actor: Actor, now: Instant,
    ): ReleasesDto {
        // Serialised with schedule edits, whose keep-open step must not overwrite a change made meanwhile.
        ReleaseRepository.lock(conn, business.id)
        val schedule = ReleaseRepository.get(conn, business.id, scheduleId)?.schedule ?: throw Errors.notFound("Release schedule")
        val v = Validator()
        val action = v.oneOf(input.action, "action", ReleaseAction.entries.map { it.wire }.toSet()) { ReleaseAction.parse(it) }
        val scope = scope(input.scope, v)
        v.throwIfInvalid()
        val dates = dates(schedule, date, scope, business, now)
        val opensAt = when (action!!) {
            ReleaseAction.OPEN_NOW -> now
            ReleaseAction.HOLD -> null
            ReleaseAction.MOVE -> parseInstant(input.opensAt, "opensAt", business.zone).also {
                val dayEnds = dates.max().plusDays(1).startIn(business.zone)
                if (!it.isBefore(dayEnds)) throw Errors.field("opensAt", "Must be before the day ends")
            }
        }
        ReleaseRepository.putChanges(conn, business.id, scheduleId, dates, opensAt, actor.userId, now)
        Audit.record(
            conn, business.id, actor, "release.${action.wire}", "release_schedule", scheduleId,
            mapOf("dates" to dates.map { it.toString() }, "opensAt" to opensAt?.toString()),
        )
        return releases(conn, business, DateRange(dates.min(), dates.max()), now, only = scheduleId)
    }

    /** Puts [date]'s release (or, with scope "release", every day released with it) back on schedule. */
    fun resetRelease(
        conn: Connection, business: BusinessRow, scheduleId: UUID, date: LocalDate, rawScope: String?, actor: Actor, now: Instant,
    ): ReleasesDto {
        // Serialised with schedule edits, whose keep-open step must not overwrite a change made meanwhile.
        ReleaseRepository.lock(conn, business.id)
        val schedule = ReleaseRepository.get(conn, business.id, scheduleId)?.schedule ?: throw Errors.notFound("Release schedule")
        val v = Validator()
        val scope = scope(rawScope ?: SCOPE_RELEASE, v)
        v.throwIfInvalid()
        val dates = dates(schedule, date, scope, business, now)
        ReleaseRepository.deleteChanges(conn, business.id, scheduleId, dates)
        Audit.record(
            conn, business.id, actor, "release.reset", "release_schedule", scheduleId, mapOf("dates" to dates.map { it.toString() }),
        )
        return releases(conn, business, DateRange(dates.min(), dates.max()), now, only = scheduleId)
    }

    private fun get(conn: Connection, business: BusinessRow, id: UUID): ReleaseScheduleDto =
        toDto(ReleaseRepository.get(conn, business.id, id) ?: throw Errors.notFound("Release schedule"), business)

    private fun keepOpen(conn: Connection, business: BusinessRow, old: ReleaseSchedule, new: ReleaseTiming, actor: Actor, now: Instant) {
        val today = LocalDate.ofInstant(now, business.zone)
        val reach = today.plusDays(ReleaseCalendar.reachDays(old.timing))
        val changed = ReleaseRepository.changes(conn, business.id, setOf(old.id), today, reach).map { it.change.date }.toSet()
        ReleaseCalendar.closedByChange(old.timing, new, changed, business.zone, now).entries.groupBy({ it.value }, { it.key })
            .forEach { (opened, dates) -> ReleaseRepository.putChanges(conn, business.id, old.id, dates, opened, actor.userId, now) }
    }

    /** [date], or every day released with it; today or later only (a field error when that leaves none). */
    private fun dates(schedule: ReleaseSchedule, date: LocalDate, scope: String?, business: BusinessRow, now: Instant): List<LocalDate> {
        val today = LocalDate.ofInstant(now, business.zone)
        val all = if (scope == SCOPE_DAY) listOf(date) else ReleaseCalendar.sameRelease(schedule.timing, date)
        return all.filter { !it.isBefore(today) }.ifEmpty { throw Errors.field("date", "Must be today or later") }
    }

    private fun scope(raw: String, v: Validator): String? = v.oneOf(raw, "scope", setOf(SCOPE_RELEASE, SCOPE_DAY)) { it }

    private fun state(opensAt: Instant?, changed: Boolean, now: Instant): ReleaseState = when {
        opensAt == null -> ReleaseState.HELD
        !opensAt.isAfter(now) -> ReleaseState.OPEN
        changed -> ReleaseState.MOVED
        else -> ReleaseState.SCHEDULED
    }

    /** [input] validated: its services and groups belong to the business, and no other schedule covers the same pair. */
    private fun validated(
        conn: Connection, business: BusinessRow, input: ReleaseScheduleInput, others: List<ReleaseSchedule>,
    ): ScheduleSpec {
        val v = Validator()
        val spec = ReleaseValidation.validate(input, v)
        v.throwIfInvalid()
        // Valid input always yields a spec.
        val s = spec!!
        val services = ServiceRepository.list(conn, business.id, s.serviceIds).associate { UUID.fromString(it.id) to it.name }
        if (services.size != s.serviceIds.size) throw Errors.field("serviceIds", "Unknown service")
        val groups = CustomerGroupRepository.list(conn, business.id).associate { UUID.fromString(it.id) to it.name }
        if (!groups.keys.containsAll(s.groupIds)) throw Errors.field("groupIds", "Unknown customer group")
        overlap(s, others, services, groups)?.let { throw Errors.field("serviceIds", it) }
        return s
    }

    /** Why [spec] can't share a service and customers with one of [others], or null when it doesn't. */
    private fun overlap(
        spec: ScheduleSpec, others: List<ReleaseSchedule>, services: Map<UUID, String>, groups: Map<UUID, String>,
    ): String? {
        for (o in others) {
            val service = spec.serviceIds.firstOrNull { it in o.serviceIds }?.let { services[it] } ?: continue
            val group = (spec.groupIds intersect o.groupIds).firstOrNull()?.let { groups[it] }
            when {
                o.everyone -> return "$service is already in “${o.name}”, which covers everyone"
                spec.everyone -> return "$service is already in “${o.name}” for some groups"
                group != null -> return "$service for $group is already in “${o.name}”"
            }
        }
        return null
    }

    private fun audit(spec: ScheduleSpec) =
        mapOf("name" to spec.name, "status" to spec.status.value, "cadence" to spec.timing.cadence.value)

    private fun toDto(stored: StoredSchedule, business: BusinessRow): ReleaseScheduleDto {
        val s = stored.schedule
        val t = s.timing
        val daily = t.cadence == ReleaseCadence.DAILY
        return ReleaseScheduleDto(
            id = s.id.toString(), name = s.name, serviceIds = s.serviceIds.map { it.toString() }.sorted(), everyone = s.everyone,
            groupIds = s.groupIds.map { it.toString() }.sorted(), cadence = t.cadence.value, time = t.time.toString(),
            daysBefore = t.daysBefore.takeIf { daily }, weekdaysOnly = daily && t.weekdaysOnly, weekday = t.weekday.takeIf { !daily },
            weeksAhead = t.weeksAhead.takeIf { !daily }, status = s.status.value,
            createdAt = formatInstant(stored.createdAt, business.zone), updatedAt = formatInstant(stored.updatedAt, business.zone),
        )
    }

    private const val SCOPE_RELEASE = "release"
    private const val SCOPE_DAY = "day"
}
