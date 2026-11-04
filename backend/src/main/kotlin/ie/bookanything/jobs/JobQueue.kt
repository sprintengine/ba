package ie.bookanything.jobs

import ie.bookanything.db.Jsonb
import ie.bookanything.db.instant
import ie.bookanything.db.int
import ie.bookanything.db.json
import ie.bookanything.db.long
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import kotlinx.serialization.json.JsonObject
import java.sql.Connection
import java.sql.ResultSet
import java.time.Duration
import java.time.Instant
import java.util.UUID

data class Job(val id: UUID, val kind: String, val payload: JsonObject, val attempts: Int, val maxAttempts: Int)

/** The jobs of one [kind] that are due and waiting: how many, and how long the oldest has been due. */
data class QueueBacklog(val kind: String, val due: Long, val oldestDue: Duration)

/**
 * Postgres-backed job queue. Enqueue inside the caller's transaction (transactional outbox):
 * a job exists if and only if the business change that produced it committed.
 */
object JobQueue {
    /**
     * Queues a job due at [runAt] (now when null), or [delay] after the database's now (a backstop for a job the caller
     * runs straight after commit with [claimById]). Returns its id.
     */
    fun enqueue(
        conn: Connection, kind: String, payload: JsonObject, runAt: Instant? = null, maxAttempts: Int = 8, delay: Duration = Duration.ZERO,
    ): UUID = conn.queryOne(
        "INSERT INTO jobs (kind, payload, run_at, max_attempts) VALUES (?, ?, COALESCE(?, now()) + make_interval(secs => ?), ?) " +
            "RETURNING id",
        kind, Jsonb(payload), runAt, delay.seconds.toInt(), maxAttempts,
    ) { it.uuid("id") }!!

    /** Claims one job by id whether or not it is due yet (null when it is gone, running or finished). */
    fun claimById(conn: Connection, id: UUID, workerId: String): Job? = conn.queryOne(
        """
        UPDATE jobs SET status = 'running', locked_at = now(), locked_by = ?, attempts = attempts + 1
        WHERE id = ? AND status = 'pending'
        RETURNING id, kind, payload::text AS payload, attempts, max_attempts
        """.trimIndent(),
        workerId, id,
        map = ::job,
    )

    private fun job(rs: ResultSet) = Job(
        rs.uuid("id"), rs.str("kind"), rs.json("payload") as? JsonObject ?: JsonObject(emptyMap()), rs.int("attempts"),
        rs.int("max_attempts"),
    )

    /** Replaces a running job's payload (a handler recording that part of its work is done, for the next attempt). */
    fun setPayload(conn: Connection, id: UUID, payload: JsonObject) {
        conn.update("UPDATE jobs SET payload = ? WHERE id = ?", Jsonb(payload), id)
    }

    /** Claims up to [limit] due jobs. Safe with many workers (FOR UPDATE SKIP LOCKED). */
    fun claim(conn: Connection, workerId: String, limit: Int): List<Job> = conn.query(
        """
        UPDATE jobs SET status = 'running', locked_at = now(), locked_by = ?, attempts = attempts + 1
        WHERE id IN (
            SELECT id FROM jobs WHERE status = 'pending' AND run_at <= now()
            ORDER BY run_at LIMIT ? FOR UPDATE SKIP LOCKED
        )
        RETURNING id, kind, payload::text AS payload, attempts, max_attempts, run_at, created_at
        """.trimIndent(),
        workerId, limit,
    ) {
        Triple(it.instant("run_at"), it.instant("created_at"), job(it))
    }.sortedWith(compareBy({ it.first }, { it.second })).map { it.third }

    fun complete(conn: Connection, id: UUID) {
        conn.update("UPDATE jobs SET status = 'done', locked_at = NULL, last_error = NULL WHERE id = ?", id)
    }

    /**
     * Exponential backoff: 10s, 20s, 40s … capped at 1 hour; failed after max_attempts. Returns true when the job failed
     * for good (nothing will retry it).
     */
    fun fail(conn: Connection, job: Job, error: String): Boolean {
        val delaySeconds = minOf(3600L, 10L * (1L shl minOf(job.attempts - 1, 16)))
        return conn.queryOne(
            """
            UPDATE jobs SET status = CASE WHEN attempts >= max_attempts THEN 'failed'::job_status ELSE 'pending'::job_status END,
                run_at = now() + make_interval(secs => ?), locked_at = NULL, locked_by = NULL, last_error = ?
            WHERE id = ?
            RETURNING status = 'failed' AS final
            """.trimIndent(),
            delaySeconds.toInt(), error.take(MAX_ERROR_LENGTH), job.id,
        ) { it.getBoolean("final") } ?: false
    }

    /** Returns jobs stuck in `running` (crashed worker) to the queue. */
    fun recoverStuck(conn: Connection, olderThanMinutes: Int = 10): Int = conn.update(
        "UPDATE jobs SET status = 'pending', locked_at = NULL, locked_by = NULL WHERE status = 'running' AND locked_at < now() - " +
            "make_interval(mins => ?)",
        olderThanMinutes,
    )

    /** Deletes up to [limit] jobs that failed for good and were created before [before]. Returns the count. */
    fun purgeFailed(conn: Connection, before: Instant, limit: Int): Int = conn.update(
        "DELETE FROM jobs WHERE id IN (SELECT id FROM jobs WHERE status = 'failed' AND created_at < ? LIMIT ?)", before, limit,
    )

    /** Due pending jobs by kind (found through the pending-jobs index on run_at): the queue's depth and lag, for metrics. */
    fun backlog(conn: Connection): List<QueueBacklog> = conn.query(
        "SELECT kind, count(*) AS due, (EXTRACT(EPOCH FROM now() - min(run_at)) * 1000)::bigint AS age_ms FROM jobs " +
            "WHERE status = 'pending' AND run_at <= now() GROUP BY kind",
    ) { QueueBacklog(it.str("kind"), it.long("due"), Duration.ofMillis(it.long("age_ms").coerceAtLeast(0))) }

    fun purgeFinished(conn: Connection, olderThanDays: Int = 14): Int = conn.update(
        "DELETE FROM jobs WHERE status = 'done' AND created_at < now() - make_interval(days => ?)", olderThanDays,
    )
}

private const val MAX_ERROR_LENGTH = 2000
