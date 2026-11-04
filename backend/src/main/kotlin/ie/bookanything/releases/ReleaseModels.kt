package ie.bookanything.releases

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

/** How a schedule opens days: one day at a time, or a week (Monday to Sunday) at a time. */
enum class ReleaseCadence {
    DAILY, WEEKLY;

    val value: String get() = name.lowercase()

    companion object {
        fun parse(raw: String) = valueOf(raw.uppercase())
    }
}

enum class ReleaseStatus {
    ACTIVE, PAUSED;

    val value: String get() = name.lowercase()

    companion object {
        fun parse(raw: String) = valueOf(raw.uppercase())
    }
}

/**
 * When a schedule opens a day, in the business timezone. [DAILY][ReleaseCadence.DAILY]: [daysBefore] days before it at
 * [time], moved back to the Friday before when that falls on a weekend and [weekdaysOnly]. [WEEKLY][ReleaseCadence.WEEKLY]:
 * on [weekday] (ISO, Monday = 1) of the week [weeksAhead] weeks before the day's week, at [time].
 */
data class ReleaseTiming(
    val cadence: ReleaseCadence,
    val time: LocalTime,
    val daysBefore: Int = 0,
    val weekdaysOnly: Boolean = false,
    val weekday: Int = 1,
    val weeksAhead: Int = 1,
) {
    init {
        require(daysBefore in 0..MAX_DAYS_BEFORE) { "daysBefore must be 0..$MAX_DAYS_BEFORE" }
        require(weekday in 1..DAYS_PER_WEEK) { "weekday must be 1..7" }
        require(weeksAhead in 1..MAX_WEEKS_AHEAD) { "weeksAhead must be 1..$MAX_WEEKS_AHEAD" }
    }

    companion object {
        const val MAX_DAYS_BEFORE = 14
        const val MAX_WEEKS_AHEAD = 4
        const val DAYS_PER_WEEK = 7
    }
}

/** A release schedule: its timing and what it covers (services, and everyone or some customer groups). */
data class ReleaseSchedule(
    val id: UUID,
    val name: String,
    val timing: ReleaseTiming,
    val serviceIds: Set<UUID>,
    val everyone: Boolean,
    val groupIds: Set<UUID>,
    val status: ReleaseStatus,
)

/** One day's release moved by hand: it opens at [opensAt] instead of the schedule's time, or is held ([opensAt] null). */
data class ReleaseChange(val scheduleId: UUID, val date: LocalDate, val opensAt: Instant?)

/** A day a release keeps closed to customers that would otherwise have times: it opens at [opensAt], or is held (null). */
data class DayLock(val opensAt: Instant?)

/** What a change does to a release. */
enum class ReleaseAction(val wire: String) {
    OPEN_NOW("open_now"), MOVE("move"), HOLD("hold");

    companion object {
        fun parse(raw: String) = entries.first { it.wire == raw }
    }
}

/** Where a day's release stands for the dashboard. */
enum class ReleaseState(val wire: String) { OPEN("open"), SCHEDULED("scheduled"), MOVED("moved"), HELD("held") }
