package ie.bookanything.jobs

import ie.bookanything.db.Db
import org.slf4j.LoggerFactory
import java.util.UUID

/** Runs claimed jobs and records how they went: for the [JobWorker], and for a job run straight after the commit that queued it. */
object JobRunner {
    private val log = LoggerFactory.getLogger(JobRunner::class.java)

    /** Runs [job] with [handler]: done when it returns, failed (retried with backoff, see [JobQueue.fail]) when it throws. */
    fun run(db: Db, job: Job, handler: JobHandler) {
        try {
            handler.handle(job)
            db.txBlocking { JobQueue.complete(it, job.id) }
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Job boundary: record the failure for retry.
            log.warn("job failed id={} kind={} attempt={} error={}", job.id, job.kind, job.attempts, e.message)
            db.txBlocking { JobQueue.fail(it, job, e.message ?: e.javaClass.simpleName) }
        }
    }

    /**
     * Claims the job [id] even if it is not due yet and runs it now, as the worker would. Does nothing when the worker
     * already has it or it is finished. Returns whether it ran.
     */
    fun runNow(db: Db, id: UUID, handler: JobHandler): Boolean {
        val job = db.txBlocking { JobQueue.claimById(it, id, INLINE_WORKER) } ?: return false
        run(db, job, handler)
        return true
    }

    /** `locked_by` of a job run in the request that queued it. */
    private const val INLINE_WORKER = "inline"
}
