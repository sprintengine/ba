package ie.bookanything.assistant.nudges

import ie.bookanything.db.Jsonb
import ie.bookanything.db.StoredJson
import ie.bookanything.db.TextArray
import ie.bookanything.db.count
import ie.bookanything.db.instant
import ie.bookanything.db.query
import ie.bookanything.db.str
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.http.ApiJson
import kotlinx.serialization.serializer
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/** SQL for nudges and the facts the rules need. */
object NudgeRepository {
    fun upsert(conn: Connection, businessId: UUID, nudge: Nudge, now: Instant) {
        conn.update(
            """
            INSERT INTO assistant_nudges (business_id, key, kind, payload, created_at, refreshed_at) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (business_id, key) DO UPDATE SET payload = EXCLUDED.payload, refreshed_at = EXCLUDED.refreshed_at, resolved_at = NULL
            """.trimIndent(),
            businessId, nudge.key, nudge.kind.key,
            Jsonb(ApiJson.encodeToString(serializer<Nudge>(), nudge)), now, now,
        )
    }

    /** Resolves nudges whose condition no longer holds. */
    fun resolveOthers(conn: Connection, businessId: UUID, keep: List<String>, now: Instant) {
        conn.update(
            "UPDATE assistant_nudges SET resolved_at = ? WHERE business_id = ? AND resolved_at IS NULL AND NOT (key = ANY(?))",
            now, businessId, TextArray(keep),
        )
    }

    fun active(conn: Connection, businessId: UUID): List<NudgeRow> = conn.query(
        "SELECT id, payload::text AS payload, created_at FROM assistant_nudges WHERE business_id = ? AND resolved_at IS NULL AND " +
            "dismissed_at IS NULL ORDER BY created_at, key",
        businessId,
    ) { NudgeRow(it.uuid("id"), StoredJson.decodeFromString(serializer<Nudge>(), it.str("payload")), it.instant("created_at")) }

    fun dismiss(conn: Connection, businessId: UUID, id: UUID, now: Instant): Boolean =
        conn.update(
            "UPDATE assistant_nudges SET dismissed_at = ? WHERE business_id = ? AND id = ? AND dismissed_at IS NULL", now, businessId, id,
        ) > 0

    fun pendingApprovals(conn: Connection, businessId: UUID, now: Instant): Int = conn.count(
        "SELECT count(*) FROM bookings WHERE business_id = ? AND status = 'pending_approval' AND start_at > ?", businessId, now,
    ).toInt()

    /** No-shows among bookings that started between [since] and [until]. */
    fun noShows(conn: Connection, businessId: UUID, since: Instant, until: Instant): Int = conn.count(
        "SELECT count(*) FROM bookings WHERE business_id = ? AND status = 'no_show' AND start_at >= ? AND start_at < ?",
        businessId, since, until,
    ).toInt()

    /** The business has published its site (without reading and decoding the plans). */
    fun sitePublished(conn: Connection, businessId: UUID): Boolean = conn.count(
        "SELECT count(*) FROM business_sites WHERE business_id = ? AND published IS NOT NULL", businessId,
    ) > 0

    /**
     * Active businesses that saw activity since [since]: anything audited (the team's changes, bookings made or
     * cancelled) or a booking created. Each check is one probe of a (business_id, time) index.
     */
    fun recentlyActive(conn: Connection, since: Instant): List<UUID> = conn.query(
        """
        SELECT b.id FROM businesses b WHERE b.status = 'active' AND (
          EXISTS (SELECT 1 FROM audit_events a WHERE a.business_id = b.id AND a.occurred_at > ?)
          OR EXISTS (SELECT 1 FROM bookings k WHERE k.business_id = b.id AND k.created_at > ?)
        ) ORDER BY b.id
        """.trimIndent(),
        since, since,
    ) { it.uuid("id") }

    /** Services (by name) with no-shows since [since] that take no payment before the visit. */
    fun noShowServicesWithoutDeposit(conn: Connection, businessId: UUID, since: Instant, until: Instant): List<String> = conn.query(
        """
        SELECT s.name FROM bookings b JOIN services s ON s.id = b.service_id
        WHERE b.business_id = ? AND b.status = 'no_show' AND b.start_at >= ? AND b.start_at < ? AND s.payment_mode IN ('at_venue', 'free')
        GROUP BY s.name ORDER BY count(*) DESC, s.name
        """.trimIndent(),
        businessId, since, until,
    ) { it.str("name") }
}
