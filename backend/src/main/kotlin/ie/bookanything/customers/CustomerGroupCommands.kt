package ie.bookanything.customers

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.business.Retirement
import ie.bookanything.http.Errors
import ie.bookanything.http.Patch
import java.sql.Connection
import java.util.UUID

/** Customer group changes (admins; audited with the given actor). */
object CustomerGroupCommands {
    fun create(conn: Connection, access: BusinessAccess, input: CustomerGroupInput, actor: Actor): CustomerGroupDto {
        validateGroup(input).throwIfInvalid()
        val created = CustomerGroupRepository.insert(conn, access.businessId, input)
        Audit.record(
            conn, access.businessId, actor, "customer_group.created", "customer_group", UUID.fromString(created.id),
            mapOf("name" to created.name),
        )
        return created
    }

    /** Applies [patch] (absent keys keep their value) to the group. */
    fun update(conn: Connection, access: BusinessAccess, id: UUID, patch: Patch, actor: Actor): CustomerGroupDto {
        val g = CustomerGroupRepository.get(conn, access.businessId, id) ?: throw Errors.notFound("Customer group")
        val merged = CustomerGroupInput(
            name = patch.requiredString("name", g.name), description = patch.string("description", g.description),
            restricted = patch.bool("restricted", g.restricted), sortOrder = patch.int("sortOrder", g.sortOrder),
            isActive = patch.bool("isActive", g.isActive),
        )
        validateGroup(merged).throwIfInvalid()
        val updated = CustomerGroupRepository.update(conn, access.businessId, id, merged)!!
        Audit.record(
            conn, access.businessId, actor, "customer_group.updated", "customer_group", id, mapOf("fields" to patch.keys.toList()),
        )
        return updated
    }

    /** Deletes the group, or deactivates it while bookings, hours or services refer to it. */
    fun remove(conn: Connection, access: BusinessAccess, id: UUID) {
        CustomerGroupRepository.get(conn, access.businessId, id) ?: throw Errors.notFound("Customer group")
        Retirement.retire(
            conn, access, "customer_group", id, CustomerGroupRepository.isInUse(conn, access.businessId, id),
            Retirement.Actions(
                deactivate = { CustomerGroupRepository.deactivate(conn, access.businessId, id) },
                delete = { CustomerGroupRepository.delete(conn, access.businessId, id) },
            ),
        )
    }
}
