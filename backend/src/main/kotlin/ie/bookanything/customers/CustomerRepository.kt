package ie.bookanything.customers

import ie.bookanything.auth.CurrentUser
import ie.bookanything.booking.BookingStatus
import ie.bookanything.db.instant
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.int
import ie.bookanything.db.likeContains
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidOrNull
import ie.bookanything.http.Errors
import ie.bookanything.http.KeysetCursor
import ie.bookanything.http.formatInstant
import ie.bookanything.http.formatInstantOrNull
import kotlinx.serialization.Serializable
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Serializable
data class CustomerDto(
    val id: String,
    val name: String,
    val email: String?,
    val phone: String?,
    val notes: String?,
    val groupId: String?,
    val hasAccount: Boolean,
    val bookingCount: Int,
    val lastBookingAt: String?,
    val createdAt: String,
)

data class CustomerRow(
    val id: UUID,
    val name: String,
    /** lower(name), as Postgres lower-cases it: the list's order and its cursor. */
    val sortName: String,
    val email: String?,
    val phone: String?,
    val notes: String?,
    val groupId: UUID?,
    val userId: UUID?,
    val bookingCount: Int,
    val lastBookingAt: Instant?,
    val createdAt: Instant,
    val erasedAt: Instant?,
) {
    fun toDto(zone: ZoneId) = CustomerDto(
        id.toString(), name, email, phone, notes, groupId?.toString(), userId != null, bookingCount,
        formatInstantOrNull(lastBookingAt, zone), formatInstant(createdAt, zone),
    )
}

object CustomerRepository {
    /**
     * `last_booking_at` is the last visit: the latest booking that has happened, i.e. has an outcome (confirmed bookings
     * are completed automatically within the hour after they end), never an upcoming one.
     */
    val SELECT = """
        SELECT c.id, c.name, c.sort_name, c.email::text AS email, c.phone, c.notes, c.group_id, c.user_id, c.created_at, c.erased_at,
            (SELECT count(*) FROM bookings b WHERE b.business_id = c.business_id AND b.customer_id = c.id)::int AS booking_count,
            (SELECT max(b.start_at) FROM bookings b WHERE b.business_id = c.business_id AND b.customer_id = c.id
                AND ${BookingStatus.sqlIn("b.status", BookingStatus.HAPPENED)}) AS last_booking_at
        FROM customers c
    """

    fun map(rs: ResultSet) = CustomerRow(
        id = rs.uuid("id"), name = rs.str("name"), sortName = rs.str("sort_name"), email = rs.strOrNull("email"),
        phone = rs.strOrNull("phone"), notes = rs.strOrNull("notes"), groupId = rs.uuidOrNull("group_id"),
        userId = rs.uuidOrNull("user_id"), bookingCount = rs.int("booking_count"), lastBookingAt = rs.instantOrNull("last_booking_at"),
        createdAt = rs.instant("created_at"), erasedAt = rs.instantOrNull("erased_at"),
    )

    fun get(conn: Connection, businessId: UUID, id: UUID): CustomerRow? =
        conn.queryOne("$SELECT WHERE c.business_id = ? AND c.id = ?", businessId, id, map = ::map)

    /** [email] lower-cased, as stored; compared as text so the (business_id, email::text) index serves it under RLS. */
    fun findByEmail(conn: Connection, businessId: UUID, email: String): CustomerRow? =
        conn.queryOne("$SELECT WHERE c.business_id = ? AND c.email::text = ? AND c.erased_at IS NULL", businessId, email, map = ::map)

    fun findByUser(conn: Connection, businessId: UUID, userId: UUID): CustomerRow? = conn.queryOne(
        "$SELECT WHERE c.business_id = ? AND c.user_id = ? AND c.erased_at IS NULL ORDER BY c.created_at LIMIT 1", businessId, userId,
        map = ::map,
    )

    fun insert(
        conn: Connection, businessId: UUID, name: String, email: String?, phone: String?, notes: String?, groupId: UUID?, userId: UUID?,
        now: Instant? = null,
    ): UUID = conn.queryOne(
        """
        INSERT INTO customers (business_id, name, email, phone, notes, group_id, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, now()), COALESCE(?, now())) RETURNING id
        """.trimIndent(),
        businessId, name, email?.lowercase(), phone, notes, groupId, userId, now, now,
    ) { it.uuid("id") }!!

    /**
     * A new customer with [email], or the one that already has it: another booking may have created it since the caller
     * looked (the email is unique per business), and that booking is for the same customer.
     */
    fun insertOrFindByEmail(
        conn: Connection, businessId: UUID, name: String, email: String, phone: String?, notes: String?, groupId: UUID?, userId: UUID?,
        now: Instant? = null,
    ): UUID {
        val inserted = conn.queryOne(
            """
            INSERT INTO customers (business_id, name, email, phone, notes, group_id, user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, now()), COALESCE(?, now()))
            ON CONFLICT (business_id, email) WHERE email IS NOT NULL AND erased_at IS NULL DO NOTHING
            RETURNING id
            """.trimIndent(),
            businessId, name, email.lowercase(), phone, notes, groupId, userId, now, now,
        ) { it.uuid("id") }
        return inserted ?: findByEmail(conn, businessId, email.lowercase())?.id ?: error("Customer with a conflicting email not found")
    }

    /**
     * Customer for a public booking (docs/architecture.md 5.2 step 1): by signed-in user,
     * else by business + email, else a new record. Links the user when their verified email matches.
     * Updates name/phone to the latest details given, but only for the user's own record (never for a guest).
     */
    fun resolveForPublicBooking(
        conn: Connection, businessId: UUID, user: CurrentUser?, name: String, email: String, phone: String?, groupId: UUID?,
        now: Instant? = null,
    ): UUID {
        val normalisedEmail = email.lowercase()
        val byUser = user?.let { findByUser(conn, businessId, it.id) }
        if (byUser != null && (byUser.email == null || byUser.email.equals(normalisedEmail, ignoreCase = true))) {
            conn.update(
                "UPDATE customers SET name = ?, phone = COALESCE(?, phone), email = COALESCE(email, ?), group_id = COALESCE(?, " +
                    "group_id), updated_at = now() WHERE id = ?",
                name, phone, normalisedEmail, groupId, byUser.id,
            )
            return byUser.id
        }
        val byEmail = findByEmail(conn, businessId, normalisedEmail)
        if (byEmail != null) {
            // Anyone can type an email address, so only its verified owner may change the stored details
            // (a stranger's phone number would otherwise receive this customer's reminder SMS and manage links).
            if (user == null || (user.verifiedEmail != normalisedEmail && byEmail.userId != user.id)) return byEmail.id
            val link = byEmail.userId == null
            conn.update(
                "UPDATE customers SET name = ?, phone = COALESCE(?, phone), group_id = COALESCE(?, group_id), user_id = CASE WHEN ? THEN " +
                    "? ELSE user_id END, updated_at = now() WHERE id = ?",
                name, phone, groupId, link, user.id, byEmail.id,
            )
            return byEmail.id
        }
        val linkUser = user?.takeIf { it.verifiedEmail == normalisedEmail }?.id
        return insertOrFindByEmail(conn, businessId, name, normalisedEmail, phone, null, groupId, linkUser, now)
    }

    /** Links all unlinked customer records with this verified email to the user. Returns the count. */
    fun linkByVerifiedEmail(conn: Connection, user: CurrentUser): Int {
        val email = user.verifiedEmail ?: return 0
        return conn.update(
            "UPDATE customers SET user_id = ?, updated_at = now() WHERE email::text = ? AND user_id IS NULL AND erased_at IS NULL",
            user.id, email,
        )
    }

    /** Unlinks a deleted user's account from their customer records (the businesses keep the records). */
    fun unlinkUser(conn: Connection, userId: UUID) {
        conn.update("UPDATE customers SET user_id = NULL, updated_at = now() WHERE user_id = ?", userId)
    }

    /** Writes a customer's details; [unlinkAccount] drops the link to their user account. */
    fun update(conn: Connection, businessId: UUID, id: UUID, details: CustomerDetails, unlinkAccount: Boolean) {
        conn.update(
            "UPDATE customers SET name = ?, email = ?, phone = ?, notes = ?, group_id = ?, user_id = CASE WHEN ? THEN NULL ELSE " +
                "user_id END, updated_at = now() WHERE business_id = ? AND id = ?",
            details.name, details.email, details.phone, details.notes, details.groupId, unlinkAccount, businessId, id,
        )
    }

    fun emailTaken(conn: Connection, businessId: UUID, email: String, exceptId: UUID?): Boolean = conn.queryOne(
        "SELECT 1 FROM customers WHERE business_id = ? AND email::text = ? AND erased_at IS NULL AND (?::uuid IS NULL OR id <> ?::uuid)",
        businessId, email.lowercase(), exceptId, exceptId,
    ) { true } ?: false

    /**
     * GDPR erasure: anonymise personal data on the customer and their bookings (answers, notes and cancellation
     * reasons; see [CustomerCommands.erase] for the history and the email log).
     */
    fun erase(conn: Connection, businessId: UUID, id: UUID) {
        val n = conn.update(
            """
            UPDATE customers SET name = 'Erased customer', email = NULL, phone = NULL, notes = NULL, user_id = NULL,
                marketing_opt_in = false, erased_at = now(), updated_at = now()
            WHERE business_id = ? AND id = ?
            """.trimIndent(),
            businessId, id,
        )
        if (n == 0) throw Errors.notFound("Customer")
        conn.update(
            "UPDATE bookings SET answers = '[]'::jsonb, customer_notes = NULL, cancellation_reason = NULL, manage_token_hash = NULL, " +
                "updated_at = now() WHERE business_id = ? AND customer_id = ?",
            businessId, id,
        )
    }

    /**
     * Customers are listed by `sort_name` (lower(name), stored), then id. The cursor carries the value read from the row,
     * never one lower-cased here: Kotlin and Postgres lower-case some letters differently.
     */
    val CURSOR = KeysetCursor<Pair<String, UUID>>('\u0000', { (name, id) -> listOf(name, id) }, { it[0] to UUID.fromString(it[1]) })

    fun list(
        conn: Connection, businessId: UUID, q: String?, staffResourceIds: Set<UUID>?, after: Pair<String, UUID>?, limit: Int,
    ): List<CustomerRow> {
        val params = mutableListOf<Any?>(businessId)
        val sb = StringBuilder("$SELECT WHERE c.business_id = ? AND c.erased_at IS NULL")
        if (!q.isNullOrBlank()) {
            val like = likeContains(q.trim().lowercase())
            sb.append(" AND (lower(c.name) LIKE ? OR lower(c.email::text) LIKE ? OR c.phone LIKE ?)")
            params.addAll(listOf(like, like, like))
        }
        if (staffResourceIds != null) {
            sb.append(" AND ").append(staffCustomerFilter())
            params += ie.bookanything.db.UuidArray(staffResourceIds)
        }
        if (after != null) {
            sb.append(" AND (c.sort_name, c.id) > (?, ?)")
            params.addAll(listOf(after.first, after.second))
        }
        sb.append(" ORDER BY c.sort_name, c.id LIMIT ?")
        params += limit + 1
        return conn.query(sb.toString(), *params.toTypedArray(), map = ::map)
    }

    /** Staff see customers with bookings on their resources, plus customers with no bookings yet. */
    fun staffCustomerFilter() = """
        (EXISTS (SELECT 1 FROM bookings b JOIN booking_allocations a ON a.booking_id = b.id
                 WHERE b.business_id = c.business_id AND b.customer_id = c.id AND a.resource_id = ANY(?))
         OR NOT EXISTS (SELECT 1 FROM bookings b WHERE b.business_id = c.business_id AND b.customer_id = c.id))
    """.trimIndent()
}
