package ie.bookanything.jobs

import ie.bookanything.support.Fixtures
import ie.bookanything.support.Fixtures.book
import ie.bookanything.support.TestEnv
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class JobWorkerTest {
    @Test
    fun `periodic tasks run when due and not again within their interval unless forced`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val worker = JobWorker(env.ctx)
            worker.runPeriodic() // First tick: every task is due.
            val email = "${unique("tick")}@example.test"
            book(api, clinic, "Consult", "2026-10-06T09:00:00+01:00", email = email)
            worker.drain()
            fun reminders() = env.email.sent.count { it.to == email && it.template == "booking_reminder" }

            worker.runPeriodic() // send-reminders ran moments ago, so it is not due yet.
            worker.drain()
            assertEquals(0, reminders())

            worker.runPeriodic(force = true)
            worker.drain()
            assertEquals(1, reminders())
        }
    }

    @Test
    fun `a job run straight after its commit is claimed once, before it is due, and retried by the worker when it fails`() {
        val env = TestEnv()
        withApp(env) { _ ->
            val kind = unique("inline")
            val attempts = mutableListOf<Int>()
            val handler = JobHandler { job -> attempts += job.attempts; if (job.attempts == 1) error("provider down") }
            val id = env.db.txBlocking { JobQueue.enqueue(it, kind, JsonObject(emptyMap()), delay = Duration.ofMinutes(5)) }
            fun state() = Fixtures.sqlOne(
                "SELECT status::text || ' ' || attempts || ' ' || (run_at > now()) FROM jobs WHERE id = ?", id,
            ) { it.getString(1) }
            assertEquals("pending 0 true", state(), "queued as a backstop, not due yet")

            assertTrue(JobRunner.runNow(env.db, id, handler))
            assertEquals("pending 1 true", state(), "failed: back in the queue with backoff")
            // The worker's next attempt (claimed as the worker claims it once due).
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE id = ?", id)
            JobRunner.run(env.db, env.db.txBlocking { JobQueue.claimById(it, id, "worker") }!!, handler)
            assertEquals("done 2 false", state())
            // A finished (or running) job is not run again.
            assertEquals(false, JobRunner.runNow(env.db, id, handler))
            assertEquals(listOf(1, 2), attempts)
        }
    }

    @Test
    fun `a slow periodic task never holds up the job queue`() {
        val env = TestEnv()
        val running = CountDownLatch(1)
        val release = CountDownLatch(1)
        val slow = PeriodicTask("slow", Duration.ofHours(1)) { running.countDown(); release.await(30, TimeUnit.SECONDS); 0 }
        withApp(env) { _ ->
            val worker = JobWorker(env.ctx, pollInterval = Duration.ofMillis(50), extraTasks = listOf(slow))
            worker.start()
            try {
                assertTrue(running.await(30, TimeUnit.SECONDS), "the periodic loop reached the slow task")
                val kind = unique("probe")
                env.db.txBlocking { JobQueue.enqueue(it, kind, JsonObject(emptyMap()), maxAttempts = 1) }
                // No handler for this kind: processing it marks it failed, which shows the queue is being worked.
                val deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos()
                fun status() = Fixtures.sqlOne("SELECT status::text FROM jobs WHERE kind = ?", kind) { it.getString(1) }
                while (status() != "failed" && System.nanoTime() < deadline) delay(20)
                assertEquals("failed", status())
                assertEquals(1L, release.count, "while the periodic task was still running")
            } finally {
                release.countDown()
                worker.stop()
            }
        }
    }
}
