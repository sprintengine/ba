package ie.bookanything.releases

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * A business's release schedules and the changes to their releases, as availability needs them (pure: loaded once per
 * request, asked per service, customer group and day).
 */
class ReleaseBook(schedules: List<ReleaseSchedule>, changes: List<ReleaseChange>) {
    private val active = schedules.filter { it.status == ReleaseStatus.ACTIVE }
    private val changes: Map<UUID, Map<LocalDate, ReleaseChange>> =
        changes.groupBy { it.scheduleId }.mapValues { (_, list) -> list.associateBy { it.date } }

    val isEmpty: Boolean get() = active.isEmpty()

    /** The active schedules that apply to [serviceId] booked by a customer in [groupId] (see the companion's [covering]). */
    fun covering(serviceId: UUID, groupId: UUID?, restrictedGroupIds: Set<UUID>): List<ReleaseSchedule> =
        covering(active, serviceId, groupId, restrictedGroupIds)

    /** When [schedule] opens [date]: its change's time, null when held, else on schedule. */
    fun opensAt(schedule: ReleaseSchedule, date: LocalDate, zone: ZoneId): Instant? =
        ReleaseCalendar.opensAt(schedule.timing, changes[schedule.id]?.get(date), date, zone)

    /** The change to [schedule]'s release of [date], if someone moved or held it. */
    fun change(schedule: ReleaseSchedule, date: LocalDate): ReleaseChange? = changes[schedule.id]?.get(date)

    /**
     * Whether [date] is still closed to the customer under [schedules] at [now], and until when: the latest opening among
     * them counts (a held day stays closed whatever the others say). Null when it is open (or nothing covers it).
     */
    fun lock(schedules: List<ReleaseSchedule>, date: LocalDate, zone: ZoneId, now: Instant): DayLock? {
        if (schedules.isEmpty()) return null
        val openings = schedules.map { opensAt(it, date, zone) }
        if (openings.any { it == null }) return DayLock(null)
        val latest = openings.filterNotNull().max()
        return if (latest.isAfter(now)) DayLock(latest) else null
    }

    companion object {
        val EMPTY = ReleaseBook(emptyList(), emptyList())

        /**
         * Which of [schedules] apply to [serviceId] booked by a customer in [groupId]: those for everyone, and those
         * naming the customer's group. Unrestricted customers all see the same hours, so one in an unrestricted group no
         * schedule names for the service, or in no group, is covered by every schedule naming an unrestricted group:
         * otherwise picking another group, or none, would get round it. Schedules for restricted groups cover only their
         * own (nobody else can book those hours anyway).
         */
        fun covering(
            schedules: List<ReleaseSchedule>, serviceId: UUID, groupId: UUID?, restrictedGroupIds: Set<UUID>,
        ): List<ReleaseSchedule> {
            val forService = schedules.filter { serviceId in it.serviceIds }
            val everyone = forService.filter { it.everyone }
            val own = forService.filter { !it.everyone && groupId != null && groupId in it.groupIds }
            if (own.isNotEmpty() || (groupId != null && groupId in restrictedGroupIds)) return everyone + own
            return everyone + forService.filter { s -> !s.everyone && s.groupIds.any { it !in restrictedGroupIds } }
        }
    }
}
