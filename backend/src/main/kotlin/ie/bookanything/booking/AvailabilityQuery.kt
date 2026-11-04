package ie.bookanything.booking

import ie.bookanything.http.DateRange
import java.time.Instant
import java.util.UUID

/** What a customer asks free times for: a service with its option and add-ons, their customer group and preferred resource. */
data class AvailabilityQuery(
    val serviceId: UUID,
    val range: DateRange,
    val optionId: UUID? = null,
    val addonIds: List<UUID> = emptyList(),
    val groupId: UUID? = null,
    /** The customer's choice for the service's customer-selectable requirement. */
    val resourceId: UUID? = null,
    /** Only times starting after this (the last one shown), to step forward. */
    val after: Instant? = null,
)
