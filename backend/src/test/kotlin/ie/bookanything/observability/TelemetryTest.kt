package ie.bookanything.observability

import ie.bookanything.db.Db
import ie.bookanything.db.createDataSource
import ie.bookanything.http.Errors
import ie.bookanything.jobs.JobHandler
import ie.bookanything.jobs.JobQueue
import ie.bookanything.jobs.JobRunner
import ie.bookanything.jobs.JobWorker
import ie.bookanything.jobs.PeriodicTask
import ie.bookanything.module
import ie.bookanything.support.Api
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.RecordingPaymentProvider
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestDatabase
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.count
import ie.bookanything.support.s
import ie.bookanything.support.seriesOf
import ie.bookanything.support.tagValues
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import ie.bookanything.support.withTelemetry
import io.ktor.client.request.request
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.sql.Connection
import java.sql.SQLException
import java.sql.SQLTransientConnectionException
import java.time.Duration
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Metrics stay low-cardinality (docs/observability.md, "Cardinality") and failures reach the error reporter with safe tags. */
class TelemetryTest {
    private val uuid = Regex("[0-9a-f]{8}-[0-9a-f]{4}-")

    @Test
    fun `requests are labelled by route template, so a thousand ids are still one series per route`() = withTelemetry { registry, _ ->
        withApp { api ->
            val clinic = Fixtures.clinic(api)
            repeat(25) {
                api.get("/v1/public/manage/${unique("token")}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                api.get("/v1/businesses/${UUID.randomUUID()}/bookings", clinic.owner.token)
                api.get("/v1/businesses/${UUID.randomUUID()}/customers/${UUID.randomUUID()}", clinic.owner.token)
                api.get("/v1/no-such-route/${UUID.randomUUID()}")
                api.client.request("/v1/public/templates") { method = HttpMethod("BREW${it % 5}") }
            }
            api.get("/v1/health")
            api.get("/v1/me", clinic.owner.token)

            val routes = registry.tagValues("http.server.requests", "route")
            assertTrue("/v1/public/manage/{token}" in routes, routes.toString())
            assertTrue("/v1/businesses/{businessId}/bookings" in routes, routes.toString())
            assertTrue(RouteLabels.UNMATCHED in routes, routes.toString())
            assertTrue(routes.none { uuid.containsMatchIn(it) || "token-" in it || "no-such-route" in it }, routes.toString())
            val methods = registry.tagValues("http.server.requests", "method")
            assertTrue("OTHER" in methods && methods.all { it in setOf("GET", "POST", "PUT", "PATCH", "DELETE", "OTHER") }, "$methods")
            assertTrue(registry.tagValues("http.server.requests", "status").all { it in setOf("2xx", "3xx", "4xx", "5xx") })
            // 125 differently addressed requests to four routes and a strange method: a handful of series, not 125.
            val perRoute = registry.find("http.server.requests").meters().groupBy { it.id.getTag("route") }.mapValues { it.value.size }
            assertEquals(1, perRoute["/v1/public/manage/{token}"])
            assertEquals(2, perRoute[RouteLabels.UNMATCHED], "GET and the strange methods")
            assertEquals(
                setOf("public", "dashboard", "health", "account", "unmatched"),
                registry.tagValues("http.server.duration", "area"),
            )
            // Every series carries the environment, and nothing else is per request.
            assertTrue(registry.meters.all { it.id.getTag("env") == "test" })
        }
    }

    @Test
    fun `route areas group the API into a few latency histograms`() {
        val areas = mapOf(
            "/v1/health" to "health", "/v1/public/businesses/{slug}" to "public", "/v1/ai/business-draft" to "ai",
            "/v1/businesses/{businessId}/assistant/threads" to "ai", "/v1/businesses/{businessId}/site/ai/generate" to "ai",
            "/v1/businesses/{businessId}/bookings" to "dashboard", "/v1/mcp/customer" to "mcp", "/v1/oauth/token" to "oauth",
            "/.well-known/oauth-authorization-server" to "oauth", "/v1/webhooks/stripe" to "webhooks", "/v1/me" to "account",
            RouteLabels.UNMATCHED to "unmatched",
        )
        areas.forEach { (route, area) -> assertEquals(area, RouteLabels.area(route), route) }
        assertEquals("unknown", AppMetrics.statusClass(null))
        assertEquals("unknown", AppMetrics.statusClass(700))
        assertEquals("3xx", AppMetrics.statusClass(302))
    }

    @Test
    fun `rare events are registered at 0, so their first occurrence is an increase`() = withTelemetry { registry, _ ->
        Telemetry.metrics.registerAtZero(listOf("notify"))
        assertEquals(setOf("confirmed", "held", "pending_approval"), registry.tagValues("bookings.created", "outcome"))
        assertEquals(AppMetrics.HoldOutcome.entries.map { it.label }.toSet(), registry.tagValues("booking.holds", "outcome"))
        assertEquals(setOf("done", "retry", "failed"), registry.tagValues("jobs.runs", "result"))
        assertEquals(0.0, registry.find("payments.refunds.failed").counter()!!.count())
    }

    @Test
    fun `with traces sampled each request is traced under its route template and status`() = withTelemetry(tracing = true) { _, errors ->
        withApp { api ->
            api.get("/v1/health")
            api.get("/v1/public/manage/${unique("token")}")
        }
        assertEquals(listOf("GET /v1/health" to 200, "GET /v1/public/manage/{token}" to 404), errors.traces.toList())
    }

    @Test
    fun `bookings and holds are counted by outcome once their transaction commits`() = withTelemetry { registry, _ ->
        val env = TestEnv(payments = RecordingPaymentProvider())
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            Fixtures.book(api, clinic, "Consult", "2026-10-07T10:00:00+01:00")
            Money.book(api, clinic, "Approval consult", "2026-10-07T13:00:00+01:00")
            Money.paidBooking(api, clinic, "Paid consult", "2026-10-08T10:00:00+01:00")
            Money.pay(api, Money.book(api, clinic, "Paid consult", "2026-10-08T11:00:00+01:00"), outcome = "cancelled")
            Money.book(api, clinic, "Paid consult", "2026-10-08T12:00:00+01:00")
            // A slot that is taken is refused: nothing was booked, so nothing is counted.
            api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Paid consult", "2026-10-08T10:00:00+01:00"))

            env.clock.advanceMinutes(45)
            env.db.txBlocking { env.ctx.booking.lifecycle.expireHolds(it, env.clock.instant()) }

            assertEquals(1.0, registry.count("bookings.created", "outcome", "confirmed"))
            assertEquals(1.0, registry.count("bookings.created", "outcome", "pending_approval"))
            assertEquals(3.0, registry.count("bookings.created", "outcome", "held"))
            assertEquals(1.0, registry.count("booking.holds", "outcome", "paid"))
            assertEquals(1.0, registry.count("booking.holds", "outcome", "abandoned"))
            assertTrue(registry.count("booking.holds", "outcome", "expired") >= 1.0)
        }
    }

    @Test
    fun `a 500 and a failing provider are reported with the request id, business and route, never the path`() =
        withTelemetry { registry, errors ->
            testApplication {
                application {
                    module(TestEnv().ctx)
                    routing {
                        get("/v1/test/boom/{token}") { error("boom") }
                        get("/v1/test/provider") { throw Errors.providerError() }
                        get("/v1/test/not-configured") { throw Errors.aiNotConfigured() }
                        get("/v1/test/pool-timeout") { throw SQLTransientConnectionException("pool exhausted") }
                        get("/v1/test/connection-lost") { throw SQLException("connection lost", "08006") }
                    }
                }
                val api = Api(client)
                api.client.request("/v1/test/boom/secret-value") { headers.append("X-Request-Id", "req-12345678") }
                api.get("/v1/test/provider")
                api.get("/v1/test/not-configured")
                assertEquals(HttpStatusCode.ServiceUnavailable, api.get("/v1/test/pool-timeout").status)
                assertEquals(HttpStatusCode.ServiceUnavailable, api.get("/v1/test/connection-lost").status)

                val (crash, provider) = errors.reports.toList()
                assertEquals("boom", crash.error?.message)
                assertEquals(
                    mapOf("requestId" to "req-12345678", "route" to "/v1/test/boom/{token}", "method" to "GET"),
                    crash.tags,
                )
                assertEquals("502 PAYMENT_PROVIDER_ERROR", provider.message)
                assertEquals(
                    listOf("pool exhausted", "connection lost"), errors.reports.drop(2).map { it.error?.message },
                    "the database being unreachable is reported; a feature that isn't configured is not an error",
                )
                assertEquals(1.0, registry.count("http.server.requests", "route", "/v1/test/boom/{token}", "status", "5xx"))
            }
        }

    @Test
    fun `a job out of attempts is reported once, with its kind and business, and every attempt is counted`() =
        withTelemetry { registry, errors ->
            val env = TestEnv()
            val kind = unique("doomed")
            val businessId = UUID.randomUUID().toString()
            val id = env.db.txBlocking {
                JobQueue.enqueue(it, kind, JsonObject(mapOf("businessId" to JsonPrimitive(businessId))), maxAttempts = 2)
            }
            val failing = JobHandler { error("provider down") }
            repeat(2) { _ ->
                Fixtures.sql("UPDATE jobs SET run_at = now() WHERE id = ?", id)
                JobRunner.run(env.db, env.db.txBlocking { JobQueue.claimById(it, id, "worker") }!!, failing)
            }
            assertEquals(1.0, registry.count("jobs.runs", "kind", kind, "result", "retry"))
            assertEquals(1.0, registry.count("jobs.runs", "kind", kind, "result", "failed"))
            val report = errors.reports.single()
            assertEquals("provider down", report.error?.message)
            val expected = mapOf("job.kind" to kind, "job.id" to id.toString(), "job.attempts" to "2", "businessId" to businessId)
            assertEquals(expected, report.tags)
        }

    @Test
    fun `a failing periodic task and a queue sampler that can't read the queue are reported, and the rest carries on`() =
        withTelemetry { _, errors ->
            val env = TestEnv()
            val broken = PeriodicTask("broken-task", Duration.ofHours(1)) { error("task broke") }
            JobWorker(env.ctx, extraTasks = listOf(broken)).runPeriodic(force = true)
            val down = Db(object : DataSource by TestDatabase.dataSource {
                override fun getConnection(): Connection = throw SQLException("database down")
            })
            JobQueueGauges(down, SimpleMeterRegistry()).sample()
            assertEquals(
                listOf(mapOf("task" to "broken-task") to "task broke", mapOf("task" to "job-queue-gauges") to "database down"),
                // The real periodic tasks ran too (forced); only these two are ours to check.
                errors.reports.filter { it.tags["task"] in setOf("broken-task", "job-queue-gauges") }.map { it.tags to it.error?.message },
            )
        }

    @Test
    fun `the queue gauges show due jobs and the oldest one's wait by kind, and read 0 once drained`() = withTelemetry { registry, _ ->
        val env = TestEnv()
        val kind = unique("gauged")
        val gauges = JobQueueGauges(env.db, registry)
        val ids = env.db.txBlocking { conn -> (1..3).map { JobQueue.enqueue(conn, kind, JsonObject(emptyMap())) } }
        Fixtures.sql("UPDATE jobs SET run_at = now() - interval '90 seconds' WHERE id = ?", ids.first())
        gauges.refresh()
        assertEquals(3.0, registry.find("jobs.queue.depth").tag("kind", kind).gauge()!!.value())
        assertTrue(registry.find("jobs.queue.oldest.age").tag("kind", kind).gauge()!!.value() >= 89.0)

        env.db.txBlocking { conn -> ids.forEach { JobQueue.complete(conn, it) } }
        gauges.refresh()
        assertEquals(0.0, registry.find("jobs.queue.depth").tag("kind", kind).gauge()!!.value())
        assertEquals(0.0, registry.find("jobs.queue.oldest.age").tag("kind", kind).gauge()!!.value())
    }

    /**
     * The cardinality budget (docs/observability.md): one instance with the JVM, the pool, the queue gauges and a day's
     * worth of different requests stays at a few hundred series (191 when this was written), well inside the metrics
     * plan's 10,000.
     */
    @Test
    fun `one instance stays within its series budget`() = withTelemetry { registry, _ ->
        val jvm = Observability.bindJvm(registry)
        // The pool's meters go when it closes, so count while it is open.
        createDataSource(TestConfig.config().database.copy(poolSize = 2), registry).use { pool ->
            pool.connection.use { }
            val env = TestEnv(payments = RecordingPaymentProvider())
            withApp(env) { api -> busyDay(api) }
            JobQueueGauges(env.db, registry).refresh()

            val http = seriesOf(registry, "http.")
            val total = seriesOf(registry)
            val breakdown = "HTTP $http, JVM ${seriesOf(registry, "jvm.")}, pool ${seriesOf(registry, "hikaricp.")}"
            assertTrue(http <= HTTP_BUDGET, "HTTP series: $http")
            assertTrue(total <= INSTANCE_BUDGET, "series: $total ($breakdown)")
        }
        jvm.forEach { it.close() }
    }

    /** The dashboard, the public booking flow and the account pages, each a few times with different ids. */
    private suspend fun ApplicationTestBuilder.busyDay(api: Api) {
        repeat(3) {
            val clinic = Fixtures.clinic(api, TestUser.create("owner"))
            val booking = Fixtures.book(api, clinic, "Consult", "2026-10-0${6 + it}T10:00:00+01:00")
            Money.paidBooking(api, clinic, "Paid consult", "2026-10-0${6 + it}T14:00:00+01:00")
            listOf("bookings", "customers", "services", "resources", "team", "reports/summary?from=2026-10-01&to=2026-10-31")
                .forEach { path -> api.get("${clinic.base}/$path", clinic.owner.token) }
            api.get("/v1/public/manage/${booking.s("manageToken")}")
            api.get("${clinic.public}/services")
            api.get("/v1/me", clinic.owner.token)
            api.get("/v1/me/bookings", clinic.owner.token)
            api.get("/v1/no-such-route-$it")
        }
        api.get("/v1/health")
    }

    private companion object {
        const val HTTP_BUDGET = 200
        const val INSTANCE_BUDGET = 300
    }
}
