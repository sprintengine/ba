package ie.bookanything.customers

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.booking.BookingDto
import ie.bookanything.booking.BookingRepository
import ie.bookanything.booking.StaffScope
import ie.bookanything.db.UuidArray
import ie.bookanything.http.Errors
import ie.bookanything.http.Patch
import ie.bookanything.http.formatInstant
import ie.bookanything.notifications.NotificationRepository
import ie.bookanything.notifications.inbox.InboxRepository
import ie.bookanything.reports.AuditRepository
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/**
 * The dashboard's customer commands and queries. Each runs in the caller's (tenant-scoped) transaction, limits staff
 * to customers of their own calendar ([visibleCustomer]) and records the audit event as the acting member (or, for a
 * confirmed assistant proposal, as `ai` acting for them).
 */
object CustomerCommands {
    fun detail(conn: Connection, access: BusinessAccess, id: UUID): CustomerDetailDto {
        val c = visibleCustomer(conn, access, id).toDto(access.business.zone)
        return CustomerDetailDto(
            c.id, c.name, c.email, c.phone, c.notes, c.groupId, c.hasAccount, c.bookingCount, c.lastBookingAt, c.createdAt,
            bookings(conn, access, id),
        )
    }

    fun create(conn: Connection, access: BusinessAccess, details: CustomerDetails, now: Instant, actor: Actor = access.actor): CustomerRow {
        requireUniqueEmail(conn, access, details.email, exceptId = null)
        details.groupId?.let { requireActiveGroup(conn, access, it) }
        val id = CustomerRepository.insert(
            conn, access.businessId, details.name, details.email, details.phone, details.notes, details.groupId, null, now,
        )
        Audit.record(conn, access.businessId, actor, "customer.created", "customer", id)
        return CustomerRepository.get(conn, access.businessId, id)!!
    }

    /** `PATCH /customers/{id}`. Changing the email of an account-linked customer unlinks the account. */
    fun update(conn: Connection, access: BusinessAccess, id: UUID, patch: Patch, actor: Actor = access.actor): CustomerRow {
        val c = visibleCustomer(conn, access, id)
        val details = CustomerDetails.from(
            CustomerInput(
                name = patch.requiredString("name", c.name), email = patch.string("email", c.email),
                phone = patch.string("phone", c.phone), notes = patch.string("notes", c.notes),
                groupId = patch.string("groupId", c.groupId?.toString()),
            ),
        )
        requireUniqueEmail(conn, access, details.email, exceptId = id)
        details.groupId?.takeIf { it != c.groupId }?.let { requireActiveGroup(conn, access, it) }
        CustomerRepository.update(conn, access.businessId, id, details, unlinkAccount = c.userId != null && details.email != c.email)
        Audit.record(conn, access.businessId, actor, "customer.updated", "customer", id, mapOf("fields" to patch.keys.toList()))
        return CustomerRepository.get(conn, access.businessId, id)!!
    }

    /** GDPR erasure: the customer record and their bookings ([CustomerRepository.erase]), their bookings' history and the email log. */
    fun erase(conn: Connection, access: BusinessAccess, id: UUID) {
        val c = visibleCustomer(conn, access, id)
        CustomerRepository.erase(conn, access.businessId, id)
        AuditRepository.eraseCustomerDetails(conn, access.businessId, id)
        NotificationRepository.eraseCustomer(conn, access.businessId, c.email, c.name)
        InboxRepository.forgetCustomer(conn, access.businessId, id, c.name)
        Audit.record(conn, access.businessId, access.actor, "customer.erased", "customer", id)
    }

    /** Everything we hold about a customer (GDPR access request); audited. */
    fun export(conn: Connection, access: BusinessAccess, id: UUID, now: Instant): CustomerExport {
        val c = visibleCustomer(conn, access, id)
        Audit.record(conn, access.businessId, access.actor, "customer.exported", "customer", id)
        return CustomerExport(
            formatInstant(now, access.business.zone), access.business.name, c.toDto(access.business.zone), bookings(conn, access, id),
        )
    }

    /** The customer's bookings, newest first; staff see only those on their own resources. */
    private fun bookings(conn: Connection, access: BusinessAccess, customerId: UUID): List<BookingDto> {
        val where = StringBuilder("b.business_id = ? AND b.customer_id = ? AND b.status <> 'expired'")
        val params = mutableListOf<Any?>(access.businessId, customerId)
        if (access.isStaffOnly) {
            where.append(" AND ${StaffScope.ON_RESOURCES_SQL}")
            params += UuidArray(access.linkedResourceIds)
        }
        return BookingRepository.load(conn, where.toString(), *params.toTypedArray(), suffix = "ORDER BY b.start_at DESC, b.id")
            .map { BookingRepository.toDto(it, access.business) }
    }

    private fun requireUniqueEmail(conn: Connection, access: BusinessAccess, email: String?, exceptId: UUID?) {
        if (email != null && CustomerRepository.emailTaken(conn, access.businessId, email, exceptId)) {
            throw Errors.conflict("A customer with this email already exists.")
        }
    }

    private fun requireActiveGroup(conn: Connection, access: BusinessAccess, groupId: UUID) {
        if (!CustomerGroupRepository.activeExists(conn, access.businessId, groupId)) throw Errors.field("groupId", "Unknown customer group")
    }
}
