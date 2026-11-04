package ie.bookanything.offers

import ie.bookanything.http.Validator
import java.util.UUID

/** A validated offer, ready to store (no id yet). */
data class OfferSpec(
    val name: String,
    val description: String?,
    val serviceIds: Set<UUID>,
    val discount: Discount,
    val schedule: OfferSchedule,
    val maxRedemptions: Int?,
    val status: OfferStatus,
) {
    fun toRule(id: UUID, createdAt: java.time.Instant) = OfferRule(
        id, name, serviceIds, discount, schedule, maxRedemptions, status, createdAt,
    )
}

/** Structural validation of [OfferInput] (no database); service ownership is checked by [OfferService]. */
object OfferValidation {
    const val MAX_WINDOWS = 6
    const val MAX_SERVICES = 50
    const val MAX_FIXED_CENTS = 1_000_000

    fun validate(input: OfferInput, v: Validator = Validator()): OfferSpec? {
        val name = v.requireText(input.name, "name", MAX_NAME_LENGTH)
        val description = v.requireText(input.description, "description", MAX_DESCRIPTION_LENGTH, required = false)
        val serviceIds = v.uuids(input.serviceIds, "serviceIds").toSet()
        if (input.serviceIds.isEmpty()) v.error("serviceIds", "Choose at least one service")
        if (input.serviceIds.size > MAX_SERVICES) v.error("serviceIds", "At most $MAX_SERVICES services")
        val discount = discount(input.discount, v)
        val schedule = schedule(input, v)
        v.range(input.maxRedemptions, "maxRedemptions", 1, MAX_REDEMPTIONS)

        if (!v.isValid || name == null || discount == null) return null
        return OfferSpec(
            name = name, description = description, serviceIds = serviceIds, discount = discount, schedule = schedule,
            maxRedemptions = input.maxRedemptions, status = if (input.active) OfferStatus.ACTIVE else OfferStatus.PAUSED,
        )
    }

    /** A percentage of 1 to 100, or a fixed amount of more than 0 (up to [MAX_FIXED_CENTS]); null with a field error otherwise. */
    fun discount(d: DiscountDto, v: Validator): Discount? = when (d) {
        is DiscountDto.Percent -> if (d.percent in 1..PERCENT_MAX) {
            Discount.Percent(d.percent)
        } else {
            null.also { v.error("discount.percent", "Must be between 1 and 100") }
        }
        is DiscountDto.Fixed -> if (d.amountCents in 1..MAX_FIXED_CENTS) {
            Discount.Fixed(d.amountCents)
        } else {
            null.also { v.error("discount.amountCents", "Must be more than 0") }
        }
    }

    /** Days, time windows (sorted, not overlapping), the last-minute horizon and the validity dates. */
    private fun schedule(input: OfferInput, v: Validator): OfferSchedule {
        val s = input.schedule
        s.daysOfWeek.forEachIndexed { i, d ->
            if (d !in 1..DAYS_IN_WEEK) v.error("schedule.daysOfWeek[$i]", "Must be 1 (Monday) to 7 (Sunday)")
        }
        if (s.daysOfWeek.size != s.daysOfWeek.distinct().size) v.error("schedule.daysOfWeek", "Each day only once")
        if (s.timeWindows.size > MAX_WINDOWS) v.error("schedule.timeWindows", "At most $MAX_WINDOWS time windows")
        val windows = s.timeWindows.mapIndexedNotNull { i, w -> timeWindow(w, "schedule.timeWindows[$i]", v) }.sortedBy { it.start }
        windows.zipWithNext().forEach { (a, b) ->
            if (b.start.isBefore(a.end)) v.error("schedule.timeWindows", "Time windows must not overlap")
        }
        v.range(s.lastMinuteHours, "schedule.lastMinuteHours", 1, MAX_LAST_MINUTE_HOURS)
        val validFrom = v.date(input.validFrom, "validFrom")
        val validUntil = v.date(input.validUntil, "validUntil")
        if (validFrom != null && validUntil != null && validUntil.isBefore(validFrom)) {
            v.error("validUntil", "Must be on or after the start date")
        }
        return OfferSchedule(s.daysOfWeek.toSet(), windows, s.lastMinuteHours, validFrom, validUntil)
    }

    /** One time window; it must end after it starts. */
    private fun timeWindow(w: TimeWindowDto, field: String, v: Validator): TimeWindow? {
        val start = v.time(w.start, "$field.start")
        val end = v.time(w.end, "$field.end")
        return when {
            start == null || end == null -> null
            !end.isAfter(start) -> null.also { v.error("$field.end", "Must be after the start") }
            else -> TimeWindow(start, end)
        }
    }
}

/** A last-minute deal can reach at most a week ahead. */
private const val MAX_LAST_MINUTE_HOURS = 24 * 7
private const val MAX_REDEMPTIONS = 100_000
private const val MAX_NAME_LENGTH = 80
private const val MAX_DESCRIPTION_LENGTH = 300
private const val PERCENT_MAX = 100
private const val DAYS_IN_WEEK = 7
