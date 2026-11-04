package ie.bookanything.releases

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ReleaseRulesTest {
    private val dublin = ZoneId.of("Europe/Dublin")
    private val gp = UUID.fromString("00000000-0000-0000-0000-00000000000a")
    private val bloods = UUID.fromString("00000000-0000-0000-0000-00000000000b")
    private val gms = UUID.fromString("00000000-0000-0000-0000-0000000000c1")
    private val private = UUID.fromString("00000000-0000-0000-0000-0000000000c2")
    private val restricted = setOf(gms)

    private fun d(iso: String) = LocalDate.parse(iso)
    private fun at(local: String) = LocalDateTime.parse(local).atZone(dublin).toInstant()

    private fun daily(daysBefore: Int = 1, time: String = "17:00", weekdaysOnly: Boolean = false) =
        ReleaseTiming(ReleaseCadence.DAILY, LocalTime.parse(time), daysBefore = daysBefore, weekdaysOnly = weekdaysOnly)

    private fun weekly(weekday: Int = 5, time: String = "22:00", weeksAhead: Int = 1) =
        ReleaseTiming(ReleaseCadence.WEEKLY, LocalTime.parse(time), weekday = weekday, weeksAhead = weeksAhead)

    private fun schedule(
        timing: ReleaseTiming = daily(), services: Set<UUID> = setOf(gp), everyone: Boolean = false, groups: Set<UUID> = setOf(gms),
        status: ReleaseStatus = ReleaseStatus.ACTIVE, id: UUID = UUID.randomUUID(),
    ) = ReleaseSchedule(id, "GMS next-day", timing, services, everyone, groups, status)

    // --- When a day opens ---

    @Test
    fun `day by day opens each day the given number of days before at the release time`() {
        // Thursday 15 Oct opens Wednesday 14 Oct at 17:00 Dublin time (IST, UTC+1).
        assertEquals(Instant.parse("2026-10-14T16:00:00Z"), ReleaseCalendar.scheduledAt(daily(), d("2026-10-15"), dublin))
        // Same day at 08:00: the "phone lines open at 8" model.
        assertEquals(at("2026-10-15T08:00"), ReleaseCalendar.scheduledAt(daily(0, "08:00"), d("2026-10-15"), dublin))
        assertEquals(d("2026-10-01"), ReleaseCalendar.releaseDate(daily(14), d("2026-10-15")))
    }

    @Test
    fun `skipping weekends moves a Saturday or Sunday release back to the Friday`() {
        val t = daily(1, weekdaysOnly = true)
        assertEquals(d("2026-10-16"), ReleaseCalendar.releaseDate(t, d("2026-10-19")), "Monday opens on Friday, not Sunday")
        assertEquals(d("2026-10-16"), ReleaseCalendar.releaseDate(t, d("2026-10-18")), "Sunday opens on Friday")
        assertEquals(d("2026-10-16"), ReleaseCalendar.releaseDate(t, d("2026-10-17")), "Saturday opens on Friday")
        assertEquals(d("2026-10-19"), ReleaseCalendar.releaseDate(t, d("2026-10-20")), "Tuesday opens on Monday")
        assertEquals(d("2026-10-16"), ReleaseCalendar.releaseDate(daily(0, weekdaysOnly = true), d("2026-10-18")))
        assertEquals(d("2026-10-18"), ReleaseCalendar.releaseDate(daily(1), d("2026-10-19")), "without the option Monday opens Sunday")
    }

    @Test
    fun `week by week opens the whole week on the release weekday the given weeks before`() {
        val friday = weekly(5, "22:00", 1)
        // Every day of Mon 19 – Sun 25 Oct opens on Friday 16 Oct at 22:00.
        (19..25).forEach { day ->
            assertEquals(at("2026-10-16T22:00"), ReleaseCalendar.scheduledAt(friday, d("2026-10-$day"), dublin), "Oct $day")
        }
        assertEquals(at("2026-10-23T22:00"), ReleaseCalendar.scheduledAt(friday, d("2026-10-26"), dublin), "the next Monday, a week later")
        // Sunday evening opens the week straight after it; two weeks ahead opens a week earlier.
        assertEquals(d("2026-10-18"), ReleaseCalendar.releaseDate(weekly(7), d("2026-10-19")))
        assertEquals(d("2026-10-09"), ReleaseCalendar.releaseDate(weekly(5, weeksAhead = 2), d("2026-10-19")))
        // A Monday release opens the week a whole week ahead.
        assertEquals(d("2026-10-12"), ReleaseCalendar.releaseDate(weekly(1), d("2026-10-19")))
    }

    @Test
    fun `release times follow daylight saving and a time in the spring gap moves forward`() {
        // Clocks go back on Sunday 25 Oct 2026: a 17:00 release is 16:00Z before and 17:00Z after.
        assertEquals(Instant.parse("2026-10-24T16:00:00Z"), ReleaseCalendar.scheduledAt(daily(), d("2026-10-25"), dublin))
        assertEquals(Instant.parse("2026-10-25T17:00:00Z"), ReleaseCalendar.scheduledAt(daily(), d("2026-10-26"), dublin))
        // 01:30 doesn't exist on Sunday 29 March 2026 in Dublin (01:00 → 02:00): it opens at 02:30 IST.
        assertEquals(
            Instant.parse("2026-03-29T01:30:00Z"),
            ReleaseCalendar.scheduledAt(daily(0, "01:30"), d("2026-03-29"), dublin),
        )
    }

    @Test
    fun `a change moves or holds one day's release`() {
        val t = daily()
        val id = UUID.randomUUID()
        assertEquals(at("2026-10-14T17:00"), ReleaseCalendar.opensAt(t, null, d("2026-10-15"), dublin))
        val moved = ReleaseChange(id, d("2026-10-15"), at("2026-10-14T22:00"))
        assertEquals(at("2026-10-14T22:00"), ReleaseCalendar.opensAt(t, moved, d("2026-10-15"), dublin))
        assertNull(ReleaseCalendar.opensAt(t, ReleaseChange(id, d("2026-10-15"), null), d("2026-10-15"), dublin), "held")
    }

    @Test
    fun `the days released together are the week, or a weekend opened on the Friday`() {
        assertEquals((19..25).map { d("2026-10-$it") }, ReleaseCalendar.sameRelease(weekly(), d("2026-10-21")))
        assertEquals(
            listOf(d("2026-10-17"), d("2026-10-18"), d("2026-10-19")),
            ReleaseCalendar.sameRelease(daily(1, weekdaysOnly = true), d("2026-10-18")),
        )
        assertEquals(listOf(d("2026-10-15")), ReleaseCalendar.sameRelease(daily(), d("2026-10-15")))
    }

    @Test
    fun `reach is the furthest a day can be ahead of its release date`() {
        assertEquals(1, ReleaseCalendar.reachDays(daily(1)))
        assertEquals(3, ReleaseCalendar.reachDays(daily(1, weekdaysOnly = true)))
        assertEquals(13, ReleaseCalendar.reachDays(weekly(5, weeksAhead = 1)))
        // Every date further ahead than the reach is released after its own release date's reach: check exhaustively.
        val timings = listOf(daily(0), daily(3, weekdaysOnly = true), daily(14), weekly(1), weekly(5), weekly(7, weeksAhead = 4))
        for (t in timings) {
            for (offset in 0L..60L) {
                val date = d("2026-10-01").plusDays(offset)
                val gap = date.toEpochDay() - ReleaseCalendar.releaseDate(t, date).toEpochDay()
                assertTrue(gap in 0..ReleaseCalendar.reachDays(t), "$t $date gap $gap")
            }
        }
    }

    @Test
    fun `a new timing keeps the days the old one already opened`() {
        val now = at("2026-10-14T18:00") // Wednesday evening: Thursday opened at 17:00.
        // Later: Thursday would close until 22:00, so it is kept open from 17:00; Friday wasn't open yet.
        assertEquals(
            mapOf(d("2026-10-15") to at("2026-10-14T17:00")),
            ReleaseCalendar.closedByChange(daily(1, "17:00"), daily(1, "22:00"), emptySet(), dublin, now),
        )
        // Earlier: nothing closes.
        assertEquals(emptyMap(), ReleaseCalendar.closedByChange(daily(1, "17:00"), daily(1, "09:00"), emptySet(), dublin, now))
        // A day with its own change keeps it, whatever the timing.
        assertEquals(emptyMap(), ReleaseCalendar.closedByChange(daily(1, "17:00"), daily(1, "22:00"), setOf(d("2026-10-15")), dublin, now))
        // Fewer days ahead: the days the old timing opened further ahead stay open.
        val kept = ReleaseCalendar.closedByChange(weekly(5, "22:00", 2), daily(1, "17:00"), emptySet(), dublin, now)
        assertEquals((16..25).map { d("2026-10-$it") }, kept.keys.sorted())
        assertEquals(at("2026-10-09T22:00"), kept[d("2026-10-25")])
    }

    @Test
    fun `timings outside the allowed ranges are refused`() {
        assertFailsWith<IllegalArgumentException> { daily(15) }
        assertFailsWith<IllegalArgumentException> { weekly(8) }
        assertFailsWith<IllegalArgumentException> { weekly(weeksAhead = 5) }
    }

    // --- Who a schedule covers ---

    private fun covers(s: ReleaseSchedule, service: UUID, group: UUID?, others: List<ReleaseSchedule> = emptyList()) =
        s in ReleaseBook.covering(listOf(s) + others, service, group, restricted)

    @Test
    fun `a schedule covers its services for its groups, and everyone schedules cover every customer`() {
        val forGms = schedule()
        assertTrue(covers(forGms, gp, gms))
        assertFalse(covers(forGms, gp, private), "private patients aren't in it")
        assertFalse(covers(forGms, bloods, gms), "blood tests aren't in it")
        assertFalse(covers(forGms, gp, null), "no group can't book GMS-only hours anyway")
        val all = schedule(everyone = true, groups = emptySet())
        assertTrue(covers(all, gp, null))
        assertTrue(covers(all, gp, gms))
    }

    @Test
    fun `customers can't get round a schedule for an unrestricted group by leaving it or picking another`() {
        val students = UUID.fromString("00000000-0000-0000-0000-0000000000c3")
        val forPrivate = schedule(groups = setOf(private))
        assertTrue(covers(forPrivate, gp, null), "no group sees the private hours")
        assertTrue(covers(forPrivate, gp, students), "neither does another unrestricted group no schedule names")
        assertFalse(covers(forPrivate, gp, gms), "restricted groups have their own hours")
        // A group with a schedule of its own follows that one only.
        val forStudents = schedule(groups = setOf(students), timing = daily(7, "09:00"))
        assertFalse(covers(forPrivate, gp, students, others = listOf(forStudents)))
        assertTrue(covers(forStudents, gp, students, others = listOf(forPrivate)))
    }

    // --- Locks ---

    @Test
    fun `a day is locked until it opens, and a held day until someone opens it`() {
        val s = schedule()
        val book = ReleaseBook(listOf(s), listOf(ReleaseChange(s.id, d("2026-10-16"), null)))
        val schedules = book.covering(gp, gms, restricted)
        val now = at("2026-10-14T16:59")
        assertEquals(DayLock(at("2026-10-14T17:00")), book.lock(schedules, d("2026-10-15"), dublin, now))
        assertNull(book.lock(schedules, d("2026-10-15"), dublin, at("2026-10-14T17:00")), "open on the dot")
        assertNull(book.lock(schedules, d("2026-10-14"), dublin, now), "today opened yesterday")
        assertEquals(DayLock(null), book.lock(schedules, d("2026-10-16"), dublin, at("2026-10-20T09:00")), "held whatever the time")
        assertNull(book.lock(emptyList(), d("2026-10-15"), dublin, now), "nothing covers it")
    }

    @Test
    fun `when several schedules cover a customer the latest opening wins`() {
        val early = schedule(timing = daily(7, "09:00"), groups = setOf(private))
        val late = schedule(timing = daily(1, "17:00"), groups = setOf(UUID.randomUUID()))
        val book = ReleaseBook(listOf(early, late), emptyList())
        val both = book.covering(gp, null, restricted)
        assertEquals(2, both.size)
        assertEquals(DayLock(at("2026-10-14T17:00")), book.lock(both, d("2026-10-15"), dublin, at("2026-10-12T10:00")))
    }

    @Test
    fun `paused schedules cover nobody`() {
        val book = ReleaseBook(listOf(schedule(status = ReleaseStatus.PAUSED)), emptyList())
        assertTrue(book.isEmpty)
        assertTrue(book.covering(gp, gms, restricted).isEmpty())
    }
}
