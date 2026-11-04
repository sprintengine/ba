package ie.bookanything.reports

import ie.bookanything.audit.ActorType
import ie.bookanything.booking.AuditEventDto
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.instant
import ie.bookanything.db.json
import ie.bookanything.db.query
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.http.formatInstant
import kotlinx.serialization.json.JsonObject
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

/** The audit log of a business: one entity's history, and the keyset-paginated log (newest first). */
object AuditRepository {
    private fun map(rs: ResultSet, business: BusinessRow) = AuditEventDto(
        id = rs.uuid("id").toString(), actorType = ActorType.parse(rs.str("actor_type")), actorName = rs.strOrNull("actor_name"),
        action = rs.str("action"), entityType = rs.str("entity_type"), entityId = rs.uuid("entity_id").toString(),
        summary = rs.json("summary") as? JsonObject ?: JsonObject(emptyMap()),
        occurredAt = formatInstant(rs.instant("occurred_at"), business.zone),
    )

    private const val SELECT = """
        SELECT e.id, e.actor_type::text AS actor_type, u.name AS actor_name, e.action, e.entity_type, e.entity_id,
            e.summary::text AS summary, e.occurred_at
        FROM audit_events e LEFT JOIN users u ON u.id = e.actor_user_id
    """

    /**
     * GDPR erasure: drops what the history of a customer's bookings says about them in free text or addresses: the
     * reasons given for cancelling or declining, and where payment links were sent. Every other fact stays.
     */
    fun eraseCustomerDetails(conn: Connection, businessId: UUID, customerId: UUID) {
        conn.update(
            """
            UPDATE audit_events SET summary = summary - 'reason' - 'to'
            WHERE business_id = ? AND entity_type = 'booking'
              AND action IN ('booking.cancelled', 'booking.declined', 'booking.payment_link_sent')
              AND entity_id IN (SELECT id FROM bookings WHERE business_id = ? AND customer_id = ?)
            """.trimIndent(),
            businessId, businessId, customerId,
        )
    }

    fun forEntity(conn: Connection, business: BusinessRow, entityId: UUID): List<AuditEventDto> = conn.query(
        "$SELECT WHERE e.business_id = ? AND e.entity_id = ? ORDER BY e.occurred_at, e.id", business.id, entityId,
    ) { map(it, business) }

    fun page(
        conn: Connection, business: BusinessRow, entityId: UUID?, before: Pair<Instant, UUID>?,
        limit: Int,
    ): List<Pair<AuditEventDto, Pair<Instant, UUID>>> {
        val params = mutableListOf<Any?>(business.id)
        val sb = StringBuilder("$SELECT WHERE e.business_id = ?")
        entityId?.let { sb.append(" AND e.entity_id = ?"); params += it }
        before?.let { sb.append(" AND (e.occurred_at, e.id) < (?, ?)"); params.addAll(listOf(it.first, it.second)) }
        sb.append(" ORDER BY e.occurred_at DESC, e.id DESC LIMIT ?")
        params += limit + 1
        return conn.query(sb.toString(), *params.toTypedArray()) { map(it, business) to (it.instant("occurred_at") to it.uuid("id")) }
    }
}
