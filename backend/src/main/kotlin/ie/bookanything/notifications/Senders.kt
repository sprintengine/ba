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

/**
 * Sends through [delegate] except to addresses on a domain that can never receive mail: the special-use top-level
 * domains `.test`, `.example`, `.invalid` and `.localhost` (RFC 2606, RFC 6761). Those are only ever test data (the
 * reliability simulation's customers on staging are `…@sim.bookanything.test`); sending would only bounce, which counts
 * against the sending domain's reputation. Recorded as `skipped`.
 */
class SkipUndeliverable(private val delegate: EmailSender) : EmailSender {
    override val from: String get() = delegate.from

    override fun send(message: EmailMessage): SendResult =
        if (undeliverable(message.to)) SendResult("skipped", null) else delegate.send(message)

    companion object {
        private val RESERVED_TLDS = setOf("test", "example", "invalid", "localhost")

        fun undeliverable(address: String): Boolean =
            address.substringAfterLast('@', "").trimEnd('.', '>', ' ').substringAfterLast('.').lowercase() in RESERVED_TLDS
    }
}
