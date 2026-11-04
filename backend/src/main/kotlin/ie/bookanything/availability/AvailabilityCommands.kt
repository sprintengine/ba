package ie.bookanything.availability

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.Role
import ie.bookanything.http.Errors
import ie.bookanything.resources.ResourceRepository
import io.ktor.server.routing.get
import java.sql.Connection
import java.util.UUID

/**
 * Availability changes shared by the settings routes and the assistant's tools. They run in the caller's transaction,
 * check the member's scope (staff: only their own resources; business closures: admins) and audit with [Actor].
 */
object AvailabilityCommands {
    fun requireResource(conn: Connection, access: BusinessAccess, resourceId: UUID) {
        access.requireResource(resourceId)
        ResourceRepository.get(conn, access.businessId, resourceId) ?: throw Errors.notFound("Resource")
    }

    fun replaceRules(
        conn: Connection, access: BusinessAccess, resourceId: UUID, rules: List<ValidRule>, actor: Actor,
    ): List<AvailabilityRuleDto> {
        requireResource(conn, access, resourceId)
        val groups = rules.flatMap { it.audience }.toSet()
        val valid = AvailabilityRepository.validGroupIds(conn, access.businessId, groups)
        if (valid.size != groups.size) throw Errors.field("rules", "Unknown customer group in audienceGroupIds")
        AvailabilityRepository.replaceRules(conn, access.businessId, resourceId, rules)
        Audit.record(conn, access.businessId, actor, "availability.rules_replaced", "resource", resourceId, mapOf("count" to rules.size))
        return AvailabilityRepository.rules(conn, access.businessId, resourceId)
    }

    fun addOverride(conn: Connection, access: BusinessAccess, resourceId: UUID, o: ValidOverride, actor: Actor): AvailabilityOverrideDto {
        requireResource(conn, access, resourceId)
        return AvailabilityRepository.insertOverride(conn, access.businessId, resourceId, o).also {
            Audit.record(
                conn, access.businessId, actor, "availability.override_created", "resource", resourceId,
                mapOf("date" to it.date, "isAvailable" to it.isAvailable),
            )
        }
    }

    fun addClosure(conn: Connection, access: BusinessAccess, o: ValidOverride, actor: Actor): AvailabilityOverrideDto {
        access.requireRole(Role.ADMIN)
        return AvailabilityRepository.insertOverride(conn, access.businessId, null, o).also {
            Audit.record(
                conn, access.businessId, actor, "availability.closure_created", "override", UUID.fromString(it.id),
                mapOf("date" to it.date),
            )
        }
    }

    /** Deletes a resource override (staff: their own resources) or a business closure (admins). */
    fun deleteOverride(conn: Connection, access: BusinessAccess, id: UUID, actor: Actor) {
        val ref = AvailabilityRepository.overrideRef(conn, access.businessId, id) ?: throw Errors.notFound("Override")
        if (ref.resourceId == null) access.requireRole(Role.ADMIN) else access.requireResource(ref.resourceId)
        AvailabilityRepository.deleteOverride(conn, access.businessId, id)
        Audit.record(conn, access.businessId, actor, "availability.override_deleted", "override", id)
    }
}
