package ie.bookanything.payments

import ie.bookanything.db.Jsonb
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.update
import java.sql.Connection
import java.time.Instant

/** A webhook event as stored: its type, raw JSON payload and whether it has been applied. */
data class StoredProviderEvent(val type: String, val payload: String, val processed: Boolean)

/**
 * `provider_events`: webhook events from Stripe and Clerk, stored once by event id and applied exactly once (the
 * processor locks the row and marks it processed in the same transaction as the effects).
 */
object ProviderEventRepository {
    /** Stores an event once. Returns true when it is new (the caller then enqueues processing in the same transaction). */
    fun store(conn: Connection, id: String, provider: String, type: String, payload: String): Boolean =
        conn.update(
            "INSERT INTO provider_events (id, provider, type, payload) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
            id, provider, type, Jsonb(payload),
        ) == 1

    /** Locks the event for processing (FOR UPDATE); null when it is unknown. */
    fun lock(conn: Connection, id: String): StoredProviderEvent? = conn.queryOne(
        "SELECT type, payload::text AS payload, processed_at IS NOT NULL AS done FROM provider_events WHERE id = ? FOR UPDATE", id,
    ) { StoredProviderEvent(it.str("type"), it.str("payload"), it.getBoolean("done")) }

    /** Marks the event applied (or deliberately ignored) and clears any earlier error. */
    fun markProcessed(conn: Connection, id: String) {
        conn.update("UPDATE provider_events SET processed_at = now(), error = NULL WHERE id = ?", id)
    }

    /**
     * Whether Stripe has told the platform that [subscriptionId] was deleted. A deleted subscription never comes back,
     * so any other event about it is stale (a retry or a late delivery). Billing events are rare: no index needed.
     */
    fun subscriptionDeleted(conn: Connection, subscriptionId: String): Boolean = conn.queryOne(
        """
        SELECT EXISTS (
            SELECT 1 FROM provider_events WHERE provider = 'stripe' AND type = 'customer.subscription.deleted'
              AND payload->>'account' IS NULL AND payload->'data'->'object'->>'id' = ?
        )
        """.trimIndent(),
        subscriptionId,
    ) { it.getBoolean(1) } ?: false

    /**
     * Deletes up to [limit] applied events received before [before] (long past any provider's retries, so their ids are
     * never seen again). Unprocessed events stay, and so do subscription deletions, which [subscriptionDeleted] reads to
     * ignore stale events about a deleted subscription. Returns the count.
     */
    fun purgeProcessed(conn: Connection, before: Instant, limit: Int): Int = conn.update(
        "DELETE FROM provider_events WHERE id IN (SELECT id FROM provider_events WHERE processed_at IS NOT NULL AND received_at < ?" +
            " AND type <> 'customer.subscription.deleted' LIMIT ?)",
        before, limit,
    )

    /** Records why processing failed (the job retries it). */
    fun recordError(conn: Connection, id: String, error: String) {
        conn.update("UPDATE provider_events SET error = ? WHERE id = ?", error, id)
    }
}
