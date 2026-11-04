package ie.bookanything.availability

import ie.bookanything.http.Validator

fun validateRules(inputs: List<AvailabilityRuleInput>, v: Validator): List<ValidRule> {
    if (inputs.size > 100) v.error("rules", "At most 100 rules per resource")
    return inputs.mapIndexedNotNull { i, r ->
        val p = "rules[$i]."
        v.range(r.dayOfWeek, "${p}dayOfWeek", 1, java.time.DayOfWeek.SUNDAY.value)
        val start = v.time(r.startTime, "${p}startTime")
        val end = v.time(r.endTime, "${p}endTime")
        if (start != null && end != null && !end.isAfter(start)) v.error("${p}endTime", "Must be after startTime")
        val from = v.date(r.validFrom, "${p}validFrom")
        val until = v.date(r.validUntil, "${p}validUntil")
        if (from != null && until != null && until.isBefore(from)) v.error("${p}validUntil", "Must be on or after validFrom")
        val audience = v.uuids(r.audienceGroupIds, "${p}audienceGroupIds")
        if (start == null || end == null || r.dayOfWeek !in 1..7) {
            null
        } else {
            ValidRule(r.dayOfWeek, start, end, from, until, audience)
        }
    }
}

fun validateOverride(input: AvailabilityOverrideInput, v: Validator, closure: Boolean): ValidOverride? {
    val date = v.date(input.date, "date")
    val start = input.startTime?.let { v.time(it, "startTime") }
    val end = input.endTime?.let { v.time(it, "endTime") }
    if ((input.startTime == null) != (input.endTime == null)) v.error("endTime", "Give both startTime and endTime, or neither")
    if (start != null && end != null && !end.isAfter(start)) v.error("endTime", "Must be after startTime")
    if (input.isAvailable && input.startTime == null) v.error("startTime", "Extra availability needs a start and end time")
    if (closure && input.isAvailable) v.error("isAvailable", "Business closures must have isAvailable=false")
    val reason = v.requireText(input.reason, "reason", 200, required = false)
    return if (date == null) null else ValidOverride(date, input.isAvailable, start, end, reason)
}
