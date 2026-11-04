package ie.bookanything.notifications

import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.update
import java.sql.Connection
import java.util.UUID

/** The SQL behind notifications: what an email needs that isn't on the booking, and the email log. */
object NotificationRepository {
    private const val ERASED = "Erased customer"

    fun memberRole(conn: Connection, memberId: UUID): String? =
        conn.queryOne("SELECT role::text AS role FROM business_members WHERE id = ?", memberId) { it.str("role") }

    fun serviceLocationType(conn: Connection, businessId: UUID, serviceId: UUID): String? = conn.queryOne(
        "SELECT location_type::text AS t FROM services WHERE business_id = ? AND id = ?", businessId, serviceId,
    ) { it.str("t") }

    /** The checkout link of the booking's latest pending charge. */
    fun pendingCheckoutUrl(conn: Connection, businessId: UUID, bookingId: UUID): String? = conn.queryOne(
        "SELECT checkout_url FROM payments WHERE business_id = ? AND booking_id = ? AND kind = 'charge' AND status = " +
            "'pending' AND checkout_url IS NOT NULL ORDER BY created_at DESC LIMIT 1",
        businessId, bookingId,
    ) { it.str("checkout_url") }

    /** Email addresses of the business's active owners. */
    fun ownerEmails(conn: Connection, businessId: UUID): List<String> = conn.query(
        """
        SELECT u.email::text AS email FROM business_members m JOIN users u ON u.id = m.user_id
        WHERE m.business_id = ? AND m.status = 'active' AND m.role = 'owner' AND u.email IS NOT NULL
        """.trimIndent(),
        businessId,
    ) { it.str("email") }

    /**
     * GDPR erasure: the email log forgets an erased customer: emails to [email] keep their template and status but not
     * the address, and the business's "new booking" subjects no longer name them ([name] as it was at erasure).
     */
    fun eraseCustomer(conn: Connection, businessId: UUID, email: String?, name: String) {
        if (email != null) {
            conn.update(
                "UPDATE email_log SET to_address = ? WHERE business_id = ? AND lower(to_address) = lower(?)", ERASED, businessId, email,
            )
        }
        conn.update(
            "UPDATE email_log SET subject = replace(subject, ?, ?) WHERE business_id = ? AND template = ? AND strpos(subject, ?) > 0",
            ": $name, ", ": $ERASED, ", businessId, EmailTemplates.NEW_BOOKING_FOR_BUSINESS, ": $name, ",
        )
        // The team's notification emails name them too ("Jordan Byrne cancelled").
        conn.update(
            "UPDATE email_log SET subject = replace(subject, ?, ?) WHERE business_id = ? AND template = ? AND strpos(subject, ?) > 0",
            name, ERASED, businessId, EmailTemplates.NOTIFICATION, name,
        )
    }

    fun logEmail(conn: Connection, businessId: UUID?, m: EmailMessage, result: SendResult) {
        conn.update(
            "INSERT INTO email_log (business_id, to_address, subject, template, status, provider_ref) VALUES (?, ?, ?, ?, ?, ?)",
            businessId, m.to, m.subject, m.template, result.status, result.providerRef,
        )
    }
}
