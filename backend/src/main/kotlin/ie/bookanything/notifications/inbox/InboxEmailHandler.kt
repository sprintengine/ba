package ie.bookanything.notifications.inbox

import ie.bookanything.config.AppUrls
import ie.bookanything.db.Db
import ie.bookanything.jobs.Job
import ie.bookanything.notifications.EmailSender
import ie.bookanything.notifications.EmailTemplates
import ie.bookanything.notifications.NotificationRepository
import kotlinx.serialization.json.jsonPrimitive
import java.time.Clock
import java.util.UUID

/**
 * Emails a notification ([Inbox.EMAIL_JOB]) when its person wants that kind by email and hasn't read it in the app
 * meanwhile; once, even if the job runs again.
 */
class InboxEmailHandler(private val db: Db, private val email: EmailSender, private val urls: AppUrls, private val clock: Clock) {
    fun handle(job: Job) {
        val id = UUID.fromString(job.payload["notificationId"]?.jsonPrimitive?.content ?: return)
        db.txBlocking { conn ->
            val n = InboxRepository.get(conn, id) ?: return@txBlocking
            if (n.readAt != null || n.emailedAt != null) return@txBlocking
            val kind = InboxKind.parse(n.kind) ?: return@txBlocking
            if (!InboxRepository.wantsEmail(conn, n.userId, kind)) return@txBlocking
            val to = InboxRepository.email(conn, n.userId) ?: return@txBlocking
            val content =
                EmailTemplates.notification(n.title, n.body, n.businessName, "${urls.base}${n.link}", "${urls.base}$SETTINGS_PATH")
            val message =
                EmailTemplates.toMessage(EmailTemplates.PLATFORM_BRAND, content, to, replyTo = null, idempotencyKey = "${job.id}:0")
            NotificationRepository.logEmail(conn, n.businessId, message, email.send(message))
            InboxRepository.markEmailed(conn, id, clock.instant())
        }
    }

    companion object {
        /** Where a person chooses which notifications are emailed. */
        const val SETTINGS_PATH = "/my/notifications"
    }
}
