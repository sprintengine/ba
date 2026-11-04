package ie.bookanything.jobs

import ie.bookanything.db.Db
import ie.bookanything.mcp.customer.CustomerRequests
import ie.bookanything.notifications.inbox.InboxRepository
import ie.bookanything.notifications.push.PushDeviceRepository
import ie.bookanything.oauth.PgTokenStore
import ie.bookanything.payments.ProviderEventRepository
import java.sql.Connection
import java.time.Duration
import java.time.Instant

/**
 * The daily purge (periodic task `purge-expired`) of rows nothing reads any more, which would otherwise grow without
 * end: expired OAuth codes and tokens, applied webhook events, jobs that failed for good, old notifications, old
 * requests from customers' AI apps and phones that no longer get push notifications. Each table is emptied in
 * batches of [BATCH], one transaction each, so a long backlog never holds locks for long or runs into the statement
 * timeout.
 */
object Retention {
    /** OAuth codes and tokens are deleted a day after they expire. */
    val EXPIRED_GRACE: Duration = Duration.ofDays(1)

    /** Applied webhook events: long after any provider's retries (Stripe retries for 3 days). */
    val PROCESSED_EVENTS: Duration = Duration.ofDays(90)

    /** Jobs that failed for good, kept to investigate. */
    val FAILED_JOBS: Duration = Duration.ofDays(90)

    /** Notifications: the bell shows recent ones; older ones aren't needed. */
    val NOTIFICATIONS: Duration = Duration.ofDays(180)

    /** Phones that stopped getting push notifications (signed out, app gone, replaced). */
    val REVOKED_PUSH_DEVICES: Duration = Duration.ofDays(30)

    /** Phones whose app hasn't registered (it does on every launch) in about nine months: no longer used. */
    val UNSEEN_PUSH_DEVICES: Duration = Duration.ofDays(270)

    const val BATCH = 5_000

    /** Purges everything due at [now]; returns the rows deleted. */
    fun purge(db: Db, now: Instant, batch: Int = BATCH): Int = listOf<(Connection) -> Int>(
        { PgTokenStore.purgeExpired(it, now.minus(EXPIRED_GRACE), batch) },
        { ProviderEventRepository.purgeProcessed(it, now.minus(PROCESSED_EVENTS), batch) },
        { JobQueue.purgeFailed(it, now.minus(FAILED_JOBS), batch) },
        { InboxRepository.purgeOld(it, now.minus(NOTIFICATIONS), batch) },
        { CustomerRequests.purgeOld(it, now.minus(CustomerRequests.KEPT), batch) },
        { PushDeviceRepository.purgeStale(it, now.minus(REVOKED_PUSH_DEVICES), now.minus(UNSEEN_PUSH_DEVICES), batch) },
    ).sumOf { step -> inBatches(db, batch, step) }

    /** Runs [step] in a transaction of its own until it deletes fewer than [batch] rows; returns the rows deleted. */
    private fun inBatches(db: Db, batch: Int, step: (Connection) -> Int): Int {
        var total = 0
        do {
            val deleted = db.txBlocking(block = step)
            total += deleted
        } while (deleted >= batch)
        return total
    }
}
