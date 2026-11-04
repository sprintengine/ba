package ie.bookanything.db

import ie.bookanything.config.DatabaseConfig
import ie.bookanything.config.EnvReader
import ie.bookanything.support.TestDatabase
import java.sql.SQLException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** Pooled connections bound runaway statements and transactions left open; migrations are exempt. */
class TimeoutsTest {
    private fun show(db: Db, setting: String): String = db.txBlocking { conn -> conn.queryOne("SHOW $setting") { it.getString(1) }!! }

    @Test
    fun `the timeouts come from the environment, with defaults`() {
        val defaults = DatabaseConfig.fromEnvironment(EnvReader(emptyMap()), dev = true)
        assertEquals(60, defaults.statementTimeoutSeconds)
        assertEquals(120, defaults.idleInTransactionTimeoutSeconds)
        val set = DatabaseConfig.fromEnvironment(
            EnvReader(mapOf("DATABASE_STATEMENT_TIMEOUT_SECONDS" to "15", "DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_SECONDS" to "0")),
            dev = true,
        )
        assertEquals(15 to 0, set.statementTimeoutSeconds to set.idleInTransactionTimeoutSeconds)
    }

    @Test
    fun `every pooled connection has them, a slow statement is cancelled and migrating leaves them in place`() {
        val config = DatabaseConfig(
            TestDatabase.jdbcUrl, TestDatabase.username, TestDatabase.password, 2, statementTimeoutSeconds = 1,
            idleInTransactionTimeoutSeconds = 30,
        )
        createDataSource(config).use { ds ->
            val db = Db(ds)
            assertEquals("1s", show(db, "statement_timeout"))
            assertEquals("30s", show(db, "idle_in_transaction_session_timeout"))
            val e = assertFailsWith<SQLException> { db.txBlocking { conn -> conn.queryOne("SELECT pg_sleep(3)") { } } }
            assertEquals("57014", e.sqlState) // query_canceled
            Migrations.migrate(ds)
            assertEquals("1s", show(db, "statement_timeout"))
        }
    }
}
