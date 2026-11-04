package ie.bookanything.observability

import ie.bookanything.config.AppConfig
import ie.bookanything.config.ConfigException
import ie.bookanything.config.EnvReader
import java.net.URI
import java.net.URLDecoder

/**
 * Error reporting (Sentry) and metrics (OTLP push, e.g. to Grafana Cloud), each off until its variables are set, so
 * development, tests and CI need no account (docs/observability.md).
 */
data class ObservabilityConfig(
    /** `SENTRY_DSN`: errors go to this Sentry project; null reports nothing. */
    val sentryDsn: String? = null,
    /** The deployment's environment (APP_ENV): Sentry's environment and the `env` label on every metric. */
    val environment: String = "development",
    /** The build running (`APP_VERSION`, set by the release train's image): Sentry's release, the metrics' `service.version`. */
    val release: String? = null,
    /** `SENTRY_TRACES_SAMPLE_RATE`: the share of requests sent to Sentry as performance traces (0 to 1). */
    val tracesSampleRate: Double = 0.0,
    /** `OTEL_EXPORTER_OTLP_ENDPOINT`: the OTLP/HTTP base URL metrics are pushed to (`/v1/metrics` is added); null: none. */
    val otlpEndpoint: String? = null,
    /** `OTEL_EXPORTER_OTLP_HEADERS`: headers for the push (Grafana Cloud: `Authorization=Basic ...`). */
    val otlpHeaders: Map<String, String> = emptyMap(),
    /** `OTEL_SERVICE_INSTANCE_ID` (else `HOSTNAME`): tells instances apart, so two never overwrite each other's counters. */
    val instanceId: String? = null,
) {
    val metricsEnabled: Boolean get() = otlpEndpoint != null

    /** The secrets, never printed (data class toString would). */
    override fun toString(): String =
        "ObservabilityConfig(sentry=${sentryDsn != null}, environment=$environment, release=${release ?: "-"}, metrics=$metricsEnabled)"

    companion object {
        fun fromEnvironment(env: EnvReader, environment: String): ObservabilityConfig {
            val endpoint = env.str("OTEL_EXPORTER_OTLP_ENDPOINT")?.trimEnd('/')
            if (endpoint != null && runCatching { URI(endpoint).scheme }.getOrNull() !in setOf("http", "https")) {
                throw ConfigException("OTEL_EXPORTER_OTLP_ENDPOINT must be an http(s) URL.")
            }
            val rate = env.str("SENTRY_TRACES_SAMPLE_RATE")?.let { raw ->
                raw.toDoubleOrNull()?.takeIf { it in 0.0..1.0 }
                    ?: throw ConfigException("SENTRY_TRACES_SAMPLE_RATE must be a number from 0 to 1.")
            } ?: 0.0
            // Logback picks the appender by this exact value: any other spelling would leave the server with no logs.
            if (env.raw("LOG_FORMAT") !in setOf(null, "logfmt", "json")) throw ConfigException("LOG_FORMAT must be logfmt or json.")
            val dsn = env.str("SENTRY_DSN")
            if (dsn != null && !isDsn(dsn)) throw ConfigException("SENTRY_DSN is not a valid Sentry DSN.")
            return ObservabilityConfig(
                sentryDsn = dsn,
                environment = environment,
                release = env.str("APP_VERSION")?.takeIf { it != AppConfig.DEV_VERSION },
                tracesSampleRate = rate,
                otlpEndpoint = endpoint,
                otlpHeaders = parseHeaders(env.str("OTEL_EXPORTER_OTLP_HEADERS")),
                instanceId = env.str("OTEL_SERVICE_INSTANCE_ID") ?: env.str("HOSTNAME"),
            )
        }

        /** `https://<public key>@<host>/<project id>`, as Sentry shows it: anything else would fail inside the SDK. */
        private fun isDsn(raw: String): Boolean = runCatching { URI(raw) }.getOrNull()?.let { uri ->
            uri.scheme in setOf("http", "https") && !uri.userInfo.isNullOrEmpty() && !uri.host.isNullOrEmpty() &&
                uri.path.orEmpty().trimEnd('/').substringAfterLast('/').toLongOrNull() != null
        } ?: false

        /**
         * `key=value,key2=value2`, values percent-encoded as the OpenTelemetry spec says (Grafana Cloud's `Basic%20...`).
         * A `+` stays a `+`: it is part of a base64 token, not a space.
         */
        fun parseHeaders(raw: String?): Map<String, String> = raw.orEmpty().split(',').mapNotNull { pair ->
            val eq = pair.indexOf('=')
            if (eq <= 0) return@mapNotNull null
            val value = try {
                URLDecoder.decode(pair.substring(eq + 1).trim().replace("+", "%2B"), Charsets.UTF_8)
            } catch (_: IllegalArgumentException) {
                throw ConfigException("OTEL_EXPORTER_OTLP_HEADERS has a badly encoded value.")
            }
            pair.substring(0, eq).trim() to value
        }.toMap()
    }
}
