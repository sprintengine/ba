package ie.bookanything.notifications.push

import ie.bookanything.db.Db
import ie.bookanything.jobs.Job
import ie.bookanything.jobs.JobQueue
import ie.bookanything.notifications.inbox.InboxKind
import ie.bookanything.notifications.inbox.InboxRepository
import ie.bookanything.notifications.inbox.NotificationRow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Pushes notifications to people's phones (section 22). [send] ([SEND_JOB], queued with the notification) sends one
 * message per phone, unless the person read it in the meantime; [receipts] ([RECEIPTS_JOB], [RECEIPT_DELAY] later) asks
 * Expo whether the phones' push services took them. A phone Expo says is gone is revoked either way; other errors are
 * logged, never retried. Expo being down or busy is retried by the job queue (backoff, [SEND_ATTEMPTS] tries for a send:
 * a notification hours late is no use).
 */
class PushHandler(private val db: Db, private val push: PushSender, private val clock: Clock) {
    private val log = LoggerFactory.getLogger(PushHandler::class.java)

    fun send(job: Job) {
        if (!push.enabled) return
        val id = UUID.fromString(job.payload[NOTIFICATION_ID]?.jsonPrimitive?.content ?: return)
        // Phones an earlier attempt got through to (a send is one request per app variant).
        val done = job.payload[SENT]?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty().toMutableSet()
        val (n, devices, unread) = db.txBlocking(readOnly = true) { conn ->
            val n = InboxRepository.get(conn, id)?.takeIf { it.readAt == null } ?: return@txBlocking null
            val devices = PushDeviceRepository.active(conn, n.userId).filter { it.id.toString() !in done }
            Triple(n, devices, InboxRepository.unreadCount(conn, n.userId))
        } ?: return
        // Expo refuses a request mixing apps; the variants are separate apps.
        for (group in devices.groupBy { it.appVariant }.values) {
            val sentAt = clock.instant()
            val tickets = push.send(group.map { message(n, it.token, unread) })
            db.txBlocking { conn ->
                record(conn, n, group.zip(tickets), sentAt)
                done += group.map { it.id.toString() }
                JobQueue.setPayload(conn, job.id, JsonObject(job.payload + (SENT to JsonArray(done.map(::JsonPrimitive)))))
            }
        }
    }

    /** Revokes phones Expo says are gone, logs other refusals and queues the receipts check for the accepted. */
    private fun record(conn: Connection, n: NotificationRow, sent: List<Pair<PushDeviceRow, PushTicket>>, sentAt: Instant) {
        val receipts = mutableMapOf<String, JsonPrimitive>()
        for ((device, ticket) in sent) {
            when {
                ticket.ok -> ticket.id?.let { receipts[it] = JsonPrimitive(device.id.toString()) }
                ticket.error == PushSender.DEVICE_NOT_REGISTERED ->
                    PushDeviceRepository.revoke(conn, device.id, PushRevokeReason.NOT_REGISTERED, sentAt, clock.instant())
                else ->
                    log.warn("push not sent notification={} device={} error={} message={}", n.id, device.id, ticket.error, ticket.message)
            }
        }
        if (receipts.isEmpty()) return
        val payload = JsonObject(mapOf(TICKETS to JsonObject(receipts), SENT_AT to JsonPrimitive(sentAt.toString())))
        JobQueue.enqueue(conn, RECEIPTS_JOB, payload, delay = RECEIPT_DELAY)
    }

    fun receipts(job: Job) {
        if (!push.enabled) return
        val tickets = job.payload[TICKETS]?.jsonObject?.mapValues { UUID.fromString(it.value.jsonPrimitive.content) } ?: return
        val sentAt = job.payload[SENT_AT]?.jsonPrimitive?.content?.let(Instant::parse) ?: return
        val receipts = push.receipts(tickets.keys.toList())
        db.txBlocking { conn ->
            for ((ticketId, receipt) in receipts) {
                val device = tickets[ticketId] ?: continue
                when {
                    receipt.ok -> Unit
                    receipt.error == PushSender.DEVICE_NOT_REGISTERED ->
                        PushDeviceRepository.revoke(conn, device, PushRevokeReason.NOT_REGISTERED, sentAt, clock.instant())
                    else -> log.warn("push not delivered device={} error={} message={}", device, receipt.error, receipt.message)
                }
            }
        }
    }

    companion object {
        const val SEND_JOB = "push-send"
        const val RECEIPTS_JOB = "push-receipts"
        const val SEND_ATTEMPTS = 5

        /** Expo's advice: receipts are usually ready well within 15 minutes (and kept for a day). */
        val RECEIPT_DELAY: Duration = Duration.ofMinutes(15)

        private const val NOTIFICATION_ID = "notificationId"
        private const val SENT = "sent"
        private const val TICKETS = "tickets"
        private const val SENT_AT = "sentAt"
        private const val APP_NAME = "bookanything"
        private const val GENERIC_TEXT = "You have a new notification"

        /** Queues the push of notification [notificationId] (in the transaction that stored it). */
        fun enqueue(conn: Connection, notificationId: UUID) {
            JobQueue.enqueue(
                conn, SEND_JOB, JsonObject(mapOf(NOTIFICATION_ID to JsonPrimitive(notificationId.toString()))), maxAttempts = SEND_ATTEMPTS,
            )
        }

        /**
         * The push for notification [n] to the phone with [token]. It shows on a locked phone, so it says only that something
         * happened and where: the business it is about (or bookanything) and its kind's [InboxKind.pushText], never the
         * notification's title or body (customer names, services, times, what an AI agent proposes). Also the app path to
         * open and the person's unread count on the app icon. Approvals wait on the person: high priority.
         */
        fun message(n: NotificationRow, token: String, unread: Int) = PushMessage(
            to = token,
            title = n.businessName ?: APP_NAME,
            body = InboxKind.parse(n.kind)?.pushText ?: GENERIC_TEXT,
            data = JsonObject(
                mapOf("link" to JsonPrimitive(n.link), "notificationId" to JsonPrimitive(n.id.toString()), "kind" to JsonPrimitive(n.kind)),
            ),
            badge = unread,
            priority = "high".takeIf { n.kind == InboxKind.AGENT_APPROVAL.key },
        )
    }
}
