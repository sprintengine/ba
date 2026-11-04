package ie.bookanything.observability

import io.sentry.SentryEvent
import io.sentry.SentryOptions
import io.sentry.protocol.SentryTransaction
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/** The real SDK, with every report stopped (and kept) after scrubbing, so nothing leaves the machine. */
class SentryErrorReporterTest {
    private val events = CopyOnWriteArrayList<SentryEvent>()
    private val transactions = CopyOnWriteArrayList<SentryTransaction>()

    private fun start(tracesSampleRate: Double = 0.0) = SentryErrorReporter.start(
        ObservabilityConfig(
            sentryDsn = "https://public@example.invalid/1", environment = "staging", release = "abc1234",
            tracesSampleRate = tracesSampleRate,
        ),
    ) { options ->
        val scrub = options.beforeSend!!
        options.beforeSend = SentryOptions.BeforeSendCallback { event, hint -> events += scrub.execute(event, hint)!!; null }
        val scrubTransaction = options.beforeSendTransaction!!
        options.beforeSendTransaction = SentryOptions.BeforeSendTransactionCallback { tx, hint ->
            transactions += scrubTransaction.execute(tx, hint)!!
            null
        }
        assertEquals(false, options.dataCollection.userInfo)
    }

    @Test
    fun `exceptions and messages go out scrubbed, with tags, environment and release`() {
        start().use { reporter ->
            reporter.capture(IllegalStateException("no customer jordan@example.test"), mapOf("requestId" to "req-1", "businessId" to "b-1"))
            reporter.message("502 PAYMENT_PROVIDER_ERROR", mapOf("route" to "/v1/public/businesses/{slug}/bookings"))
            assertNull(reporter.startTrace("GET /v1/health", emptyMap()), "no traces at the default sample rate")
        }
        val (error, message) = events.toList()
        assertEquals("no customer [email]", error.exceptions!!.single().value)
        assertEquals(mapOf("requestId" to "req-1", "businessId" to "b-1"), error.tags)
        assertEquals("staging" to "abc1234", error.environment to error.release)
        assertEquals("502 PAYMENT_PROVIDER_ERROR", message.message!!.formatted ?: message.message!!.message)
        assertEquals("/v1/public/businesses/{slug}/bookings", message.getTag("route"))
        assertNull(error.serverName)
    }

    @Test
    fun `with traces sampled each request is a transaction named after its route template`() {
        start(tracesSampleRate = 1.0).use { reporter ->
            assertNotNull(reporter.startTrace("GET /v1/businesses/{businessId}/bookings", mapOf("area" to "dashboard"))).finish(200)
            assertNotNull(reporter.startTrace("GET /v1/health", emptyMap())).finish(null)
        }
        assertEquals(listOf("GET /v1/businesses/{businessId}/bookings", "GET /v1/health"), transactions.map { it.transaction })
        assertEquals("dashboard", transactions.first().getTag("area"))
    }
}
