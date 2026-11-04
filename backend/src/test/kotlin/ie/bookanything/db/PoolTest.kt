package ie.bookanything.db

import ie.bookanything.config.DatabaseConfig
import ie.bookanything.support.TestDatabase
import java.sql.Connection
import java.sql.SQLTransientConnectionException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * The pool against a real Postgres: when every connection is taken a caller waits `connectionTimeout` (5 s) and then
 * gets [SQLTransientConnectionException], which the API answers with 503 DATABASE_UNAVAILABLE (TelemetryTest); and a
 * connection Postgres closed is replaced, not handed out.
 */
class PoolTest {
    private val config = DatabaseConfig(TestDatabase.jdbcUrl, TestDatabase.username, TestDatabase.password, 2)

    private fun Connection.pid(): Int = queryOne("SELECT pg_backend_pid()") { it.getInt(1) }!!

    @Test
    fun `a caller waits for a full pool, then gets a transient error`() {
        createDataSource(config).use { ds ->
            ds.connection.use {
                ds.connection.use {
                    val started = System.nanoTime()
                    assertFailsWith<SQLTransientConnectionException> { ds.connection.close() }
                    val waitedMs = (System.nanoTime() - started) / 1_000_000
                    assertTrue(waitedMs in 4_500..15_000, "waited $waitedMs ms")
                }
            }
            // Released connections serve the next caller.
            ds.connection.use { assertEquals(1, it.queryOne("SELECT 1") { r -> r.getInt(1) }) }
        }
    }

    @Test
    fun `a connection Postgres ended is replaced`() {
        createDataSource(config).use { ds ->
            val idle = ds.connection
            val ended = ds.connection.use { other ->
                val pid = idle.pid()
                idle.close() // back to the pool, idle
                assertEquals(true, other.queryOne("SELECT pg_terminate_backend(?)", pid) { it.getBoolean(1) })
                pid
            }
            // Past Hikari's half-second bypass window, an idle connection is checked before it is handed out.
            Thread.sleep(SETTLE_MS)
            ds.connection.use { first ->
                ds.connection.use { second ->
                    assertNotEquals(ended, first.pid())
                    assertNotEquals(ended, second.pid())
                }
            }
        }
    }

    private companion object {
        const val SETTLE_MS = 1_000L
    }
}
