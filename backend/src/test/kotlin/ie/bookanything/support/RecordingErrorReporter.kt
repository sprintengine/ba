package ie.bookanything.support

import ie.bookanything.observability.AppMetrics
import ie.bookanything.observability.ErrorReporter
import ie.bookanything.observability.Observability
import ie.bookanything.observability.Telemetry
import io.micrometer.core.instrument.DistributionSummary
import io.micrometer.core.instrument.FunctionTimer
import io.micrometer.core.instrument.LongTaskTimer
import io.micrometer.core.instrument.Meter
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import java.util.concurrent.CopyOnWriteArrayList

/** Error reports kept in memory: what was captured, with which tags; with [tracing], the traces and how they ended. */
class RecordingErrorReporter(private val tracing: Boolean = false) : ErrorReporter {
    data class Report(val error: Throwable?, val message: String?, val tags: Map<String, String>)

    val reports = CopyOnWriteArrayList<Report>()
    val traces = CopyOnWriteArrayList<Pair<String, Int?>>()

    override fun startTrace(name: String, tags: Map<String, String>): ErrorReporter.Trace? =
        if (tracing) ErrorReporter.Trace { status -> traces += name to status } else null

    override fun capture(error: Throwable, tags: Map<String, String>) {
        reports += Report(error, null, tags)
    }

    override fun message(text: String, tags: Map<String, String>) {
        reports += Report(null, text, tags)
    }
}

/**
 * Runs [block] with the process-wide [Telemetry] recording into a fresh registry (configured as in production) and a
 * [RecordingErrorReporter]; afterwards metrics go nowhere again. Tests run one at a time, so the recorder is theirs.
 */
fun <T> withTelemetry(tracing: Boolean = false, block: (SimpleMeterRegistry, RecordingErrorReporter) -> T): T {
    val registry = SimpleMeterRegistry().also { Observability.configure(it, "test") }
    val errors = RecordingErrorReporter(tracing)
    Telemetry.install(AppMetrics(registry), errors)
    try {
        return block(registry, errors)
    } finally {
        Telemetry.install(AppMetrics.none(), ErrorReporter.NONE)
        registry.close()
    }
}

/**
 * The Prometheus series [meter] becomes once pushed over OTLP to Grafana Cloud: one per counter or gauge; a timer is a
 * histogram, one series per bucket plus `+Inf`, `_count` and `_sum`.
 */
fun seriesOf(meter: Meter): Int = when (meter) {
    is Timer -> meter.takeSnapshot().histogramCounts().size + 3
    is DistributionSummary -> meter.takeSnapshot().histogramCounts().size + 3
    is LongTaskTimer -> meter.takeSnapshot().histogramCounts().size + 3
    is FunctionTimer -> 3
    else -> 1
}

fun seriesOf(registry: MeterRegistry, prefix: String = ""): Int = registry.meters.filter { it.id.name.startsWith(prefix) }.sumOf(::seriesOf)

/** The values of [tag] across the meters named [name]. */
fun MeterRegistry.tagValues(name: String, tag: String): Set<String> = find(name).meters().mapNotNull { it.id.getTag(tag) }.toSet()

/** The count of the counter [name] with [tags], 0 when it was never incremented. */
fun MeterRegistry.count(name: String, vararg tags: String): Double = find(name).tags(*tags).counter()?.count() ?: 0.0
