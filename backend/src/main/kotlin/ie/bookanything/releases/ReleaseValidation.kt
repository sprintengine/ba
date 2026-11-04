package ie.bookanything.releases

import ie.bookanything.http.Validator

/** Structural validation of [ReleaseScheduleInput] (no database); ownership and overlaps are checked by [ReleaseService]. */
object ReleaseValidation {
    const val MAX_NAME_LENGTH = 80
    const val MAX_SERVICES = 50
    const val MAX_GROUPS = 20

    fun validate(input: ReleaseScheduleInput, v: Validator = Validator()): ScheduleSpec? {
        val name = v.requireText(input.name, "name", MAX_NAME_LENGTH)
        val serviceIds = v.uuids(input.serviceIds, "serviceIds").toSet()
        if (input.serviceIds.isEmpty()) v.error("serviceIds", "Choose at least one service")
        if (input.serviceIds.size > MAX_SERVICES) v.error("serviceIds", "At most $MAX_SERVICES services")
        val groupIds = if (input.everyone) emptySet() else v.uuids(input.groupIds, "groupIds").toSet()
        if (!input.everyone && input.groupIds.isEmpty()) v.error("groupIds", "Choose at least one group, or everyone")
        if (input.groupIds.size > MAX_GROUPS) v.error("groupIds", "At most $MAX_GROUPS groups")
        val timing = timing(input, v)
        if (!v.isValid || name == null || timing == null) return null
        return ScheduleSpec(
            name = name, timing = timing, serviceIds = serviceIds, everyone = input.everyone, groupIds = groupIds,
            status = if (input.active) ReleaseStatus.ACTIVE else ReleaseStatus.PAUSED,
        )
    }

    private fun timing(input: ReleaseScheduleInput, v: Validator): ReleaseTiming? {
        val cadence = v.oneOf(input.cadence, "cadence", setOf("daily", "weekly")) { ReleaseCadence.parse(it) }
        val time = v.time(input.time, "time")
        return when (cadence) {
            ReleaseCadence.DAILY -> {
                if (input.daysBefore == null) v.error("daysBefore", "Required")
                v.range(input.daysBefore, "daysBefore", 0, ReleaseTiming.MAX_DAYS_BEFORE)
                val daysBefore = input.daysBefore?.takeIf { it in 0..ReleaseTiming.MAX_DAYS_BEFORE }
                if (time == null || daysBefore == null) {
                    null
                } else {
                    ReleaseTiming(cadence, time, daysBefore = daysBefore, weekdaysOnly = input.weekdaysOnly)
                }
            }
            ReleaseCadence.WEEKLY -> {
                if (input.weekday == null) v.error("weekday", "Required")
                if (input.weeksAhead == null) v.error("weeksAhead", "Required")
                v.range(input.weekday, "weekday", 1, ReleaseTiming.DAYS_PER_WEEK)
                v.range(input.weeksAhead, "weeksAhead", 1, ReleaseTiming.MAX_WEEKS_AHEAD)
                val weekday = input.weekday?.takeIf { it in 1..ReleaseTiming.DAYS_PER_WEEK }
                val weeksAhead = input.weeksAhead?.takeIf { it in 1..ReleaseTiming.MAX_WEEKS_AHEAD }
                if (time == null || weekday == null || weeksAhead == null) {
                    null
                } else {
                    ReleaseTiming(cadence, time, weekday = weekday, weeksAhead = weeksAhead)
                }
            }
            null -> null
        }
    }
}
