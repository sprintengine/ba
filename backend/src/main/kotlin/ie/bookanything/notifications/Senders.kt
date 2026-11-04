package ie.bookanything.notifications

import org.slf4j.LoggerFactory

data class EmailMessage(
    val to: String,
    val subject: String,
    val text: String,
    val html: String,
    /** Template key, e.g. "booking_confirmed" (stored in email_log). */
    val template: String,
    /** Display name for the From header (the business), combined with the EMAIL_FROM address. */
    val fromName: String? = null,
    /** Replies go to the business, not the platform. */
    val replyTo: String? = null,
    /** Stable per message so provider retries never send twice. */
    val idempotencyKey: String? = null,
)

data class SendResult(val status: String, val providerRef: String?)

/** [ResendEmailSender] when RESEND_API_KEY is set, else [LogEmailSender]. */
interface EmailSender {
    val from: String
    fun send(message: EmailMessage): SendResult
}

/** Development/default sender: logs the email instead of sending it. The notification worker records an email_log row. */
class LogEmailSender(override val from: String) : EmailSender {
    private val log = LoggerFactory.getLogger(LogEmailSender::class.java)

    override fun send(message: EmailMessage): SendResult {
        log.info("email (not sent: no provider configured) template={} to={} subject=\"{}\"", message.template, message.to, message.subject)
        if (log.isDebugEnabled) log.debug("email body:\n{}", message.text)
        return SendResult("logged", null)
    }
}

data class SmsMessage(val to: String, val body: String)

/** [TwilioSmsSender] when the Twilio env is set, else [NoopSmsSender]. */
interface SmsSender {
    val enabled: Boolean
    fun send(message: SmsMessage): SendResult
}

class NoopSmsSender : SmsSender {
    override val enabled = false
    override fun send(message: SmsMessage) = SendResult("skipped", null)
}
