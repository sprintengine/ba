package ie.bookanything.availability

import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

@Serializable
data class AvailabilityRuleDto(
    val id: String,
    val resourceId: String,
    val dayOfWeek: Int,
    val startTime: String,
    val endTime: String,
    val validFrom: String?,
    val validUntil: String?,
    val audienceGroupIds: List<String>,
)

@Serializable
data class AvailabilityRuleInput(
    val dayOfWeek: Int,
    val startTime: String,
    val endTime: String,
    val validFrom: String? = null,
    val validUntil: String? = null,
    val audienceGroupIds: List<String> = emptyList(),
)

@Serializable
data class ReplaceRulesInput(val rules: List<AvailabilityRuleInput>)

@Serializable
data class RulesResponse(val rules: List<AvailabilityRuleDto>)

@Serializable
data class AvailabilityOverrideDto(
    val id: String,
    val resourceId: String?,
    val date: String,
    val isAvailable: Boolean,
    val startTime: String?,
    val endTime: String?,
    val reason: String?,
)

@Serializable
data class AvailabilityOverrideInput(
    val date: String,
    val isAvailable: Boolean,
    val startTime: String? = null,
    val endTime: String? = null,
    val reason: String? = null,
)

@Serializable
data class ResourceAvailability(val rules: List<AvailabilityRuleDto>, val overrides: List<AvailabilityOverrideDto>)

/** Parsed and validated rule. */
data class ValidRule(
    val dayOfWeek: Int, val start: LocalTime, val end: LocalTime, val validFrom: LocalDate?, val validUntil: LocalDate?,
    val audience: List<UUID>,
)
data class ValidOverride(val date: LocalDate, val isAvailable: Boolean, val start: LocalTime?, val end: LocalTime?, val reason: String?)

/** The resource an override belongs to; null for a business-wide closure. */
data class OverrideRef(val resourceId: UUID?)
