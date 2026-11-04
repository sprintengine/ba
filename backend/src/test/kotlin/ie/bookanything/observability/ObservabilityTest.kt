package ie.bookanything.observability

import ch.qos.logback.classic.LoggerContext
import ch.qos.logback.classic.joran.JoranConfigurator
import ie.bookanything.config.AppConfig
import ie.bookanything.config.ConfigException
import ie.bookanything.config.EnvReader
import ie.bookanything.support.LocalHttpServer
import io.micrometer.core.instrument.composite.CompositeMeterRegistry
import io.micrometer.registry.otlp.OtlpMeterRegistry
import io.sentry.SentryEvent
import io.sentry.protocol.Message
import io.sentry.protocol.SentryException
import java.io.ByteArrayOutputStream
import java.io.PrintStream
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class ObservabilityTest {
    private val base = mapOf("APP_ENV" to "development")

    private fun config(vararg env: Pair<String, String>) = AppConfig.fromEnvironment(base + env).observability

    @Test
    fun `everything is off without its variables, and the environment comes from APP_ENV`() {
        val off = config()
        assertNull(off.sentryDsn)
        assertFalse(off.metricsEnabled)
        assertEquals(0.0, off.tracesSampleRate)
        assertEquals("development", off.environment)
        assertEquals("production", ObservabilityConfig.fromEnvironment(EnvReader(emptyMap()), "production").environment)
    }

    @Test
    fun `variables switch Sentry and the metrics push on, and the secrets never print`() {
        val on = config(
            "SENTRY_DSN" to "https://public@example.invalid/1", "APP_VERSION" to "0.4.0-nightly.20261104.17",
            "SENTRY_TRACES_SAMPLE_RATE" to "0.1",
            "OTEL_EXPORTER_OTLP_ENDPOINT" to "https://otlp.example.test/otlp/",
            "OTEL_EXPORTER_OTLP_HEADERS" to "Authorization=Basic%20dXNlcjp0b2tlbg+/=,X-Scope=a", "HOSTNAME" to "container-1",
            "LOG_FORMAT" to "json",
        )
        assertEquals("https://otlp.example.test/otlp", on.otlpEndpoint)
        assertEquals(mapOf("Authorization" to "Basic dXNlcjp0b2tlbg+/=", "X-Scope" to "a"), on.otlpHeaders)
        assertEquals("0.4.0-nightly.20261104.17", on.release)
        assertNull(config("APP_VERSION" to "dev").release, "a development build is no release")
        assertEquals(0.1, on.tracesSampleRate)
        assertEquals("container-1", on.instanceId)
        assertFalse("dXNlcjp0b2tlbg" in on.toString() || "public@" in on.toString(), on.toString())
        assertEquals("instance-a", config("OTEL_SERVICE_INSTANCE_ID" to "instance-a", "HOSTNAME" to "h").instanceId)
    }

    @Test
    fun `bad values refuse to start`() {
        listOf(
            "OTEL_EXPORTER_OTLP_ENDPOINT" to "otlp.example.test", "SENTRY_TRACES_SAMPLE_RATE" to "2",
            "SENTRY_TRACES_SAMPLE_RATE" to "often", "OTEL_EXPORTER_OTLP_HEADERS" to "Authorization=%zz",
            "SENTRY_DSN" to "not a dsn",
            // Logback matches the appender name exactly: these would leave the server without logs.
            "LOG_FORMAT" to "xml", "LOG_FORMAT" to "JSON", "LOG_FORMAT" to " json", "LOG_FORMAT" to "",
        ).forEach { setting -> assertFailsWith<ConfigException>(setting.toString()) { config(setting) } }
        assertEquals(emptyMap(), ObservabilityConfig.parseHeaders("=x,novalue"))
    }

    @Test
    fun `without configuration metrics go nowhere and errors are not reported`() {
        Observability.start(ObservabilityConfig()).use { obs ->
            assertIs<CompositeMeterRegistry>(obs.registry)
            assertSame(ErrorReporter.NONE, obs.errors)
            assertSame(obs.metrics, Telemetry.metrics)
            obs.metrics.request("/v1/health", "GET", 200, Duration.ofMillis(5))
            ErrorReporter.NONE.capture(IllegalStateException("x"))
            ErrorReporter.NONE.message("x")
            assertNull(ErrorReporter.NONE.startTrace("x", emptyMap()))
        }
    }

    @Test
    fun `metrics are pushed over OTLP with the configured headers and resource, and flushed on close`() {
        LocalHttpServer { LocalHttpServer.Response(200, "", "application/x-protobuf") }.use { server ->
            val config = ObservabilityConfig(
                environment = "staging", release = "abc1234", instanceId = "api-1", otlpEndpoint = server.baseUrl,
                otlpHeaders = mapOf("Authorization" to "Basic dGVzdA=="),
            )
            val obs = Observability.start(config)
            try {
                assertIs<OtlpMeterRegistry>(obs.registry)
                obs.metrics.bookingCreated("confirmed")
                assertTrue(obs.registry.find("jvm.memory.used").meters().isNotEmpty())
            } finally {
                obs.close()
                Telemetry.install(AppMetrics.none(), ErrorReporter.NONE)
            }
            // The push on close (a scheduled one may come first, if the minute turned during the test).
            val push = server.requests.last()
            assertEquals("POST" to "/v1/metrics", push.method to push.path)
            assertEquals("Basic dGVzdA==", push.headers["authorization"])
            val body = String(push.body, Charsets.ISO_8859_1)
            listOf("bookanything-api", "staging", "abc1234", "api-1", "bookings.created").forEach { assertContains(body, it) }
        }
    }

    @Test
    fun `the throttle passes the first reports of each failure per window and drops the rest`() {
        var now = Instant.parse("2026-10-05T08:00:00Z")
        val clock = object : Clock() {
            override fun getZone() = ZoneOffset.UTC
            override fun withZone(zone: java.time.ZoneId?) = this
            override fun instant() = now
        }
        val recorded = ie.bookanything.support.RecordingErrorReporter()
        val throttled = ThrottledErrorReporter(recorded, limit = 2, window = Duration.ofMinutes(10), clock = clock)
        fun fail(): Throwable = IllegalStateException("database down")
        repeat(5) { throttled.capture(fail()) }
        repeat(3) { throttled.message("502 PAYMENT_PROVIDER_ERROR") }
        throttled.capture(IllegalArgumentException("another failure"))
        assertEquals(5, recorded.reports.size)
        now = now.plus(Duration.ofMinutes(10))
        throttled.capture(fail())
        assertEquals(6, recorded.reports.size)
        assertNull(throttled.startTrace("GET /v1/health", emptyMap()))
        throttled.close()
    }

    @Test
    fun `the throttle tells failures apart by where our code threw them, not by the library frame they share`() {
        val recorded = ie.bookanything.support.RecordingErrorReporter()
        val throttled = ThrottledErrorReporter(recorded, limit = 1)
        fun driverError(caller: String) = IllegalStateException("driver").apply {
            stackTrace = arrayOf(
                StackTraceElement("org.postgresql.core.QueryExecutor", "receive", "QueryExecutor.java", 1),
                StackTraceElement("ie.bookanything.$caller", "run", "$caller.kt", 10),
            )
        }
        repeat(3) { throttled.capture(driverError("BookingRepository")) }
        throttled.capture(driverError("CustomerRepository"))
        throttled.capture(IllegalStateException("no frames").apply { stackTrace = emptyArray() })
        assertEquals(3, recorded.reports.size)
    }

    @Test
    fun `reports lose personal data and bearer secrets before they leave`() {
        val event = SentryEvent().apply {
            message = Message().apply {
                message = "booking for jordan.casey@example.test on +353 87 123 4567"
                formatted = "GET /v1/public/manage/s3cr3tToken failed"
                params = listOf("jordan.casey@example.test")
            }
            exceptions = listOf(
                SentryException().apply {
                    value = "ERROR: duplicate key value violates unique constraint \"customers_email\"\n" +
                        "  Detail: Key (business_id, email)=(1, jordan@example.test) already exists.\n" +
                        "  Where: SQL statement; see /v1/invitations/abc?token=xyz&x=1 for 0871234567, booking 2026-10-05"
                },
            )
            user = io.sentry.protocol.User().apply { email = "jordan@example.test" }
            serverName = "build-box"
        }
        val scrubbed = SentryScrubber.scrub(event)
        assertEquals("booking for [email] on [number]", scrubbed.message?.message)
        assertEquals("GET /v1/public/manage/[redacted]", scrubbed.message?.formatted)
        assertNull(scrubbed.message?.params)
        assertEquals("ERROR: duplicate key value violates unique constraint \"customers_email\"", scrubbed.exceptions?.single()?.value)
        assertNull(scrubbed.user)
        assertNull(scrubbed.serverName)
        assertEquals("see /v1/invitations/[redacted]", SentryScrubber.text("see /v1/invitations/abc?token=xyz"))
        assertEquals("open ?token=[redacted]&x=1 at 2026-10-05", SentryScrubber.text("open ?token=xyz&x=1 at 2026-10-05"))
        assertEquals("id 3f2b9c1e-1234-4abc-9def-123456789012", SentryScrubber.text("id 3f2b9c1e-1234-4abc-9def-123456789012"))
        assertEquals(
            "GET /geocode?access_token=[redacted]&api_key=[redacted]&client_secret=[redacted]&limit=1",
            SentryScrubber.text("GET /geocode?access_token=pk.abc&api_key=k1&client_secret=s2&limit=1"),
        )
        assertEquals(
            "Unexpected JSON token at offset 12",
            SentryScrubber.text("Unexpected JSON token at offset 12\nJSON input: {\"name\":\"Jordan Casey\"}"),
        )
    }

    @Test
    fun `LOG_FORMAT=json writes one JSON object per line with the request id`() {
        val line = logLine("json")
        assertTrue(line.startsWith("{") && "\"level\":\"INFO\"" in line, line)
        assertContains(line, "\"formattedMessage\":\"booked BK-1\"")
        assertContains(line, "\"requestId\":\"req-12345678\"")
    }

    @Test
    fun `logs are logfmt lines by default`() {
        val line = logLine(null)
        assertTrue(line.startsWith("ts=") && " level=INFO " in line && " requestId=req-12345678 " in line, line)
        assertContains(line, "msg=\"booked BK-1\"")
    }

    /** One line logged through the production logback.xml with [format] as LOG_FORMAT (logback reads system properties too). */
    private fun logLine(format: String?): String {
        val out = ByteArrayOutputStream()
        val previous = System.out
        if (format != null) System.setProperty("LOG_FORMAT", format)
        val context = LoggerContext().apply { mdcAdapter = org.slf4j.MDC.getMDCAdapter() }
        try {
            System.setOut(PrintStream(out, true, Charsets.UTF_8))
            JoranConfigurator().apply { setContext(context) }.doConfigure(javaClass.getResource("/logback.xml")!!)
            org.slf4j.MDC.put("requestId", "req-12345678")
            context.getLogger("ie.bookanything.Test").info("booked {}", "BK-1")
        } finally {
            org.slf4j.MDC.remove("requestId")
            System.setOut(previous)
            System.clearProperty("LOG_FORMAT")
            context.stop()
        }
        return out.toString(Charsets.UTF_8).trim().lines().last()
    }
}
