package ie.bookanything.resources

import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import java.sql.Connection
import java.util.UUID

fun validateResource(input: ResourceInput, v: Validator = Validator()): Validator {
    v.oneOf(input.kind, "kind", RESOURCE_KINDS) { it }
    v.requireText(input.name, "name", 100)
    v.requireText(input.description, "description", 1000, required = false)
    v.color(input.color, "color")
    v.range(input.capacity, "capacity", 1, 1000)
    v.range(input.sortOrder, "sortOrder", -10000, 10000)
    input.memberId?.let { v.uuid(it, "memberId") }
    return v
}

internal fun ResourceInput.normalised() = copy(
    name = name.trim(), description = description?.trim()?.takeIf { it.isNotEmpty() }, color = color.lowercase(),
)

/** A resource may be linked only to a current team member. */
internal fun requireMember(conn: Connection, businessId: UUID, memberId: UUID) {
    if (!ResourceRepository.validMember(conn, businessId, memberId)) throw Errors.field("memberId", "Unknown team member")
}
