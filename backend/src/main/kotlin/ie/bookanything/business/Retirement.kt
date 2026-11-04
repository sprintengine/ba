package ie.bookanything.business

import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import java.sql.Connection
import java.util.UUID

/**
 * Removing a record that history or rules may point at (a resource, a service, a customer group): while anything
 * references it, it is deactivated rather than deleted, so bookings keep their meaning and a restricted audience is
 * never silently dropped. Audited as `<entityType>.deactivated` or `<entityType>.deleted`.
 */
object Retirement {
    /** The two ways a record can be removed. */
    class Actions(val deactivate: () -> Unit, val delete: () -> Unit)

    fun retire(conn: Connection, access: BusinessAccess, entityType: String, id: UUID, inUse: Boolean, actions: Actions) {
        if (inUse) actions.deactivate() else actions.delete()
        val action = if (inUse) "$entityType.deactivated" else "$entityType.deleted"
        Audit.record(conn, access.businessId, access.actor, action, entityType, id)
    }
}
