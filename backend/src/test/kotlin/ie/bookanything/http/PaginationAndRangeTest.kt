package ie.bookanything.http

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class PaginationAndRangeTest {
    private val id = UUID.fromString("00000000-0000-4000-8000-000000000001")

    @Test
    fun `time and id cursors round-trip and reject garbage as a cursor field error`() {
        val key = Instant.parse("2026-10-05T08:00:00Z") to id
        assertEquals(key, KeysetCursor.TIME_ID.decode(KeysetCursor.TIME_ID.encode(key)))
        // Database times have microseconds; a cursor that drops them skips the rest of that millisecond.
        val micros = Instant.parse("2026-10-05T08:00:00.123456Z") to id
        assertEquals(micros, KeysetCursor.TIME_ID.decode(KeysetCursor.TIME_ID.encode(micros)))
        // A cursor issued before the time kept its microseconds still reads, as whole milliseconds.
        val legacy = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString("${micros.first.toEpochMilli()}|$id".toByteArray())
        assertEquals(Instant.parse("2026-10-05T08:00:00.123Z") to id, KeysetCursor.TIME_ID.decode(legacy))
        assertNull(KeysetCursor.TIME_ID.decode(null))
        assertNull(KeysetCursor.TIME_ID.decode(" "))
        // Not base64; "nope"; "12|zz".
        for (bad in listOf("@@@", "bm9wZQ", "MTJ8eno")) {
            val e = assertFailsWith<ApiException>(bad) { KeysetCursor.TIME_ID.decode(bad) }
            assertEquals(mapOf("cursor" to "Invalid cursor"), e.fields)
        }
    }

    @Test
    fun `a page shows limit rows and continues after the last one shown`() {
        val rows = listOf(1, 2, 3)
        assertEquals(Page(listOf("1", "2"), "c2"), rows.toPage(2, { "c$it" }) { it.toString() })
        assertEquals(Page(listOf("1", "2", "3"), null), rows.toPage(3, { "c$it" }) { it.toString() })
    }

    @Test
    fun `date ranges count both ends`() {
        val oct1 = LocalDate.parse("2026-10-01")
        assertEquals(1, DateRange(oct1, oct1).days)
        assertEquals(31, DateRange(oct1, oct1.plusDays(30)).requireValid(31).days)
        assertEquals(
            mapOf("to" to "The range can be at most 31 days"),
            assertFailsWith<ApiException> {
                DateRange(oct1, oct1.plusDays(31)).requireValid(31)
            }.fields,
        )
        assertEquals(
            mapOf("to" to "Must be on or after from"),
            assertFailsWith<ApiException> {
                DateRange(oct1, oct1.minusDays(1)).requireValid(31)
            }.fields,
        )
    }

    @Test
    fun `day bounds follow the zone, including DST changes`() {
        val dublin = ZoneId.of("Europe/Dublin")
        val range = DateRange(LocalDate.parse("2026-10-25"), LocalDate.parse("2026-10-25")) // clocks go back: a 25-hour day
        assertEquals(Instant.parse("2026-10-24T23:00:00Z"), range.startIn(dublin))
        assertEquals(Instant.parse("2026-10-26T00:00:00Z"), range.endIn(dublin))
    }
}
