package ie.bookanything.support

import java.lang.reflect.InvocationHandler
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method
import java.lang.reflect.Proxy
import java.sql.CallableStatement
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.Statement
import java.util.Collections
import javax.sql.DataSource

/**
 * A [DataSource] that records every SQL statement executed through it (each `execute*` call on a statement, so a
 * prepared statement run twice counts twice and a batch counts once). Tests give it to one [TestEnv] so the count only
 * sees that app's requests, then assert a budget per endpoint (see `perf/QueryBudgets`).
 */
class CountingDataSource(private val delegate: DataSource) : DataSource by delegate {
    private val executed = Collections.synchronizedList(mutableListOf<String>())

    /** The statements executed since the last [reset], in order. */
    val statements: List<String> get() = synchronized(executed) { executed.toList() }

    fun reset() = executed.clear()

    /** Runs [block] and returns its result with the statements it executed. */
    suspend fun <T> recording(block: suspend () -> T): Pair<T, List<String>> {
        reset()
        val result = block()
        return result to statements
    }

    override fun getConnection(): Connection = connection(delegate.connection)

    override fun getConnection(username: String?, password: String?): Connection = connection(delegate.getConnection(username, password))

    private fun connection(real: Connection): Connection = proxy(Connection::class.java) { method, args ->
        val result = method.invoke(real, *args.orEmpty())
        when {
            result is PreparedStatement && method.name.startsWith("prepare") -> statement(result, args?.firstOrNull() as String?)
            result is Statement && method.name == "createStatement" -> statement(result, null)
            else -> result
        }
    }

    private fun statement(real: Statement, preparedSql: String?): Statement {
        val type = listOf(CallableStatement::class.java, PreparedStatement::class.java).firstOrNull { it.isInstance(real) }
            ?: Statement::class.java
        return proxy(type) { method, args ->
            if (method.name.startsWith("execute")) executed += (args?.firstOrNull() as? String ?: preparedSql).orEmpty().squash()
            method.invoke(real, *args.orEmpty())
        }
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

    private fun String.squash() = trim().replace(WHITESPACE, " ")

    private companion object {
        val WHITESPACE = Regex("\\s+")
    }
}
