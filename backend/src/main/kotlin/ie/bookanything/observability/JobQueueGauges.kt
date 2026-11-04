package ie.bookanything.observability

import ie.bookanything.db.Db
import ie.bookanything.jobs.JobQueue
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import org.slf4j.LoggerFactory
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * The job queue's depth and lag by kind: how many due jobs wait, and how long the oldest has waited. A growing age means
 * the worker is stuck or failing (emails, Stripe events and refunds all go through it). [refresh] reads the queue
 * once; the server calls it every [INTERVAL_SECONDS]. A kind keeps its series (at 0) once seen, so a drained queue
 * reads 0, not "no data".
 */
class JobQueueGauges(private val db: Db, private val registry: MeterRegistry) {
    private class Backlog(val due: AtomicLong = AtomicLong(), val ageMillis: AtomicLong = AtomicLong())

    private val byKind = ConcurrentHashMap<String, Backlog>()
    private val log = LoggerFactory.getLogger(JobQueueGauges::class.java)

    /**
     * [refresh], or when it fails, keeps the last values and reports why (a database that doesn't answer shows in
     * `/v1/health`; a query that broke would otherwise freeze the gauges unnoticed).
     */
    fun sample() {
        try {
            refresh()
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Sampler boundary: the next tick tries again.
            log.warn("job queue gauges not refreshed: {}", e.message)
            Telemetry.errors.capture(e, mapOf("task" to "job-queue-gauges"))
        }
    }

    fun refresh() {
        val rows = db.txBlocking(readOnly = true) { JobQueue.backlog(it) }.associateBy { it.kind }
        (byKind.keys + rows.keys).forEach { kind ->
            val backlog = byKind.computeIfAbsent(kind, ::register)
            backlog.due.set(rows[kind]?.due ?: 0)
            backlog.ageMillis.set(rows[kind]?.oldestDue?.toMillis() ?: 0)
        }
    }

    private fun register(kind: String): Backlog = Backlog().also { b ->
        Gauge.builder("jobs.queue.depth", b.due) { it.get().toDouble() }
            .description("Due jobs waiting to run").tag("kind", kind).register(registry)
        Gauge.builder("jobs.queue.oldest.age", b.ageMillis) { it.get() / MILLIS_PER_SECOND }
            .description("How long the oldest due job has waited").baseUnit("seconds").tag("kind", kind).register(registry)
    }

    companion object {
        const val INTERVAL_SECONDS = 30L
        private const val MILLIS_PER_SECOND = 1000.0
    }
}
