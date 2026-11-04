package ie.bookanything.ai.usage

import ie.bookanything.ai.AiCaller
import ie.bookanything.ai.StopReason
import ie.bookanything.ai.TokenUsage
import ie.bookanything.db.instant
import ie.bookanything.db.long
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidOrNull
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

data class UsageRow(val id: UUID, val businessId: UUID?, val status: String, val overageMicroCents: Long, val createdAt: Instant)

data class FeatureTotal(val feature: String, val requests: Int, val microCents: Long)

/** SQL for the `ai_usage` ledger. Callers hold the transaction. */
object AiUsageRepository {
    /** Serialises allowance checks and settlements per business (transaction-scoped advisory lock). */
    fun lock(conn: Connection, businessId: UUID) {
        conn.queryOne("SELECT pg_advisory_xact_lock(hashtextextended('ai_usage:' || ?::text, 0))", businessId) { true }
    }

    fun reserve(
        conn: Connection, caller: AiCaller, model: String, priceVersion: String, estimate: Long, now: Instant,
    ): UUID = conn.queryOne(
        """
        INSERT INTO ai_usage (business_id, user_id, feature, model, status, reserved_micro_cents, price_version, request_id, created_at)
        VALUES (?, ?, ?, ?, 'reserved', ?, ?, ?, ?) RETURNING id
        """.trimIndent(),
        caller.businessId, caller.userId, caller.feature.key, model, estimate, priceVersion, caller.requestId, now,
    ) { it.uuid("id") }!!

    fun settle(
        conn: Connection, id: UUID, usage: TokenUsage, costed: Costed, overage: Long, stopReason: StopReason?, messageId: String?,
        now: Instant,
    ) {
        conn.update(
            """
            UPDATE ai_usage SET status = 'settled', input_tokens = ?, cache_write_tokens = ?, cache_read_tokens = ?, output_tokens = ?,
                cost_micro_cents = ?, overage_micro_cents = ?, price_version = ?, stop_reason = ?, provider_message_id = ?, settled_at = ?
            WHERE id = ?
            """.trimIndent(),
            usage.input, usage.cacheWrite, usage.cacheRead, usage.output, costed.microCents, overage, costed.version,
            stopReason?.key, messageId, now, id,
        )
    }

    /** A call that never reached the provider (nothing billed). */
    fun release(conn: Connection, id: UUID, now: Instant) {
        conn.update("UPDATE ai_usage SET status = 'released', settled_at = ? WHERE id = ? AND status = 'reserved'", now, id)
    }

    /**
     * Settled cost in `[from, to)` plus reservations of calls still in flight (reservations older than [staleBefore]
     * belong to crashed requests and no longer count).
     */
    fun committed(conn: Connection, businessId: UUID, from: Instant, to: Instant, staleBefore: Instant): Committed = conn.queryOne(
        """
        SELECT COALESCE(sum(cost_micro_cents) FILTER (WHERE status = 'settled'), 0) AS settled,
               COALESCE(sum(reserved_micro_cents) FILTER (WHERE status = 'reserved' AND created_at >= ?), 0) AS reserved
        FROM ai_usage WHERE business_id = ? AND created_at >= ? AND created_at < ?
        """.trimIndent(),
        staleBefore, businessId, from, to,
    ) { Committed(it.long("settled"), it.long("reserved")) }!!

    /** Settled cost in `[from, to)` excluding [exceptId] (the call being settled). */
    fun settledExcept(conn: Connection, businessId: UUID, from: Instant, to: Instant, exceptId: UUID): Long = conn.queryOne(
        "SELECT COALESCE(sum(cost_micro_cents), 0) FROM ai_usage WHERE business_id = ? AND status = 'settled' AND created_at >= ? AND " +
            "created_at < ? AND id <> ?",
        businessId, from, to, exceptId,
    ) { it.getLong(1) }!!

    fun get(conn: Connection, id: UUID): UsageRow? = conn.queryOne(
        "SELECT id, business_id, status, overage_micro_cents, created_at FROM ai_usage WHERE id = ?", id,
    ) { UsageRow(it.uuid("id"), it.uuidOrNull("business_id"), it.str("status"), it.long("overage_micro_cents"), it.instant("created_at")) }

    fun markOverageReported(conn: Connection, id: UUID, now: Instant) {
        conn.update("UPDATE ai_usage SET overage_reported_at = ? WHERE id = ?", now, id)
    }

    fun byFeature(conn: Connection, businessId: UUID, from: Instant, to: Instant): List<FeatureTotal> = conn.query(
        """
        SELECT feature, count(*) AS n, COALESCE(sum(cost_micro_cents), 0) AS cost FROM ai_usage
        WHERE business_id = ? AND status = 'settled' AND created_at >= ? AND created_at < ?
        GROUP BY feature ORDER BY feature
        """.trimIndent(),
        businessId, from, to,
    ) { FeatureTotal(it.str("feature"), it.getInt("n"), it.long("cost")) }

    /** Settled cost per local date in the business timezone. */
    fun daily(conn: Connection, businessId: UUID, timezone: String, from: Instant, to: Instant): Map<LocalDate, Long> = conn.query(
        """
        SELECT (created_at AT TIME ZONE ?)::date AS d, COALESCE(sum(cost_micro_cents), 0) AS cost FROM ai_usage
        WHERE business_id = ? AND status = 'settled' AND created_at >= ? AND created_at < ?
        GROUP BY 1
        """.trimIndent(),
        timezone, businessId, from, to,
    ) { it.getObject("d", LocalDate::class.java) to it.long("cost") }.toMap()

    /** Releases reservations left behind by crashed requests. */
    fun releaseStale(conn: Connection, before: Instant, now: Instant): Int =
        conn.update("UPDATE ai_usage SET status = 'released', settled_at = ? WHERE status = 'reserved' AND created_at < ?", now, before)
}
