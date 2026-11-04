package ie.bookanything.db

import ie.bookanything.config.DatabaseConfig
import ie.bookanything.support.TestDatabase
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.assertThrows
import java.sql.SQLException
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class TransactionsTest {
    /** A pool of one connection, so the test sees whether the read-only flag outlives its transaction. */
    private val dataSource = createDataSource(DatabaseConfig(TestDatabase.jdbcUrl, TestDatabase.username, TestDatabase.password, 1))
    private val db = Db(dataSource)

    @AfterTest
    fun close() = dataSource.close()

    @Test
    fun `reads run in a read-only transaction and leave the connection writable`() = runBlocking {
        val refused = assertThrows<SQLException> { db.read { it.update("CREATE TEMP TABLE read_only_probe (id int)") } }
        assertEquals("25006", refused.sqlState, "read_only_sql_transaction")
        assertEquals("on", db.read { conn -> conn.queryOne("SELECT current_setting('transaction_read_only')") { it.getString(1) } })

        assertEquals("off", db.tx { conn -> conn.queryOne("SELECT current_setting('transaction_read_only')") { it.getString(1) } })
        db.tx { it.update("CREATE TEMP TABLE writable_probe (id int)") }
        assertFalse(db.dataSource.connection.use { it.isReadOnly })
    }

    @Test
    fun `after-commit actions run once the transaction committed and its connection is free, never after a rollback`() {
        val ran = mutableListOf<String>()
        val result = db.txBlocking { conn ->
            conn.update("CREATE TEMP TABLE IF NOT EXISTS after_commit_probe (v text)")
            conn.update("INSERT INTO after_commit_probe VALUES ('committed')")
            // The pool has one connection: the action can only open its own transaction once this one has given it back.
            conn.afterCommit {
                ran += db.txBlocking { c -> c.queryOne("SELECT count(*) FROM after_commit_probe") { "seen ${it.getInt(1)}" } }!!
            }
            assertEquals(emptyList(), ran, "not while the transaction is open")
            "result"
        }
        assertEquals("result", result)
        assertEquals(listOf("seen 1"), ran)

        assertThrows<IllegalStateException> {
            db.txBlocking { conn ->
                conn.afterCommit { ran += "rolled back" }
                error("fails")
            }
        }
        assertEquals(listOf("seen 1"), ran)
    }

    @Test
    fun `a savepoint that rolls back drops its after-commit actions, and a failing action leaves the commit alone`() {
        val ran = mutableListOf<String>()
        db.txBlocking { conn ->
            conn.afterCommit { ran += "before" }
            runCatching { conn.savepoint { conn.afterCommit { ran += "inside" }; error("tool failed") } }
            conn.savepoint { conn.afterCommit { ran += "kept" } }
            conn.afterCommit { error("action failed") }
            conn.afterCommit { ran += "after" }
        }
        assertEquals(listOf("before", "kept", "after"), ran)
    }

    @Test
    fun `afterCommit refuses a connection that is not in a Db transaction`() {
        dataSource.connection.use { conn -> assertThrows<IllegalStateException> { conn.afterCommit { } } }
    }
}
