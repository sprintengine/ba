package ie.bookanything.resources

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.business.Retirement
import ie.bookanything.http.Errors
import ie.bookanything.http.Patch
import java.sql.Connection
import java.util.UUID

/** Resource changes (admins; audited with the given actor). */
object ResourceCommands {
    fun create(conn: Connection, access: BusinessAccess, input: ResourceInput, actor: Actor): ResourceDto {
        validateResource(input).throwIfInvalid()
        val memberId = input.memberId?.let(UUID::fromString)
        memberId?.let { requireMember(conn, access.businessId, it) }
        val created = ResourceRepository.insert(conn, access.businessId, input.normalised(), memberId)
        Audit.record(
            conn, access.businessId, actor, "resource.created", "resource", UUID.fromString(created.id), mapOf("name" to created.name),
        )
        return created
    }

    /** Applies [patch] (absent keys keep their value) to the resource. */
    fun update(conn: Connection, access: BusinessAccess, id: UUID, patch: Patch, actor: Actor): ResourceDto {
        val existing = ResourceRepository.get(conn, access.businessId, id) ?: throw Errors.notFound("Resource")
        val merged = merge(existing, patch)
        validateResource(merged).throwIfInvalid()
        val memberId = merged.memberId?.let(UUID::fromString)
        memberId?.let { requireMember(conn, access.businessId, it) }
        val updated = ResourceRepository.update(conn, access.businessId, id, merged.normalised(), memberId)!!
        Audit.record(conn, access.businessId, actor, "resource.updated", "resource", id, mapOf("fields" to patch.keys.toList()))
        return updated
    }

    /** Deletes the resource, or deactivates it while bookings were allocated to it. */
    fun remove(conn: Connection, access: BusinessAccess, id: UUID) {
        ResourceRepository.get(conn, access.businessId, id) ?: throw Errors.notFound("Resource")
        Retirement.retire(
            conn, access, "resource", id, ResourceRepository.hasAllocations(conn, access.businessId, id),
            Retirement.Actions(
                deactivate = { ResourceRepository.deactivate(conn, access.businessId, id) },
                delete = { ResourceRepository.delete(conn, access.businessId, id) },
            ),
        )
    }

    private fun merge(existing: ResourceDto, patch: Patch) = ResourceInput(
        kind = patch.requiredString("kind", existing.kind),
        name = patch.requiredString("name", existing.name),
        description = patch.string("description", existing.description),
        color = patch.requiredString("color", existing.color),
        capacity = patch.int("capacity", existing.capacity),
        memberId = patch.string("memberId", existing.memberId),
        isActive = patch.bool("isActive", existing.isActive),
        sortOrder = patch.int("sortOrder", existing.sortOrder),
    )
}
