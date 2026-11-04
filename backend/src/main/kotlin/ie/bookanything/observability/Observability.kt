package ie.bookanything.observability

import io.micrometer.core.instrument.Clock
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.binder.jvm.ClassLoaderMetrics
import io.micrometer.core.instrument.binder.jvm.JvmGcMetrics
import io.micrometer.core.instrument.binder.jvm.JvmMemoryMetrics
import io.micrometer.core.instrument.binder.jvm.JvmThreadMetrics
import io.micrometer.core.instrument.binder.system.FileDescriptorMetrics
import io.micrometer.core.instrument.binder.system.ProcessorMetrics
import io.micrometer.core.instrument.binder.system.UptimeMetrics
import io.micrometer.core.instrument.composite.CompositeMeterRegistry
import io.micrometer.core.instrument.config.MeterFilter
import io.micrometer.registry.otlp.AggregationTemporality
import io.micrometer.registry.otlp.HistogramFlavor
import io.micrometer.registry.otlp.OtlpConfig
import io.micrometer.registry.otlp.OtlpMeterRegistry
import java.time.Duration
import java.util.concurrent.TimeUnit

/**
 * Metrics and error reporting for the whole process, like the logger: features record through [metrics] and
 * [errors] without having them passed in. [Observability.start] installs the configured ones at start-up; until then
 * (and in tests that don't install their own) metrics go nowhere and errors are only logged.
 */
object Telemetry {
    @Volatile
    var metrics: AppMetrics = AppMetrics.none()
        private set

    @Volatile
    var errors: ErrorReporter = ErrorReporter.NONE
        private set

    fun install(metrics: AppMetrics, errors: ErrorReporter) {
        this.metrics = metrics
        this.errors = errors
    }
}

/** What [start] set up from [ObservabilityConfig], closed on shutdown so the last metrics and errors are sent. */
class Observability(val registry: MeterRegistry, val errors: ErrorReporter, private val closeables: List<AutoCloseable>) : AutoCloseable {
    val metrics = AppMetrics(registry)

    override fun close() {
        closeables.forEach { it.close() }
        registry.close()
        errors.close()
    }

    companion object {
        const val SERVICE_NAME = "bookanything-api"

        /** Builds the registry and reporter [config] asks for and installs them in [Telemetry]. */
        fun start(config: ObservabilityConfig, registry: MeterRegistry = registryFor(config)): Observability {
            configure(registry, config.environment)
            val closeables = if (config.metricsEnabled) bindJvm(registry) else emptyList()
            val errors = config.sentryDsn?.let { ThrottledErrorReporter(SentryErrorReporter.start(config)) } ?: ErrorReporter.NONE
            return Observability(registry, errors, closeables).also { Telemetry.install(it.metrics, it.errors) }
        }

        /** OTLP push when an endpoint is set; otherwise a registry with nothing behind it (every meter a no-op). */
        fun registryFor(config: ObservabilityConfig): MeterRegistry =
            if (config.metricsEnabled) OtlpMeterRegistry(otlpConfig(config), Clock.SYSTEM) else CompositeMeterRegistry()

        /**
         * The push: every minute, cumulative, durations in seconds, explicit-bucket histograms (what Grafana Cloud's
         * OTLP endpoint stores as Prometheus series), and no extra `.max` gauge per timer (a series each, rarely read).
         */
        fun otlpConfig(config: ObservabilityConfig): OtlpConfig = object : OtlpConfig {
            override fun get(key: String): String? = null
            override fun url() = "${config.otlpEndpoint.orEmpty()}/v1/metrics"
            override fun headers() = config.otlpHeaders
            override fun step(): Duration = Duration.ofMinutes(1)
            override fun aggregationTemporality() = AggregationTemporality.CUMULATIVE
            override fun histogramFlavor() = HistogramFlavor.EXPLICIT_BUCKET_HISTOGRAM
            override fun publishMaxGaugeForHistograms() = false
            override fun baseTimeUnit() = TimeUnit.SECONDS
            override fun resourceAttributes() = buildMap {
                put("service.name", SERVICE_NAME)
                put("deployment.environment.name", config.environment)
                config.release?.let { put("service.version", it) }
                config.instanceId?.let { put("service.instance.id", it) }
            }
        }

        /**
         * Labels every series with the environment (one value per deployment, so free), and caps the labels that come
         * from code paths (route templates, job kinds) as a backstop: past the cap a new value is dropped, not stored.
         */
        fun configure(registry: MeterRegistry, environment: String) {
            registry.config()
                .commonTags("env", environment)
                .meterFilter(MeterFilter.maximumAllowableTags("http.server.requests", "route", MAX_ROUTES, MeterFilter.deny()))
                .meterFilter(MeterFilter.maximumAllowableTags("jobs.", "kind", MAX_JOB_KINDS, MeterFilter.deny()))
        }

        /** JVM memory, GC, threads, classes, CPU, file descriptors and uptime. */
        fun bindJvm(registry: MeterRegistry): List<AutoCloseable> {
            val gc = JvmGcMetrics()
            val binders = listOf(
                ClassLoaderMetrics(), JvmMemoryMetrics(), gc, JvmThreadMetrics(),
                ProcessorMetrics(), FileDescriptorMetrics(), UptimeMetrics(),
            )
            binders.forEach { it.bindTo(registry) }
            return listOf(gc)
        }

        /** Well above the API's route count (about 200): reaching it means a label is not a template. */
        private const val MAX_ROUTES = 400
        private const val MAX_JOB_KINDS = 40
    }
}
