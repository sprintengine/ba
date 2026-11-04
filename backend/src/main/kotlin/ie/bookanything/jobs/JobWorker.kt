package ie.bookanything.jobs

import ie.bookanything.AppContext
import ie.bookanything.ai.usage.AiMeter
import ie.bookanything.ai.usage.AiOverage
import ie.bookanything.ai.usage.AiUsageRepository
import ie.bookanything.db.queryOne
import ie.bookanything.geo.GeocodeJobs
import ie.bookanything.notifications.NotificationHandler
import ie.bookanything.notifications.Notify
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.notifications.inbox.InboxEmailHandler
import ie.bookanything.notifications.push.PushHandler
import ie.bookanything.payments.CheckoutExpiry
import ie.bookanything.payments.PaymentService
import ie.bookanything.payments.StripeEventProcessor
import ie.bookanything.payments.StripeEvents
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.slf4j.LoggerFactory
import java.lang.management.ManagementFactory
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.Job as CoroutineJob

fun interface JobHandler {
    fun handle(job: Job)
}

data class PeriodicTask(val name: String, val every: Duration, val run: (AppContext) -> Int)

/**
 * In-process worker for the Postgres job queue plus periodic maintenance. Safe with several
 * app instances: jobs are claimed with SKIP LOCKED; periodic tasks run only on the instance
 * holding a transaction-scoped advisory lock for that tick.
 */
class JobWorker(
    private val ctx: AppContext,
    private val pollInterval: Duration = Duration.ofSeconds(1),
    private val batchSize: Int = 10,
    /** Run after [periodicTasks] on the same schedule (tests). */
    private val extraTasks: List<PeriodicTask> = emptyList(),
) {
    private val log = LoggerFactory.getLogger(JobWorker::class.java)
    private val workerId = "${ManagementFactory.getRuntimeMXBean().name}-${UUID.randomUUID().toString().take(8)}"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lastRun = HashMap<String, Instant>()
    private val lifecycle = ctx.booking.lifecycle

    private val push = PushHandler(ctx.db, ctx.push, ctx.clock)

    val handlers: Map<String, JobHandler> = mapOf(
        Notify.JOB_KIND to JobHandler(NotificationHandler(ctx.db, ctx.email, ctx.sms, ctx.tokens, ctx.config.urls, ctx.inbox)::handle),
        StripeEvents.JOB_KIND to JobHandler(StripeEventProcessor(ctx.db, ctx.clock, ctx.config.stripe, lifecycle)::handle),
        AiOverage.JOB_KIND to JobHandler { ctx.ai.overageJob.handle(it) },
        GeocodeJobs.KIND to GeocodeJobs.handler(ctx.db, ctx.geocoder, ctx.clock),
        PaymentService.REFUND_RETRY_JOB to JobHandler(ctx.booking.refunds::handle),
        CheckoutExpiry.JOB_KIND to JobHandler(CheckoutExpiry(ctx.db, ctx.payments)::handle),
        Inbox.EMAIL_JOB to JobHandler(InboxEmailHandler(ctx.db, ctx.email, ctx.config.urls, ctx.clock)::handle),
        PushHandler.SEND_JOB to JobHandler(push::send),
        PushHandler.RECEIPTS_JOB to JobHandler(push::receipts),
    )

    val periodicTasks: List<PeriodicTask> = listOf(
        PeriodicTask("expire-holds", Duration.ofMinutes(1)) { c -> c.db.txBlocking { lifecycle.expireHolds(it, c.now()) } },
        PeriodicTask("send-reminders", Duration.ofMinutes(5)) { c -> c.db.txBlocking { lifecycle.enqueueReminders(it, c.now()) } },
        PeriodicTask("auto-complete", Duration.ofHours(1)) { c -> c.db.txBlocking { lifecycle.autoComplete(it, c.now()) } },
        PeriodicTask("purge-rate-limits", Duration.ofHours(1)) { c ->
            c.db.txBlocking { c.rateLimiter.purge(it, c.now().minus(Duration.ofDays(1))) }
        },
        PeriodicTask("release-ai-reservations", Duration.ofMinutes(5)) { c ->
            c.db.txBlocking { AiUsageRepository.releaseStale(it, c.now().minus(AiMeter.STALE_RESERVATION), c.now()) }
        },
        PeriodicTask("assistant-nudges", Duration.ofMinutes(15)) { c -> c.assistant.nudges.refreshAll() },
        PeriodicTask(
            "recover-jobs",
            Duration.ofMinutes(5),
        ) { c -> c.db.txBlocking { JobQueue.recoverStuck(it) + JobQueue.purgeFinished(it) } },
        PeriodicTask("purge-expired", Duration.ofDays(1)) { c -> Retention.purge(c.db, c.now()) },
    )

    private var loops: List<CoroutineJob> = emptyList()

    /**
     * Starts two loops: the job queue, polled continuously, and the periodic tasks, every [PERIODIC_TICK]. They run
     * side by side, so a slow periodic task (refreshing every business's nudges) never holds up jobs such as emails
     * and payment events.
     */
    fun start() {
        if (loops.isNotEmpty()) return
        log.info("job worker started id={}", workerId)
        loops = listOf(
            scope.launch {
                while (isActive) {
                    val processed = guarded("job worker loop") { runOnce() } ?: 0
                    if (processed == 0) delay(pollInterval.toMillis())
                }
            },
            scope.launch {
                while (isActive) {
                    guarded("periodic tasks") { runPeriodic() }
                    delay(PERIODIC_TICK.toMillis())
                }
            },
        )
    }

    /** Loop boundary: an unexpected error is logged and the loop backs off, then keeps going. */
    private suspend fun <T> guarded(what: String, block: () -> T): T? = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
        log.warn("{} error: {}", what, e.message)
        delay(ERROR_BACKOFF.toMillis())
        null
    }

    fun stop() {
        scope.cancel()
        loops = emptyList()
    }

    /** Claims and processes one batch. Returns the number of jobs processed. */
    fun runOnce(): Int {
        val jobs = ctx.db.txBlocking { JobQueue.claim(it, workerId, batchSize) }
        for (job in jobs) {
            JobRunner.run(ctx.db, job) { handlers[it.kind]?.handle(it) ?: error("No handler for job kind ${it.kind}") }
        }
        return jobs.size
    }

    /** Drains the queue (tests and CLI). */
    fun drain(maxBatches: Int = 100) {
        repeat(maxBatches) { if (runOnce() == 0) return }
    }

    /**
     * Runs due periodic tasks while holding a session-level advisory lock, so only one
     * instance runs maintenance at a time (leader per tick). Tasks are idempotent.
     */
    fun runPeriodic(force: Boolean = false) {
        ctx.db.dataSource.connection.use { lockConn ->
            val leader = lockConn.queryOne("SELECT pg_try_advisory_lock(?)", LOCK_KEY) { it.getBoolean(1) } ?: false
            if (!leader) return
            try {
                val now = Instant.now()
                (periodicTasks + extraTasks).filter { force || isDue(it, now) }.forEach { run(it, now) }
            } finally {
                lockConn.queryOne("SELECT pg_advisory_unlock(?)", LOCK_KEY) { it.getBoolean(1) }
            }
        }
    }

    /** A task is due when it never ran on this instance or its interval has passed. */
    private fun isDue(task: PeriodicTask, now: Instant): Boolean =
        lastRun[task.name]?.let { Duration.between(it, now) >= task.every } ?: true

    private fun run(task: PeriodicTask, now: Instant) {
        lastRun[task.name] = now
        try {
            val n = task.run(ctx)
            if (n > 0) log.info("periodic task {} affected {} rows", task.name, n)
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // One failing task must not stop the others.
            log.warn("periodic task {} failed: {}", task.name, e.message)
        }
    }

    companion object {
        /** Arbitrary constant identifying the periodic-task leader lock. */
        const val LOCK_KEY = 7_311_902_144L
    }
}

/** How often the periodic loop considers its tasks (each task has its own interval). */
private val PERIODIC_TICK: Duration = Duration.ofSeconds(15)

/** Pause after an unexpected error in the worker loop. */
private val ERROR_BACKOFF: Duration = Duration.ofSeconds(5)
