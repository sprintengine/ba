package ie.bookanything.support

import ie.bookanything.config.DatabaseConfig
import ie.bookanything.db.Migrations
import ie.bookanything.db.createDataSource
import java.lang.reflect.InvocationHandler
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method
import java.lang.reflect.Proxy
import java.sql.Connection
import java.sql.DriverManager
import java.sql.PreparedStatement
import java.util.UUID
import kotlin.test.fail

/** The plan Postgres chose for one statement a test ran, with that statement's SQL. */
data class QueryPlan(val sql: String, val text: String) {
    /**
     * Asserts that [index] serves this statement with a condition on [column] inside the index scan (`Index Cond`), not
     * as a filter applied to every row read.
     */
    fun assertIndexCond(index: String, column: String) {
        val lines = text.lines()
        val scan = lines.indexOfFirst { Regex("(using|on) $index\\b").containsMatchIn(it) }
        if (scan < 0) fail("expected $index in the plan of\n$sql\n\n$text")
        val node = lines.drop(scan + 1).takeWhile { !it.contains("->") }
        if (node.none { it.contains("Index Cond:") && it.contains(column) }) {
            fail("expected an Index Cond on $column for $index in the plan of\n$sql\n\n$text")
        }
    }
}

/** The plan of the one statement whose SQL contains [fragment]. */
fun List<QueryPlan>.of(fragment: String): QueryPlan =
    singleOrNull { fragment in it.sql } ?: fail("expected one statement with '$fragment' among:\n${joinToString("\n") { it.sql }}")

/**
 * Query plans as production sees them. Tests and development connect as a superuser, which skips row-level security;
 * production connects as an ordinary role under FORCEd tenant policies, where only leakproof operators can be index
 * conditions (citext `=`, `lower()` and the range `&&` are not leakproof). [explain] runs repository code as such a role
 * and returns the plan of every statement it ran, so a test asserts on the SQL the code really sends.
 *
 * The plans come from a database of their own, migrated and filled with `db/plan-seed.sql`: on the shared test
 * database's small and uneven tables the planner may prefer any index, so a plan there says little about production.
 */
object QueryPlans {
    private const val ROLE = "plan_probe"

    /** The JDBC URL of the plan database, created (migrated, seeded, analysed) on first use and kept for the run. */
    val jdbcUrl: String by lazy {
        val name = "plan_check_" + UUID.randomUUID().toString().replace("-", "").take(12)
        Fixtures.sql("CREATE DATABASE $name")
        val url = TestDatabase.jdbcUrl.replace(Regex("/[^/?]+(\\?|$)")) { "/$name${it.groupValues[1]}" }
        createDataSource(DatabaseConfig(url, TestDatabase.username, TestDatabase.password, 2)).use { ds ->
            Migrations.migrate(ds)
            ds.connection.use { conn ->
                conn.createStatement().use { st ->
                    val seed = javaClass.getResource("/db/plan-seed.sql")!!.readText()
                    seed.split(Regex("^;$", RegexOption.MULTILINE)).filter { it.isNotBlank() }.forEach { st.execute(it) }
                    st.execute(
                        "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROLE') THEN " +
                            "CREATE ROLE $ROLE NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; END \$\$",
                    )
                    st.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $ROLE")
                }
            }
        }
        url
    }

    /** Runs [block] with a connection to the plan database as a superuser (to look up ids for the probes). */
    fun <T> read(block: (Connection) -> T): T = connect().use(block)

    /**
     * Runs [block] as the probe role, scoped to [businessId] when given (as `Db.tx(businessId)` does), with sequential
     * scans switched off so a query that can't use an index shows a Seq Scan whatever the table's size. Each statement
     * is explained with its parameters, then run; everything is rolled back.
     */
    fun explain(businessId: UUID?, block: (Connection) -> Unit): List<QueryPlan> {
        val plans = mutableListOf<QueryPlan>()
        connect().use { real ->
            real.autoCommit = false
            try {
                real.createStatement().use { st ->
                    st.execute("SET LOCAL ROLE $ROLE")
                    st.execute("SET LOCAL enable_seqscan = off")
                }
                if (businessId != null) {
                    real.prepareStatement("SELECT set_config('app.business_id', ?, true)").use { st ->
                        st.setString(1, businessId.toString())
                        st.executeQuery().close()
                    }
                }
                block(explaining(real, plans))
            } finally {
                real.rollback()
            }
        }
        return plans
    }

    private fun connect(): Connection = DriverManager.getConnection(jdbcUrl, TestDatabase.username, TestDatabase.password)

    /** [real], recording the plan of each prepared statement before it runs. */
    private fun explaining(real: Connection, plans: MutableList<QueryPlan>): Connection = proxy(Connection::class.java) { method, args ->
        val result = method.invoke(real, *args.orEmpty())
        if (result is PreparedStatement &&
            method.name == "prepareStatement"
        ) {
            statement(real, result, args!![0] as String, plans)
        } else {
            result
        }
    }

    private fun statement(real: Connection, st: PreparedStatement, sql: String, plans: MutableList<QueryPlan>): PreparedStatement {
        val bindings = mutableListOf<Pair<Method, Array<out Any?>>>()
        return proxy(PreparedStatement::class.java) { method, args ->
            if (method.name.startsWith("set") && args?.firstOrNull() is Int) bindings += method to args
            if (method.name.startsWith("execute")) plans += QueryPlan(sql.trimIndent(), plan(real, sql, bindings))
            method.invoke(st, *args.orEmpty())
        }
    }

    private fun plan(real: Connection, sql: String, bindings: List<Pair<Method, Array<out Any?>>>): String =
        real.prepareStatement("EXPLAIN $sql").use { st ->
            bindings.forEach { (method, args) -> method.invoke(st, *args) }
            st.executeQuery().use { rs -> generateSequence { if (rs.next()) rs.getString(1) else null }.joinToString("\n") }
        }

    @Suppress("UNCHECKED_CAST") // The proxy implements [type], a subtype of T.
    private fun <T : Any> proxy(type: Class<out T>, handle: (Method, Array<out Any?>?) -> Any?): T {
        val handler = InvocationHandler { _, method, args ->
            try {
                handle(method, args)
            } catch (e: InvocationTargetException) {
                throw e.targetException
            }
        }
        return Proxy.newProxyInstance(javaClass.classLoader, arrayOf(type), handler) as T
    }
}
