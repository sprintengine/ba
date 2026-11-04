package ie.bookanything.availability

import ie.bookanything.business.Policies
import java.time.Instant
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

/** The last step of customer availability: only times after `after`, and only the earliest with "next available only". */
class NextAvailableTest {
    private val mon = LocalDate.of(2026, 10, 5)
    private val tue = mon.plusDays(1)
    private val wed = mon.plusDays(2)

    private fun slot(at: String) = Instant.parse(at).let { ComputedSlot(it, it.plusSeconds(3600), emptyList(), null) }

    /** Monday 09:00 and 10:00, Tuesday nothing, Wednesday 14:00 and 15:00 (UTC). */
    private val days = linkedMapOf(
        mon to listOf(slot("2026-10-05T09:00:00Z"), slot("2026-10-05T10:00:00Z")),
        tue to emptyList(),
        wed to listOf(slot("2026-10-07T14:00:00Z"), slot("2026-10-07T15:00:00Z")),
    )

    private fun starts(d: Map<LocalDate, List<ComputedSlot>>) = d.mapValues { (_, s) -> s.map { it.start.toString() } }

    @Test
    fun `everything is shown by default`() {
        assertEquals(days, NextAvailable.shown(days, ShownSlots.ALL))
    }

    @Test
    fun `next only keeps the earliest slot and every day of the range`() {
        assertEquals(
            mapOf(mon to listOf("2026-10-05T09:00:00Z"), tue to emptyList(), wed to emptyList()),
            starts(NextAvailable.shown(days, ShownSlots(nextOnly = true))),
        )
    }

    @Test
    fun `after a time mid-day shows the next one that day`() {
        assertEquals(
            mapOf(mon to listOf("2026-10-05T10:00:00Z"), tue to emptyList(), wed to emptyList()),
            starts(NextAvailable.shown(days, ShownSlots(Instant.parse("2026-10-05T09:00:00Z"), nextOnly = true))),
        )
    }

    @Test
    fun `after a day's last slot moves to the next day with one`() {
        assertEquals(
            mapOf(mon to emptyList(), tue to emptyList(), wed to listOf("2026-10-07T14:00:00Z")),
            starts(NextAvailable.shown(days, ShownSlots(Instant.parse("2026-10-05T10:00:00Z"), nextOnly = true))),
        )
    }

    @Test
    fun `without the policy after keeps every later slot`() {
        assertEquals(
            mapOf(mon to listOf("2026-10-05T10:00:00Z"), tue to emptyList(), wed to listOf("2026-10-07T14:00:00Z", "2026-10-07T15:00:00Z")),
            starts(NextAvailable.shown(days, ShownSlots(Instant.parse("2026-10-05T09:30:00Z")))),
        )
    }

    @Test
    fun `nothing free, or nothing after the last slot, leaves every day empty`() {
        val empty = mapOf(mon to emptyList(), tue to emptyList(), wed to emptyList<String>())
        assertEquals(empty, starts(NextAvailable.shown(days.mapValues { emptyList() }, ShownSlots(nextOnly = true))))
        assertEquals(empty, starts(NextAvailable.shown(days, ShownSlots(Instant.parse("2026-10-07T15:00:00Z"), nextOnly = true))))
    }

    @Test
    fun `customers follow the business's policy`() {
        val after = Instant.parse("2026-10-05T09:00:00Z")
        assertEquals(ShownSlots(after, nextOnly = true), ShownSlots.forCustomer(Policies(nextAvailableOnly = true), after))
        assertEquals(ShownSlots(null, nextOnly = false), ShownSlots.forCustomer(Policies(), null))
    }
}
