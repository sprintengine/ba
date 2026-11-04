package ie.bookanything.services

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.Role
import ie.bookanything.business.Retirement
import ie.bookanything.http.Errors
import java.sql.Connection
import java.util.UUID

/** Service changes shared by the routes and the assistant's tools (admins; audited with the given actor). */
object ServiceCommands {
    fun create(conn: Connection, access: BusinessAccess, input: ServiceInput, actor: Actor): ServiceDto {
        validateService(input).throwIfInvalid()
        ServiceRepository.checkReferences(conn, access.businessId, input)
        val id = ServiceRepository.insert(conn, access.businessId, input)
        Audit.record(conn, access.businessId, actor, "service.created", "service", id, mapOf("name" to input.name))
        return ServiceRepository.get(conn, access.businessId, id)!!
    }

    fun update(conn: Connection, access: BusinessAccess, id: UUID, input: ServiceInput, actor: Actor): ServiceDto {
        access.requireRole(Role.ADMIN)
        validateService(input).throwIfInvalid()
        ServiceRepository.get(conn, access.businessId, id) ?: throw Errors.notFound("Service")
        ServiceRepository.checkReferences(conn, access.businessId, input)
        ServiceRepository.update(conn, access.businessId, id, input)
        Audit.record(conn, access.businessId, actor, "service.updated", "service", id, mapOf("name" to input.name))
        return ServiceRepository.get(conn, access.businessId, id)!!
    }

    /** Deletes the service, or deactivates it while bookings refer to it. */
    fun remove(conn: Connection, access: BusinessAccess, id: UUID) {
        ServiceRepository.get(conn, access.businessId, id) ?: throw Errors.notFound("Service")
        Retirement.retire(
            conn, access, "service", id, ServiceRepository.hasBookings(conn, access.businessId, id),
            Retirement.Actions(
                deactivate = { ServiceRepository.deactivate(conn, access.businessId, id) },
                delete = { ServiceRepository.delete(conn, access.businessId, id) },
            ),
        )
    }
}
