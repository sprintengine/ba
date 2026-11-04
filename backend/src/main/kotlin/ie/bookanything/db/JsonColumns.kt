package ie.bookanything.db

import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import org.slf4j.LoggerFactory
import java.sql.ResultSet
import java.sql.SQLException

/** Reads JSON stored in our own columns: unknown keys (a field since removed) are ignored, nothing else is relaxed. */
val StoredJson = Json { ignoreUnknownKeys = true }

private val log = LoggerFactory.getLogger("ie.bookanything.db.JsonColumns")

fun ResultSet.json(col: String): JsonElement =
    getString(col)?.let { StoredJson.parseToJsonElement(it) } ?: JsonNull

/**
 * Decodes JSON column [col] with [serializer]; [fallback] when it is null, or when it doesn't decode, which is logged
 * with the column and the row's `id` so corrupt data is found rather than silently replaced on every read.
 */
fun <T> ResultSet.jsonOr(col: String, serializer: KSerializer<T>, fallback: T): T {
    val raw = getString(col) ?: return fallback
    return try {
        StoredJson.decodeFromString(serializer, raw)
    } catch (e: IllegalArgumentException) { // SerializationException included.
        log.warn("Undecodable JSON in column {} of row {}: {}", col, rowId(), e.message?.lineSequence()?.firstOrNull())
        fallback
    }
}

private fun ResultSet.rowId(): String = try {
    getString("id") ?: "?"
} catch (_: SQLException) { // The query selected no id column.
    "?"
}
