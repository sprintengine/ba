package ie.bookanything.http

import kotlinx.serialization.Serializable
import java.time.Instant
import java.util.Base64
import java.util.UUID

/** One page of a keyset-paginated list. [nextCursor] is opaque; null on the last page. */
@Serializable
data class Page<T>(val items: List<T>, val nextCursor: String?)

/**
 * Turns the result of a `LIMIT limit + 1` query into a page: the extra row only says that there is a next page, which
 * continues after the last row shown ([cursorOf]).
 */
fun <R, T> List<R>.toPage(limit: Int, cursorOf: (R) -> String, map: (R) -> T): Page<T> {
    val shown = take(limit)
    return Page(shown.map(map), if (size > limit) cursorOf(shown.last()) else null)
}

/**
 * An opaque keyset cursor: the key parts joined by [separator] (a character the parts never contain), base64url
 * encoded. A cursor that does not decode is a 400 on `cursor`, never a 500.
 */
class KeysetCursor<K>(
    private val separator: Char,
    private val parts: (K) -> List<Any>,
    private val parse: (List<String>) -> K,
) {
    fun encode(key: K): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(parts(key).joinToString(separator.toString()).toByteArray())

    /** The key in [raw], or null when there is no cursor. */
    fun decode(raw: String?): K? {
        if (raw.isNullOrBlank()) return null
        // Bad base64, numbers and UUIDs throw IllegalArgumentException; a missing part throws IndexOutOfBoundsException.
        return try {
            parse(String(Base64.getUrlDecoder().decode(raw)).split(separator))
        } catch (_: IllegalArgumentException) {
            throw invalid()
        } catch (_: IndexOutOfBoundsException) {
            throw invalid()
        }
    }

    private fun invalid() = Errors.field("cursor", "Invalid cursor")

    companion object {
        /**
         * Lists ordered by a time and then the id (bookings by start, audit events by time). The time keeps its full
         * precision (epoch milliseconds, the id, then the nanoseconds within the millisecond): Postgres times have
         * microseconds, and a cursor rounded to the millisecond skips or repeats the rows of that millisecond (all the
         * audit events of one transaction share its time). Cursors without the third part are read as whole milliseconds.
         */
        val TIME_ID = KeysetCursor<Pair<Instant, UUID>>(
            '|',
            { (at, id) -> listOf(at.toEpochMilli(), id, at.nano % NANOS_PER_MILLI) },
            { Instant.ofEpochMilli(it[0].toLong()).plusNanos(it.getOrNull(2)?.toLong() ?: 0L) to UUID.fromString(it[1]) },
        )
    }
}

private const val NANOS_PER_MILLI = 1_000_000
