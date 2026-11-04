package ie.bookanything.releases

import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.availability.AvailabilityRequest
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.business.BusinessRow
import ie.bookanything.customers.CustomerGroupRepository
import ie.bookanything.http.DateRange
import ie.bookanything.services.ServiceRepository
import ie.bookanything.services.toDef
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** How many free times each schedule's releases open: what the dashboard shows next to a release. */
object ReleaseTimes {
    /**
     * For each of [schedules] and each day of [range], the distinct start times free for its customers on its public
     * services, under the customer rules but whether the day has opened yet or not. One batched availability read
     * (`computeAll`) covers every schedule.
     */
    fun count(
        conn: Connection, business: BusinessRow, schedules: List<ReleaseSchedule>, range: DateRange, now: Instant,
    ): Map<UUID, Map<LocalDate, Int>> {
        if (schedules.isEmpty()) return emptyMap()
        val services = ServiceRepository.list(conn, business.id, schedules.flatMap { it.serviceIds }.toSet())
            .filter { it.isActive && it.isPublic }.map { it.toDef() }
        val groups = CustomerGroupRepository.list(conn, business.id).filter { it.isActive }
        val activeGroups = groups.map { UUID.fromString(it.id) }

        // The customers a schedule covers, as the groups to ask for (null: no group). Everyone is every group's view
        // too: restricted groups have hours of their own, and a service may be for some groups only.
        fun audiences(s: ReleaseSchedule): List<UUID?> =
            if (s.everyone) listOf<UUID?>(null) + activeGroups else s.groupIds.filter { it in activeGroups }

        val asks = schedules.associate { s ->
            s.id to services.filter { it.id in s.serviceIds }.flatMap { svc -> audiences(s).map { group -> svc to group } }
        }
        val distinct = asks.values.flatten().distinctBy { (svc, group) -> svc.id to group }
        val computed = AvailabilityService.computeAll(
            conn,
            distinct.map { (svc, group) ->
                AvailabilityRequest(
                    business, svc, groupId = group, from = range.from, to = range.to, mode = AvailabilityMode.PUBLIC, ignoreReleases = true,
                )
            },
            now,
        )
        val byAsk = distinct.map { (svc, group) -> svc.id to group }.zip(computed).toMap()
        return asks.mapValues { (_, list) ->
            val days = list.mapNotNull { (svc, group) -> byAsk[svc.id to group] }
            generateSequence(range.from) { it.plusDays(1) }.takeWhile { !it.isAfter(range.to) }
                .associateWith { date -> days.flatMap { it[date].orEmpty() }.map { it.start }.distinct().size }
        }
    }
}
