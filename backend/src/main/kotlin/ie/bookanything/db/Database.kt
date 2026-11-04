package ie.bookanything.db

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import ie.bookanything.config.DatabaseConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import liquibase.Scope
import liquibase.command.CommandScope
import liquibase.command.core.UpdateCommandStep
import liquibase.command.core.helpers.DbUrlConnectionArgumentsCommandStep
import liquibase.database.DatabaseFactory
import liquibase.database.jvm.JdbcConnection
import liquibase.ui.LoggerUIService
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.sql.SQLException
import java.util.Collections
import java.util.IdentityHashMap
import java.util.UUID
import javax.sql.DataSource

fun createDataSource(config: DatabaseConfig): HikariDataSource {
    val hikari = HikariConfig().apply {
        jdbcUrl = config.jdbcUrl
        config.username?.let { username = it }
        config.password?.let { password = it }
        maximumPoolSize = config.poolSize
        poolName = "bookanything"
        driverClassName = "org.postgresql.Driver"
        isAutoCommit = true
        // Start even when the database is briefly unavailable; /v1/health reports it.
        initializationFailTimeout = -1
        connectionTimeout = 5_000
        // Bounds on a runaway statement and on a transaction left open (locks held) while the app waits on something
        // else, such as a provider call: Postgres ends either rather than letting it block other requests.
        connectionInitSql = "SELECT set_config('statement_timeout', '${config.statementTimeoutSeconds}s', false), " +
            "set_config('idle_in_transaction_session_timeout', '${config.idleInTransactionTimeoutSeconds}s', false)"
        validate()
    }
    return HikariDataSource(hikari)
}

object Migrations {
    const val CHANGELOG = "db/changelog/db.changelog-master.sql"

    /** Strong reference: java.util.logging only keeps weak references to configured loggers. */
    private val liquibaseLogger: java.util.logging.Logger = java.util.logging.Logger.getLogger("liquibase")

    fun migrate(dataSource: DataSource) {
        System.setProperty("liquibase.analytics.enabled", "false")
        System.setProperty("liquibase.showBanner", "false")
        // Liquibase logs through java.util.logging and prints progress to stdout; keep both quiet.
        System.setProperty("liquibase.logLevel", "WARNING")
        liquibaseLogger.level = java.util.logging.Level.WARNING
        dataSource.connection.use { connection ->
            // A migration may build an index over a big table: no statement timeout for it, restored before the
            // connection goes back to the pool.
            val timeout = connection.queryOne("SHOW statement_timeout") { it.getString(1) }
            connection.update("SET statement_timeout = 0")
            try {
                update(connection)
            } finally {
                // Liquibase may leave a transaction open, which the pool would roll back with the setting.
                connection.autoCommit = true
                connection.queryOne("SELECT set_config('statement_timeout', ?, false)", timeout) { }
            }
        }
    }

    private fun update(connection: Connection) {
        val database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(JdbcConnection(connection))
        Scope.child(mapOf(Scope.Attr.ui.name to LoggerUIService())) {
            CommandScope(*UpdateCommandStep.COMMAND_NAME)
                .addArgumentValue(DbUrlConnectionArgumentsCommandStep.DATABASE_ARG, database)
                .addArgumentValue(UpdateCommandStep.CHANGELOG_FILE_ARG, CHANGELOG)
                .addArgumentValue(
                    liquibase.command.core.helpers.ShowSummaryArgument.SHOW_SUMMARY_OUTPUT, liquibase.UpdateSummaryOutputEnum.LOG,
                )
                .execute()
        }
    }
}

/**
 * Thin transaction helper around a DataSource. All SQL is explicit; there is no ORM.
 * Blocking JDBC work runs on Dispatchers.IO when called from coroutines.
 */
class Db(val dataSource: DataSource) {
    private val log = LoggerFactory.getLogger(Db::class.java)

    /**
     * Runs [block] in a transaction. When [businessId] is given, RLS is scoped to that tenant. Actions registered with
     * [afterCommit] run once it has committed and its connection is back in the pool.
     */
    @Suppress("TooGenericExceptionCaught") // Rolls back on any failure and rethrows it.
    fun <T> txBlocking(businessId: UUID? = null, readOnly: Boolean = false, block: (Connection) -> T): T {
        val actions = mutableListOf<() -> Unit>()
        val result = dataSource.connection.use { conn ->
            conn.autoCommit = false
            // The driver opens the transaction with BEGIN READ ONLY, sent with the first statement (no extra round trip).
            if (readOnly) conn.isReadOnly = true
            AfterCommit.open(conn, actions)
            try {
                if (businessId != null) {
                    conn.prepareStatement("SELECT set_config('app.business_id', ?, true)").use { st ->
                        st.setString(1, businessId.toString())
                        st.executeQuery().close()
                    }
                }
                val result = block(conn)
                conn.commit()
                result
            } catch (e: Throwable) {
                actions.clear()
                try { conn.rollback() } catch (_: SQLException) { }
                throw e
            } finally {
                AfterCommit.close(conn)
                conn.autoCommit = true
                if (readOnly) conn.isReadOnly = false
            }
        }
        actions.forEach { runAfterCommit(it) }
        return result
    }

    /**
     * After-commit boundary: the transaction has committed whatever happens here, so a failing action is logged. What
     * registered it makes sure nothing is lost when it fails or never runs (see [afterCommit]).
     */
    private fun runAfterCommit(action: () -> Unit) {
        try {
            action()
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            log.warn("after-commit action failed: {}", e.message, e)
        }
    }

    suspend fun <T> tx(businessId: UUID? = null, block: (Connection) -> T): T =
        withContext(Dispatchers.IO) { txBlocking(businessId, false, block) }

    suspend fun <T> read(businessId: UUID? = null, block: (Connection) -> T): T =
        withContext(Dispatchers.IO) { txBlocking(businessId, true, block) }
}

/**
 * Runs [action] once the [Db] transaction on this connection has committed: never if it rolls back, nor if the
 * [savepoint] it was registered in rolls back. It runs on the same thread before `tx` returns, outside any transaction,
 * so it suits work that must not hold the transaction's locks, such as a provider call. The process may stop between
 * the commit and the action, so anything that must happen regardless is also queued as a job in the transaction (the
 * action only runs it sooner), or is safe to lose (an unpaid hold whose checkout was never created simply expires).
 */
fun Connection.afterCommit(action: () -> Unit) {
    AfterCommit.register(this, action)
}

/** The after-commit actions of the open [Db] transactions, by connection. */
internal object AfterCommit {
    private val open = Collections.synchronizedMap(IdentityHashMap<Connection, MutableList<() -> Unit>>())

    fun open(conn: Connection, actions: MutableList<() -> Unit>) {
        open[conn] = actions
    }

    fun close(conn: Connection) {
        open.remove(conn)
    }

    fun register(conn: Connection, action: () -> Unit) {
        val actions = open[conn] ?: error("afterCommit needs a transaction opened with Db.tx or Db.txBlocking")
        actions += action
    }

    /** How many actions [conn]'s transaction has registered so far. */
    fun count(conn: Connection): Int = open[conn]?.size ?: 0

    /** Forgets the actions registered after the first [count] (a savepoint rolled back). */
    fun dropAfter(conn: Connection, count: Int) {
        open[conn]?.let { actions -> actions.subList(count.coerceAtMost(actions.size), actions.size).clear() }
    }
}
