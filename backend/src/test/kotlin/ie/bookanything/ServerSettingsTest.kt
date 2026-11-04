package ie.bookanything

import ie.bookanything.support.TestConfig
import io.ktor.server.engine.ApplicationEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** How the server listens and stops: a deploy's SIGTERM must leave requests in flight time to finish. */
class ServerSettingsTest {
    @Test
    fun `listens where configured and stops gracefully within the container's grace period`() {
        val config = TestConfig.config().copy(host = "127.0.0.1", port = 8123)
        val engine = ApplicationEngine.Configuration().apply { serverSettings(config) }
        val connector = engine.connectors.single()
        assertEquals("127.0.0.1", connector.host)
        assertEquals(8123, connector.port)
        assertEquals(SHUTDOWN_GRACE_MILLIS, engine.shutdownGracePeriod)
        assertEquals(SHUTDOWN_TIMEOUT_MILLIS, engine.shutdownTimeout)
        // deploy/server/compose.yml says how long a stopping container has before Docker kills it.
        val compose = java.io.File("../deploy/server/compose.yml").readText()
        val graceSeconds = Regex("""stop_grace_period: (\d+)s""").find(compose)!!.groupValues[1].toLong()
        assertTrue(SHUTDOWN_GRACE_MILLIS + SHUTDOWN_TIMEOUT_MILLIS < graceSeconds * 1_000, "the server must stop before the kill")
    }
}
