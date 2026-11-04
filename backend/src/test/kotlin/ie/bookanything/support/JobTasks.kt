package ie.bookanything.support

import ie.bookanything.AppContext
import ie.bookanything.jobs.JobWorker

/**
 * Runs one of the worker's periodic tasks now ("send-reminders", "expire-holds", ...) and then the jobs it queued.
 * Unlike `runPeriodic(force = true)` it skips the other maintenance, which walks every business in the shared test
 * database (assistant nudges above all) and gets slower as the suite grows.
 */
fun JobWorker.runTask(ctx: AppContext, name: String): Int = periodicTasks.single { it.name == name }.run(ctx).also { drain() }
