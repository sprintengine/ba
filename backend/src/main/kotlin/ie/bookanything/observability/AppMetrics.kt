package ie.bookanything.observability

import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import io.micrometer.core.instrument.composite.CompositeMeterRegistry
import java.time.Duration

/**
 * The application's own metrics. Every label is from a small fixed set (docs/observability.md, "Cardinality"): a route
 * template, never a path; a job kind; an outcome. Never a business, user, booking or request id: each distinct value
 * is a new series, and the metrics plan bills by series.
 */
class AppMetrics(val registry: MeterRegistry) {
    /**
     * One API request: [route] is the template (`/v1/businesses/{businessId}/bookings`) or [RouteLabels.UNMATCHED];
     * [simulation] says it came from the reliability simulation (only ever true on staging), a label with two values.
     */
    fun request(route: String, method: String, status: Int?, elapsed: Duration, simulation: Boolean = false) {
        Counter.builder("http.server.requests")
            .description("API requests by route template, method and status class")
            .tags("route", route, "method", methodLabel(method), "status", statusClass(status), "simulation", simulation.toString())
            .register(registry).increment()
        // Latency by area, not route: a histogram is ten series per label set, so per route it would cost thousands.
        Timer.builder("http.server.duration")
            .description("API request latency by area")
            .tags("area", RouteLabels.area(route), "simulation", simulation.toString())
            .serviceLevelObjectives(*HTTP_BUCKETS)
            .register(registry).record(elapsed)
    }

    /**
     * Registers every series of a rare event at 0, so its first occurrence is an increase: a series that appears at 1
     * has nothing to increase from, and `increase()` (and the alerts built on it) would read 0. [jobKinds] are the
     * worker's.
     */
    fun registerAtZero(jobKinds: Collection<String>) {
        BOOKING_STATUSES.forEach { counter("bookings.created", "outcome", it) }
        HoldOutcome.entries.forEach { counter("booking.holds", "outcome", it.label) }
        counter("payments.refunds.failed")
        listOf("true", "false").forEach { counter("payments.refunds.given_up", "certain", it) }
        jobKinds.forEach { kind -> JobResult.entries.forEach { counter("jobs.runs", "kind", kind, "result", it.label) } }
    }

    /** A booking was made ([status] is its wire status: confirmed, held for payment or pending_approval). */
    fun bookingCreated(status: String) {
        counter("bookings.created", "outcome", status).increment()
    }

    /** [count] holds for online payment ended with [outcome]. */
    fun holds(outcome: HoldOutcome, count: Int = 1) {
        counter("booking.holds", "outcome", outcome.label).increment(count.toDouble())
    }

    /** A refund attempt failed at the payment provider (retried while it is unreachable, else handed to the business). */
    fun refundFailed() {
        counter("payments.refunds.failed").increment()
    }

    /**
     * A refund was handed to the business for good: [certain] that it wasn't made (the provider declined it), or not
     * (unreachable to the end; they check their Stripe dashboard first). Someone has to act either way.
     */
    fun refundGivenUp(certain: Boolean) {
        counter("payments.refunds.given_up", "certain", certain.toString()).increment()
    }

    /** A job attempt ended: done, failed and to be retried, or failed for good (out of attempts). */
    fun jobRun(kind: String, result: JobResult) {
        counter("jobs.runs", "kind", kind, "result", result.label).increment()
    }

    /** How long after we received a Stripe webhook its effects were applied. */
    fun stripeWebhookLag(lag: Duration) {
        Timer.builder("stripe.webhook.lag").description("Time from receiving a Stripe event to applying it")
            .serviceLevelObjectives(*WEBHOOK_BUCKETS)
            .register(registry).record(lag.coerceAtLeast(Duration.ZERO))
    }

    private fun counter(name: String, vararg tags: String): Counter =
        Counter.builder(name).description(DESCRIPTIONS.getValue(name)).tags(*tags).register(registry)

    enum class HoldOutcome(val label: String) {
        PAID("paid"),
        EXPIRED("expired"),

        /** The customer left the checkout (or it failed) and the hold was released. */
        ABANDONED("abandoned"),

        /** Paid after the hold expired, with the time still free: the booking was revived (counted as expired first). */
        PAID_AFTER_EXPIRY("paid_after_expiry"),

        /** Paid after the hold expired and the time was gone: refunded in full (counted as expired first). */
        PAID_TOO_LATE("paid_too_late"),
    }

    enum class JobResult(val label: String) { DONE("done"), RETRY("retry"), FAILED("failed") }

    companion object {
        /** Metrics that go nowhere: an empty composite registry hands out no-op meters. */
        fun none() = AppMetrics(CompositeMeterRegistry())

        private val HTTP_BUCKETS = listOf(50L, 100L, 250L, 500L, 1_000L, 2_500L, 10_000L).map(Duration::ofMillis).toTypedArray()
        private val WEBHOOK_BUCKETS = listOf(1L, 5L, 30L, 120L, 600L).map(Duration::ofSeconds).toTypedArray()
        private val BOOKING_STATUSES = listOf("confirmed", "held", "pending_approval")
        private val DESCRIPTIONS = mapOf(
            "bookings.created" to "Bookings made, by the status they started in",
            "booking.holds" to "Holds for online payment, by how they ended",
            "payments.refunds.failed" to "Refund attempts the payment provider failed",
            "payments.refunds.given_up" to "Refunds handed to the business to make or check by hand",
            "jobs.runs" to "Job attempts by kind and result",
        )
        private val METHODS = setOf("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")

        /** A client may send any method name: anything unusual is one label. */
        fun methodLabel(method: String): String = method.uppercase().takeIf { it in METHODS } ?: "OTHER"

        fun statusClass(status: Int?): String = when (status) {
            null -> "unknown"
            in 200..299 -> "2xx"
            in 300..399 -> "3xx"
            in 400..499 -> "4xx"
            in 500..599 -> "5xx"
            else -> "unknown"
        }
    }
}
