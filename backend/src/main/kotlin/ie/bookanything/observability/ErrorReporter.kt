package ie.bookanything.observability

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Where failures nobody handled are reported (Sentry when `SENTRY_DSN` is set): 500s and other 5xx answers, jobs out of
 * attempts, a crashed worker loop. [tags] are ids and labels (request id, business id, route template, job kind), never
 * personal data; reports are scrubbed again before they leave ([SentryScrubber]).
 */
interface ErrorReporter : AutoCloseable {
    fun capture(error: Throwable, tags: Map<String, String> = emptyMap())

    /** A failure without an exception, such as a 502 answered because the payment provider failed. */
    fun message(text: String, tags: Map<String, String> = emptyMap())

    /** A performance trace of one request, when traces are sampled (`SENTRY_TRACES_SAMPLE_RATE` above 0); else null. */
    fun startTrace(name: String, tags: Map<String, String>): Trace? = null

    override fun close() = Unit

    fun interface Trace {
        fun finish(status: Int?)
    }

    companion object {
        val NONE: ErrorReporter = object : ErrorReporter {
            override fun capture(error: Throwable, tags: Map<String, String>) = Unit
            override fun message(text: String, tags: Map<String, String>) = Unit
        }
    }
}

/**
 * Sends at most [limit] reports per [window] for each kind of failure (exception class and where it was thrown, or the
 * message), so a failure that repeats every few seconds (the database down, a provider out) can't use up the error
 * plan's monthly quota in an afternoon. The first reports of each kind still go through, so it is never hidden.
 */
class ThrottledErrorReporter(
    private val delegate: ErrorReporter,
    private val limit: Int = 10,
    private val window: Duration = Duration.ofHours(1),
    private val clock: Clock = Clock.systemUTC(),
) : ErrorReporter by delegate {
    private class Bucket(val start: Instant, var count: Int)

    private val buckets = ConcurrentHashMap<String, Bucket>()

    override fun capture(error: Throwable, tags: Map<String, String>) {
        if (allow(keyOf(error))) delegate.capture(error, tags)
    }

    override fun message(text: String, tags: Map<String, String>) {
        if (allow("message:$text")) delegate.message(text, tags)
    }

    private fun allow(key: String): Boolean {
        val now = clock.instant()
        if (buckets.size > MAX_KEYS) buckets.clear() // A bound on memory, should failures vary without end.
        var allowed = false
        buckets.compute(key) { _, current ->
            (current?.takeIf { now.isBefore(it.start.plus(window)) }?.apply { count++ } ?: Bucket(now, 1))
                .also { allowed = it.count <= limit }
        }
        return allowed
    }

    /**
     * The exception class and the first frame in our code: a library's frame (the database driver's, say) is shared by
     * unrelated failures, which would then use up each other's allowance.
     */
    private fun keyOf(error: Throwable): String {
        val frame = error.stackTrace.firstOrNull { it.className.startsWith(APP_PACKAGE) } ?: error.stackTrace.firstOrNull()
        return "${error.javaClass.name}@" + frame?.let { "${it.className}.${it.methodName}:${it.lineNumber}" }.orEmpty()
    }

    private companion object {
        const val MAX_KEYS = 1_000
        const val APP_PACKAGE = "ie.bookanything."
    }
}
