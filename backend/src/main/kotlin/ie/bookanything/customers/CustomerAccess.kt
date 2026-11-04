package ie.bookanything.customers

import ie.bookanything.auth.BusinessAccess
import ie.bookanything.db.UuidArray
import ie.bookanything.db.exists
import ie.bookanything.http.Errors
import java.sql.Connection
import java.util.UUID

/** A customer the member may see (staff: customers with bookings on their resources, or none yet); 404 otherwise. */
fun visibleCustomer(conn: Connection, access: BusinessAccess, id: UUID): CustomerRow {
    val c = CustomerRepository.get(conn, access.businessId, id)?.takeIf { it.erasedAt == null } ?: throw Errors.notFound("Customer")
    if (access.isStaffOnly && !visibleToStaff(conn, access, id)) throw Errors.notFound("Customer")
    return c
}

/** Whether the member may see customer [id] by [visibleCustomer]'s rule (always, for members who aren't staff-only). */
fun customerVisibleTo(conn: Connection, access: BusinessAccess, id: UUID): Boolean = !access.isStaffOnly || visibleToStaff(conn, access, id)

private fun visibleToStaff(conn: Connection, access: BusinessAccess, id: UUID): Boolean = conn.exists(
    "SELECT 1 FROM customers c WHERE c.business_id = ? AND c.id = ? AND ${CustomerRepository.staffCustomerFilter()}",
    access.businessId, id, UuidArray(access.linkedResourceIds),
)
