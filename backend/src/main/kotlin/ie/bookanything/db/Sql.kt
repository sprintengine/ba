package ie.bookanything.db

import kotlinx.serialization.json.JsonElement
import org.postgresql.util.PGobject
import java.sql.Connection
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.SQLException
import java.sql.Types
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** Wrappers for parameter types that need special JDBC binding. */
class UuidArray(val values: Collection<UUID>)
class TextArray(val values: Collection<String>)
class Jsonb(val json: String) {
    constructor(element: JsonElement) : this(element.toString())
}

/** Instant range bound as a Postgres tstzrange literal `[start,end)`. */
class TstzRange(val start: Instant, val end: Instant)

private fun bind(conn: Connection, st: PreparedStatement, params: Array<out Any?>) {
    params.forEachIndexed { i, p ->
        val idx = i + 1
        when (p) {
            null -> st.setNull(idx, Types.OTHER)
            is UUID -> st.setObject(idx, p)
            is String -> st.setString(idx, p)
            is Int -> st.setInt(idx, p)
            is Long -> st.setLong(idx, p)
            is Double -> st.setDouble(idx, p)
            is Boolean -> st.setBoolean(idx, p)
            is Instant -> st.setObject(idx, OffsetDateTime.ofInstant(p, ZoneOffset.UTC))
            is OffsetDateTime -> st.setObject(idx, p)
            is LocalDate -> st.setObject(idx, p)
            is LocalTime -> st.setObject(idx, p)
            is UuidArray -> st.setArray(idx, conn.createArrayOf("uuid", p.values.toTypedArray()))
            is TextArray -> st.setArray(idx, conn.createArrayOf("text", p.values.toTypedArray()))
            is Jsonb -> st.setObject(idx, PGobject().apply { type = "jsonb"; value = p.json })
            is TstzRange -> st.setObject(
                idx,
                PGobject().apply {
                    type = "tstzrange"
                    value = "[${OffsetDateTime.ofInstant(p.start, ZoneOffset.UTC)},${OffsetDateTime.ofInstant(p.end, ZoneOffset.UTC)})"
                },
            )
            is Enum<*> -> st.setString(idx, p.name.lowercase())
            else -> throw IllegalArgumentException("Unsupported SQL parameter type ${p::class}")
        }
    }
}

fun <T> Connection.query(sql: String, vararg params: Any?, map: (ResultSet) -> T): List<T> =
    prepareStatement(sql).use { st ->
        bind(this, st, params)
        st.executeQuery().use { rs ->
            val out = ArrayList<T>()
            while (rs.next()) out.add(map(rs))
            out
        }
    }

fun <T> Connection.queryOne(sql: String, vararg params: Any?, map: (ResultSet) -> T): T? =
    query(sql, *params, map = map).firstOrNull()

fun Connection.update(sql: String, vararg params: Any?): Int =
    prepareStatement(sql).use { st ->
        bind(this, st, params)
        st.executeUpdate()
    }

/** Whether [sql] returns any row. Postgres stops at the first one (the rows themselves are never sent). */
fun Connection.exists(sql: String, vararg params: Any?): Boolean =
    queryOne("SELECT EXISTS ($sql)", *params) { it.getBoolean(1) } ?: false

fun Connection.count(sql: String, vararg params: Any?): Long =
    queryOne(sql, *params) { it.getLong(1) } ?: 0L

/** Runs [block] inside a savepoint; rolls back to it on failure, with the [afterCommit] actions it added, and rethrows. */
@Suppress("TooGenericExceptionCaught") // Rolls back to the savepoint on any failure and rethrows it.
fun <T> Connection.savepoint(block: () -> T): T {
    val sp = setSavepoint()
    val actions = AfterCommit.count(this)
    return try {
        block().also { releaseSavepoint(sp) }
    } catch (e: Throwable) {
        rollback(sp)
        AfterCommit.dropAfter(this, actions)
        throw e
    }
}

fun ResultSet.uuid(col: String): UUID = getObject(col, UUID::class.java)
fun ResultSet.uuidOrNull(col: String): UUID? = getObject(col) as UUID?
fun ResultSet.str(col: String): String = getString(col)
fun ResultSet.strOrNull(col: String): String? = getString(col)
fun ResultSet.int(col: String): Int = getInt(col)
fun ResultSet.intOrNull(col: String): Int? {
    val value = getInt(col)
    return if (wasNull()) null else value
}
fun ResultSet.long(col: String): Long = getLong(col)
fun ResultSet.bool(col: String): Boolean = getBoolean(col)
fun ResultSet.instant(col: String): Instant = getObject(col, OffsetDateTime::class.java).toInstant()
fun ResultSet.instantOrNull(col: String): Instant? = getObject(col, OffsetDateTime::class.java)?.toInstant()
fun ResultSet.localDate(col: String): LocalDate = getObject(col, LocalDate::class.java)
fun ResultSet.localDateOrNull(col: String): LocalDate? = getObject(col, LocalDate::class.java)
fun ResultSet.localTime(col: String): LocalTime = getObject(col, LocalTime::class.java)
fun ResultSet.localTimeOrNull(col: String): LocalTime? = getObject(col, LocalTime::class.java)

@Suppress("UNCHECKED_CAST")
fun ResultSet.uuidList(col: String): List<UUID> =
    (getArray(col)?.array as Array<Any?>?)?.mapNotNull { it as UUID? }.orEmpty()

@Suppress("UNCHECKED_CAST")
fun ResultSet.stringList(col: String): List<String> =
    (getArray(col)?.array as Array<Any?>?)?.mapNotNull { it as String? }.orEmpty()

/** Postgres SQLState helpers. */
object PgState {
    const val UNIQUE_VIOLATION = "23505"
    const val EXCLUSION_VIOLATION = "23P01"
    const val FOREIGN_KEY_VIOLATION = "23503"
    const val CHECK_VIOLATION = "23514"
}

fun Throwable.sqlState(): String? {
    var cur: Throwable? = this
    while (cur != null) {
        if (cur is SQLException && cur.sqlState != null) return cur.sqlState
        cur = cur.cause
    }
    return null
}

fun Throwable.constraintName(): String? {
    var cur: Throwable? = this
    while (cur != null) {
        if (cur is org.postgresql.util.PSQLException) return cur.serverErrorMessage?.constraint
        cur = cur.cause
    }
    return null
}
