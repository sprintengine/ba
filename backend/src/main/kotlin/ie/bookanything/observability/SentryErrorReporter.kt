package ie.bookanything.observability

import ie.bookanything.redactPath
import io.sentry.Sentry
import io.sentry.SentryEvent
import io.sentry.SentryLevel
import io.sentry.SentryOptions
import io.sentry.SpanStatus
import io.sentry.protocol.SentryTransaction

/** Reports to Sentry. [start] initialises the SDK once for the process; [close] flushes what is queued. */
class SentryErrorReporter private constructor(private val tracing: Boolean) : ErrorReporter {
    override fun capture(error: Throwable, tags: Map<String, String>) {
        Sentry.captureException(error) { scope -> tags.forEach(scope::setTag) }
    }

    override fun message(text: String, tags: Map<String, String>) {
        Sentry.captureMessage(text, SentryLevel.ERROR) { scope -> tags.forEach(scope::setTag) }
    }

    override fun startTrace(name: String, tags: Map<String, String>): ErrorReporter.Trace? {
        if (!tracing) return null
        val transaction = Sentry.startTransaction(name, "http.server")
        tags.forEach(transaction::setTag)
        return ErrorReporter.Trace { status ->
            transaction.status = status?.let(SpanStatus::fromHttpStatusCode) ?: SpanStatus.UNKNOWN
            transaction.finish()
        }
    }

    override fun close() = Sentry.close()

    companion object {
        /** Initialises Sentry from [config] (which has a DSN); [customize] is for tests. */
        fun start(config: ObservabilityConfig, customize: (SentryOptions) -> Unit = {}): SentryErrorReporter {
            Sentry.init { options ->
                options.dsn = config.sentryDsn
                options.environment = config.environment
                options.release = config.release
                options.tracesSampleRate = config.tracesSampleRate
                // No user details or IP addresses, request bodies or query data, and no machine name.
                options.dataCollection.userInfo = false
                options.dataCollection.httpBodies = emptySet()
                options.dataCollection.databaseQueryData = false
                options.isAttachServerName = false
                // Stack traces are grouped and shown by our frames, not the framework's.
                options.addInAppInclude("ie.bookanything")
                options.beforeSend = SentryOptions.BeforeSendCallback { event, _ -> SentryScrubber.scrub(event) }
                options.beforeSendTransaction = SentryOptions.BeforeSendTransactionCallback { tx, _ -> SentryScrubber.scrub(tx) }
                customize(options)
            }
            return SentryErrorReporter(tracing = config.tracesSampleRate > 0.0)
        }
    }
}

/**
 * The last check before a report leaves: no user, request or breadcrumb data (we never attach them, a library might),
 * and personal data and bearer secrets cut out of messages and exception texts (a Postgres error quotes the row it
 * refused, which may hold a name or an email).
 */
object SentryScrubber {
    private val EMAIL = Regex("""[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}""")

    /** Nine to fifteen digits, optionally spaced and with a `+`: a phone number, not a date, an amount or part of an id. */
    private val PHONE = Regex("""(?<![\w\-])\+?\d(?: ?\d){8,14}(?![\w\-])""")

    /** Postgres's `Detail:` (the conflicting key or the failing row) and `Where:` lines. */
    private val PG_DETAIL = Regex("""\s*(Detail|Where): [^\n]*""")

    /** Any query parameter named like a credential: `token`, `access_token`, `api_key`, `client_secret`, `code`. */
    private val TOKEN_QUERY = Regex("""([?&][\w.\-]*(?:token|key|secret|code)=)[^&\s]+""", RegexOption.IGNORE_CASE)

    /** kotlinx.serialization quotes the document it failed on, which may be a provider's payload with a customer in it. */
    private val JSON_INPUT = Regex("""\s*JSON input: .*""", RegexOption.DOT_MATCHES_ALL)

    fun text(raw: String?): String? = raw
        ?.let { PG_DETAIL.replace(it, "") }
        ?.let { JSON_INPUT.replace(it, "") }
        ?.let(::redactPath)
        ?.let { TOKEN_QUERY.replace(it, "$1[redacted]") }
        ?.let { EMAIL.replace(it, "[email]") }
        ?.let { PHONE.replace(it, "[number]") }

    fun scrub(event: SentryEvent): SentryEvent = event.apply {
        user = null
        request = null
        breadcrumbs = null
        serverName = null
        message?.let { m ->
            m.message = text(m.message)
            m.formatted = text(m.formatted)
            m.params = null
        }
        exceptions?.forEach { it.value = text(it.value) }
    }

    fun scrub(transaction: SentryTransaction): SentryTransaction = transaction.apply {
        user = null
        request = null
        breadcrumbs = null
        serverName = null
    }
}
