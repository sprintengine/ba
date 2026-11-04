package ie.bookanything.releases

import kotlinx.serialization.Serializable

/** A schedule as the owner writes it (`POST`/`PUT /release-schedules`). */
@Serializable
data class ReleaseScheduleInput(
    val name: String,
    val serviceIds: List<String>,
    /** True: every customer. False: the customers in [groupIds]. */
    val everyone: Boolean = true,
    val groupIds: List<String> = emptyList(),
    /** "daily" or "weekly". */
    val cadence: String,
    /** "HH:mm" in the business timezone. */
    val time: String,
    /** Daily: open each day this many days before it (0–14). */
    val daysBefore: Int? = null,
    /** Daily: a release that falls on a Saturday or Sunday happens on the Friday before. */
    val weekdaysOnly: Boolean = false,
    /** Weekly: the release day (ISO, Monday = 1). */
    val weekday: Int? = null,
    /** Weekly: how many weeks before a week (Monday to Sunday) it opens (1–4). */
    val weeksAhead: Int? = null,
    val active: Boolean = true,
)

@Serializable
data class ReleaseScheduleDto(
    val id: String,
    val name: String,
    val serviceIds: List<String>,
    val everyone: Boolean,
    val groupIds: List<String>,
    val cadence: String,
    val time: String,
    val daysBefore: Int?,
    val weekdaysOnly: Boolean,
    val weekday: Int?,
    val weeksAhead: Int?,
    /** "active" or "paused". */
    val status: String,
    val createdAt: String,
    val updatedAt: String,
)

/** A change to one release (`PUT /release-schedules/{id}/changes/{date}`). */
@Serializable
data class ReleaseChangeInput(
    /** "open_now", "move" (to [opensAt]) or "hold" (closed until someone opens it). */
    val action: String,
    /** For "move": when it opens, ISO-8601 with offset (or local time in the business timezone). */
    val opensAt: String? = null,
    /** "release": every day the schedule opens at the same moment (a week, a weekend). "day": just this date. */
    val scope: String = "release",
)

/** The releases of each active schedule over a range of days (`GET /releases`). */
@Serializable
data class ReleasesDto(val timezone: String, val from: String, val to: String, val schedules: List<ScheduleReleasesDto>)

@Serializable
data class ScheduleReleasesDto(val scheduleId: String, val name: String, val days: List<ReleaseDayDto>)

@Serializable
data class ReleaseDayDto(
    val date: String,
    /** When the schedule opens this day. */
    val scheduledAt: String,
    /** When it opens with any change applied; null when held. */
    val opensAt: String?,
    /** "open", "scheduled" (not yet, on schedule), "moved" (not yet, at a changed time) or "held". */
    val state: String,
    /** Whether a change moved, held or opened this day early. */
    val changed: Boolean,
    val changedBy: String?,
    val changedAt: String?,
    /** Free times the schedule's services have this day for its customers, whether open yet or not. */
    val times: Int,
)
