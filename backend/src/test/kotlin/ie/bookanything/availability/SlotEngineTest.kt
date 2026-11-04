package ie.bookanything.availability

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SlotEngineTest {
    private val dublin = ZoneId.of("Europe/Dublin")
    private val service = UUID.fromString("00000000-0000-0000-0000-00000000a001")
    private val otherService = UUID.fromString("00000000-0000-0000-0000-00000000a002")
    private val therapistA = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val therapistB = UUID.fromString("00000000-0000-0000-0000-000000000002")
    private val room1 = UUID.fromString("00000000-0000-0000-0000-000000000011")
    private val room2 = UUID.fromString("00000000-0000-0000-0000-000000000012")
    private val gms = UUID.fromString("00000000-0000-0000-0000-0000000000c1")
    private val privateGroup = UUID.fromString("00000000-0000-0000-0000-0000000000c2")

    /** Monday 5 October 2026. */
    private val monday = LocalDate.of(2026, 10, 5)
    private val longAgo = Instant.parse("2026-01-01T00:00:00Z")

    private fun t(h: Int, m: Int = 0) = LocalTime.of(h, m)
    private fun at(date: LocalDate, h: Int, m: Int = 0, zone: ZoneId = dublin): Instant = ZonedDateTime.of(date, t(h, m), zone).toInstant()
    private fun rule(
        resource: UUID, day: Int, s: LocalTime, e: LocalTime, audience: Set<UUID> = emptySet(), from: LocalDate? = null,
        until: LocalDate? = null,
    ) =
        RuleSpec(resource, day, s, e, from, until, audience)

    private fun query(
        rules: List<RuleSpec>,
        requirements: List<RequirementSpec> = listOf(RequirementSpec(null, 1, listOf(therapistA))),
        from: LocalDate = monday, to: LocalDate = from,
        duration: Int = 60, step: Int = 60, before: Int = 0, after: Int = 0, capacity: Int = 1,
        overrides: List<OverrideSpec> = emptyList(), busy: List<BusyAllocation> = emptyList(),
        audience: AudienceContext = AudienceContext(), now: Instant = longAgo, earliest: Instant = now, latestDate: LocalDate? = null,
        zone: ZoneId = dublin, exclude: UUID? = null, serviceId: UUID = service,
    ) = SlotQuery(
        zone = zone, from = from, to = to, now = now, serviceId = serviceId, durationMinutes = duration, bufferBeforeMinutes = before,
        bufferAfterMinutes = after, stepMinutes = step, earliestStart = earliest, latestDate = latestDate, capacity = capacity,
        requirements = requirements,
        resources = listOf(therapistA, therapistB, room1, room2).mapIndexed { i, id -> id to ResourceSpec(id, i) }.toMap(),
        rules = rules, overrides = overrides, busy = busy, audience = audience, excludeBookingId = exclude,
    )

    private fun starts(q: SlotQuery, date: LocalDate = q.from, zone: ZoneId = q.zone): List<String> =
        SlotEngine.findSlots(q)[date].orEmpty().map { ZonedDateTime.ofInstant(it.start, zone).toLocalTime().toString() }

    private fun busy(
        resource: UUID, s: Instant, e: Instant, exclusive: Boolean = true, booking: UUID = UUID.randomUUID(),
        serviceId: UUID = otherService, sessionStart: Instant = s,
    ) =
        BusyAllocation(booking, resource, s, e, exclusive, serviceId, sessionStart)

    @Test
    fun `overlapping rules are merged into one window without duplicate slots`() {
        val q = query(listOf(rule(therapistA, 1, t(9), t(12)), rule(therapistA, 1, t(11), t(13)), rule(therapistA, 1, t(9), t(10))))
        assertEquals(listOf("09:00", "10:00", "11:00", "12:00"), starts(q))
    }

    @Test
    fun `adjacent rules are joined so a slot can span them`() {
        val q = query(listOf(rule(therapistA, 1, t(9), t(10, 30)), rule(therapistA, 1, t(10, 30), t(12))), step = 90, duration = 90)
        assertEquals(listOf("09:00", "10:30"), starts(q))
    }

    @Test
    fun `rules respect day of week and validity dates`() {
        val rules = listOf(
            rule(therapistA, 2, t(9), t(10)), // Tuesday only
            rule(therapistA, 1, t(14), t(15), until = monday.minusDays(1)), // expired
            rule(therapistA, 1, t(16), t(17), from = monday.plusDays(7)), // not yet valid
        )
        assertEquals(emptyList(), starts(query(rules)))
        assertEquals(listOf("16:00"), starts(query(rules, from = monday.plusDays(7))))
    }

    @Test
    fun `unavailable overrides remove time and whole days, available overrides add time`() {
        val rules = listOf(rule(therapistA, 1, t(9), t(13)))
        val partial = listOf(OverrideSpec(therapistA, monday, false, t(10), t(12)))
        assertEquals(listOf("09:00", "12:00"), starts(query(rules, overrides = partial)))
        val dayOff = listOf(OverrideSpec(therapistA, monday, false))
        assertEquals(emptyList(), starts(query(rules, overrides = dayOff)))
        val extra = listOf(OverrideSpec(therapistA, monday, true, t(18), t(20)))
        assertEquals(listOf("09:00", "10:00", "11:00", "12:00", "18:00", "19:00"), starts(query(rules, overrides = extra)))
        // Day off plus extra evening hours on the same date: only the extra hours remain.
        assertEquals(listOf("18:00", "19:00"), starts(query(rules, overrides = dayOff + extra)))
    }

    @Test
    fun `whole business closures override everything including extra hours`() {
        val rules = listOf(rule(therapistA, 1, t(9), t(13)))
        val extra = OverrideSpec(therapistA, monday, true, t(18), t(20))
        assertEquals(emptyList(), starts(query(rules, overrides = listOf(extra, OverrideSpec(null, monday, false)))))
        assertEquals(
            listOf("09:00", "12:00", "18:00", "19:00"),
            starts(query(rules, overrides = listOf(extra, OverrideSpec(null, monday, false, t(10), t(12))))),
        )
    }

    @Test
    fun `buffers must fit inside the window and must not overlap other bookings`() {
        val rules = listOf(rule(therapistA, 1, t(9), t(12)))
        // 60 min + 15 after: 11:00 would end its buffer at 12:15, outside the window.
        assertEquals(listOf("09:00", "10:00"), starts(query(rules, after = 15)))
        // 15 min before: the first start is 09:15 (aligned from window start + buffer).
        assertEquals(listOf("09:15", "10:15"), starts(query(rules, before = 15)))
        // A booking 10:00–11:00: back-to-back is fine without buffers…
        val b = busy(therapistA, at(monday, 10), at(monday, 11))
        assertEquals(listOf("09:00", "11:00"), starts(query(rules, busy = listOf(b), step = 60)))
        // …but a 15 minute after-buffer on 09:00 (blocked until 10:15) collides, and 11:00 would overrun the window.
        assertEquals(emptyList(), starts(query(rules, busy = listOf(b), after = 15)))
    }

    @Test
    fun `slot interval controls the step and defaults to the duration`() {
        val rules = listOf(rule(therapistA, 1, t(9), t(11)))
        assertEquals(listOf("09:00", "09:15", "09:30", "09:45", "10:00"), starts(query(rules, step = 15)))
        assertEquals(listOf("09:00", "09:45"), starts(query(rules, duration = 45, step = 45)))
    }

    @Test
    fun `notice window and max advance are enforced`() {
        val rules = (1..7).map { rule(therapistA, it, t(9), t(12)) }
        val now = at(monday, 9, 30)
        assertEquals(listOf("10:00", "11:00"), starts(query(rules, now = now, earliest = now)))
        assertEquals(listOf("11:00"), starts(query(rules, now = now, earliest = at(monday, 10, 30))))
        // Max advance: today + 1 day → the day after tomorrow has no slots.
        val q = query(rules, from = monday, to = monday.plusDays(2), now = now, earliest = now, latestDate = monday.plusDays(1))
        val days = SlotEngine.findSlots(q)
        assertTrue(days[monday.plusDays(1)]!!.isNotEmpty())
        assertEquals(emptyList(), days[monday.plusDays(2)])
    }

    @Test
    fun `past slots are never offered even without a notice period`() {
        val rules = listOf(rule(therapistA, 1, t(9), t(12)))
        assertEquals(listOf("11:00"), starts(query(rules, now = at(monday, 10, 1), earliest = longAgo)))
    }

    @Test
    fun `audience rules - open windows exclude restricted groups, listed windows admit only listed groups`() {
        val rules = listOf(
            rule(therapistA, 1, t(9), t(10)), // open to everyone except restricted groups
            rule(therapistA, 1, t(10), t(11), audience = setOf(gms)), // GMS only
            rule(therapistA, 1, t(11), t(12), audience = setOf(gms, privateGroup)),
        )
        val restricted = setOf(gms)
        assertEquals(listOf("09:00"), starts(query(rules, audience = AudienceContext(null, restricted))))
        assertEquals(listOf("09:00", "11:00"), starts(query(rules, audience = AudienceContext(privateGroup, restricted))))
        assertEquals(listOf("10:00", "11:00"), starts(query(rules, audience = AudienceContext(gms, restricted))))
    }

    @Test
    fun `multi-resource requirement needs a free therapist and a free room`() {
        val rules = listOf(rule(therapistA, 1, t(9), t(12)), rule(room1, 1, t(10), t(12)))
        val reqs = listOf(RequirementSpec(UUID.randomUUID(), 1, listOf(therapistA)), RequirementSpec(UUID.randomUUID(), 1, listOf(room1)))
        assertEquals(listOf("10:00", "11:00"), starts(query(rules, requirements = reqs)))
        // Room busy at 10:00 → only 11:00.
        val roomBusy = busy(room1, at(monday, 10), at(monday, 11))
        assertEquals(listOf("11:00"), starts(query(rules, requirements = reqs, busy = listOf(roomBusy))))
        // A second room in the pool picks up the slack.
        val rules2 = rules + rule(room2, 1, t(9), t(12))
        val reqs2 = listOf(reqs[0], RequirementSpec(reqs[1].id, 1, listOf(room1, room2)))
        val slots = SlotEngine.findSlots(query(rules2, requirements = reqs2, busy = listOf(roomBusy)))[monday]!!
        assertEquals(listOf("09:00", "10:00", "11:00"), slots.map { ZonedDateTime.ofInstant(it.start, dublin).toLocalTime().toString() })
        assertEquals(setOf(therapistA, room2), slots[1].assignments.map { it.resourceId }.toSet())
    }

    @Test
    fun `quantity two needs two distinct resources and one resource cannot fill two requirements`() {
        val rules = listOf(rule(therapistA, 1, t(9), t(11)), rule(therapistB, 1, t(10), t(11)))
        val two = listOf(RequirementSpec(null, 2, listOf(therapistA, therapistB)))
        assertEquals(listOf("10:00"), starts(query(rules, requirements = two)))
        val sharedPool = listOf(RequirementSpec(null, 1, listOf(therapistA)), RequirementSpec(null, 1, listOf(therapistA, therapistB)))
        val slots = SlotEngine.findSlots(query(rules, requirements = sharedPool))[monday]!!
        assertEquals(listOf("10:00"), slots.map { ZonedDateTime.ofInstant(it.start, dublin).toLocalTime().toString() })
        assertEquals(listOf(therapistA, therapistB), slots[0].assignments.map { it.resourceId })
    }

    @Test
    fun `deterministic choice prefers the resource with fewer booked minutes that day`() {
        val rules = listOf(rule(therapistA, 1, t(9), t(17)), rule(therapistB, 1, t(9), t(17)))
        val reqs = listOf(RequirementSpec(null, 1, listOf(therapistA, therapistB)))
        val none = SlotEngine.findSlots(query(rules, requirements = reqs))[monday]!!
        assertEquals(therapistA, none[0].assignments[0].resourceId) // tie → sort order
        val aBusy = busy(therapistA, at(monday, 15), at(monday, 16))
        val slots = SlotEngine.findSlots(query(rules, requirements = reqs, busy = listOf(aBusy)))[monday]!!
        assertEquals(therapistB, slots[0].assignments[0].resourceId)
    }

    @Test
    fun `each day sees the bookings that overlap it, including one across midnight, and only its own booked minutes`() {
        val tuesday = monday.plusDays(1)
        val rules = listOf(
            rule(therapistA, 1, t(9), t(11)), rule(therapistB, 1, t(9), t(11)),
            rule(therapistA, 2, t(0), t(2)), rule(therapistB, 2, t(9), t(11)), rule(therapistA, 2, t(9), t(11)),
        )
        val reqs = listOf(RequirementSpec(null, 1, listOf(therapistA, therapistB)))
        val lateMonday = busy(therapistA, at(monday, 23), at(tuesday, 1))
        val mondayMorning = busy(therapistB, at(monday, 9), at(monday, 10))
        val days = SlotEngine.findSlots(query(rules, requirements = reqs, to = tuesday, busy = listOf(lateMonday, mondayMorning)))
        // Tuesday 00:00 is blocked by Monday's late booking; 01:00 is free.
        assertEquals(therapistA, days[tuesday]!!.first { it.start == at(tuesday, 1) }.assignments[0].resourceId)
        assertTrue(days[tuesday]!!.none { it.start == at(tuesday, 0) })
        // Monday: A's late booking counts 60 minutes, B's morning one 60 too (tie → sort order); Monday 10:00 goes to A.
        assertEquals(therapistA, days[monday]!!.first { it.start == at(monday, 10) }.assignments[0].resourceId)
        // Tuesday morning: A has 60 minutes booked that day (00:00–01:00), B none, so B is preferred.
        assertEquals(therapistB, days[tuesday]!!.first { it.start == at(tuesday, 9) }.assignments[0].resourceId)
    }

    @Test
    fun `group sessions with capacity greater than one count seats`() {
        val rules = listOf(rule(room1, 1, t(18), t(20)))
        val reqs = listOf(RequirementSpec(null, 1, listOf(room1)))
        val session = at(monday, 18)
        val seats = (1..3).map { busy(room1, session, at(monday, 19), exclusive = false, serviceId = service, sessionStart = session) }
        val slots = SlotEngine.findSlots(query(rules, requirements = reqs, capacity = 4, busy = seats))[monday]!!
        assertEquals(2, slots.size)
        assertEquals(1, slots[0].seatsLeft)
        assertEquals(4, slots[1].seatsLeft)
        val full = seats + busy(room1, session, at(monday, 19), exclusive = false, serviceId = service, sessionStart = session)
        assertEquals(listOf("19:00"), starts(query(rules, requirements = reqs, capacity = 4, busy = full)))
        // A different service's booking on the room blocks the session entirely.
        val other = listOf(busy(room1, session, at(monday, 19), exclusive = true))
        assertEquals(listOf("19:00"), starts(query(rules, requirements = reqs, capacity = 4, busy = other)))
        // Capacity-1 slots report null seats.
        assertEquals(null, SlotEngine.findSlots(query(rules, requirements = reqs))[monday]!![0].seatsLeft)
    }

    @Test
    fun `a booking's own allocations are ignored when rescheduling`() {
        val rules = listOf(rule(therapistA, 1, t(9), t(12)))
        val own = UUID.randomUUID()
        val b = busy(therapistA, at(monday, 9), at(monday, 10), booking = own)
        assertEquals(listOf("10:00", "11:00"), starts(query(rules, busy = listOf(b), step = 60)))
        assertEquals(listOf("09:00", "09:30", "10:00", "10:30", "11:00"), starts(query(rules, busy = listOf(b), step = 30, exclude = own)))
    }

    @Test
    fun `DST fall-back week in Dublin keeps local times and offsets`() {
        val rules = (1..7).map { rule(therapistA, it, t(9), t(10)) }
        val saturday = LocalDate.of(2026, 10, 24)
        val q = query(rules, from = saturday, to = saturday.plusDays(2))
        val days = SlotEngine.findSlots(q)
        val fmt = { i: Instant -> ZonedDateTime.ofInstant(i, dublin).toOffsetDateTime().toString() }
        assertEquals("2026-10-24T09:00+01:00", fmt(days[saturday]!!.single().start))
        assertEquals("2026-10-25T09:00Z", fmt(days[saturday.plusDays(1)]!!.single().start))
        assertEquals("2026-10-26T09:00Z", fmt(days[saturday.plusDays(2)]!!.single().start))
        // A window spanning the repeated hour 01:00–02:00 has five real hours.
        val night = listOf(rule(therapistA, 7, t(0), t(4)))
        val sunday = saturday.plusDays(1)
        val slots = SlotEngine.findSlots(query(night, from = sunday))[sunday]!!
        assertEquals(5, slots.size)
        assertEquals(
            listOf("00:00+01:00", "01:00+01:00", "01:00Z", "02:00Z", "03:00Z"),
            slots.map { ZonedDateTime.ofInstant(it.start, dublin).toOffsetDateTime().toString().substringAfter('T') },
        )
    }

    @Test
    fun `DST spring-forward gap in Dublin has no phantom slots`() {
        val sunday = LocalDate.of(2026, 3, 29)
        val slots = SlotEngine.findSlots(query(listOf(rule(therapistA, 7, t(0), t(4))), from = sunday))[sunday]!!
        // 00:00–04:00 local is only three real hours on the day clocks go forward.
        assertEquals(3, slots.size)
        assertEquals(
            listOf("00:00Z", "02:00+01:00", "03:00+01:00"),
            slots.map { ZonedDateTime.ofInstant(it.start, dublin).toOffsetDateTime().toString().substringAfter('T') },
        )
    }

    @Test
    fun `non-Dublin timezone across its own DST change`() {
        val ny = ZoneId.of("America/New_York")
        val rules = (1..7).map { rule(therapistA, it, t(9), t(10)) }
        val saturday = LocalDate.of(2026, 10, 31)
        val days = SlotEngine.findSlots(query(rules, from = saturday, to = saturday.plusDays(2), zone = ny))
        val fmt = { i: Instant -> ZonedDateTime.ofInstant(i, ny).toOffsetDateTime().toString() }
        assertEquals("2026-10-31T09:00-04:00", fmt(days[saturday]!!.single().start))
        assertEquals("2026-11-02T09:00-05:00", fmt(days[saturday.plusDays(2)]!!.single().start))
        assertEquals(Instant.parse("2026-10-31T13:00:00Z"), days[saturday]!!.single().start)
        assertEquals(Instant.parse("2026-11-02T14:00:00Z"), days[saturday.plusDays(2)]!!.single().start)
    }

    @Test
    fun `empty or unsatisfiable requirements produce no slots`() {
        val rules = listOf(rule(therapistA, 1, t(9), t(12)))
        assertEquals(emptyList(), starts(query(rules, requirements = emptyList())))
        assertEquals(emptyList(), starts(query(rules, requirements = listOf(RequirementSpec(null, 2, listOf(therapistA))))))
    }

    @Test
    fun `window merge and subtract helpers`() {
        val merged = Windows.merge(listOf(MinuteInterval(60, 120), MinuteInterval(0, 30), MinuteInterval(100, 200), MinuteInterval(30, 40)))
        assertEquals(listOf(MinuteInterval(0, 40), MinuteInterval(60, 200)), merged)
        assertEquals(
            listOf(MinuteInterval(0, 10), MinuteInterval(20, 40)), Windows.subtract(listOf(MinuteInterval(0, 40)), MinuteInterval(10, 20)),
        )
        assertEquals(emptyList(), Windows.subtract(listOf(MinuteInterval(10, 20)), MinuteInterval(0, 40)))
    }

    @Test
    fun `available minutes are DST aware`() {
        val sunday = LocalDate.of(2026, 10, 25)
        assertEquals(
            300, Windows.availableMinutes(therapistA, sunday, sunday, dublin, listOf(rule(therapistA, 7, t(0), t(4))), emptyList()),
        )
    }

    @Test
    fun `candidate starts step through each window, leave room for buffers and drop duplicates`() {
        val nine = at(monday, 9)
        val windows = listOf(TimeInterval(nine, at(monday, 11)), TimeInterval(nine, at(monday, 10, 30)))
        val starts = SlotEngine.candidateStarts(windows, Duration.ofMinutes(15), Duration.ofMinutes(45), Duration.ofMinutes(30))
        assertEquals(listOf(at(monday, 9, 15), at(monday, 9, 45), at(monday, 10, 15)), starts.toList())
        assertTrue(SlotEngine.candidateStarts(windows, Duration.ofMinutes(90), Duration.ofMinutes(60), Duration.ofMinutes(30)).isEmpty())
    }

    @Test
    fun `distinct picking backtracks so one resource never fills two requirements`() {
        fun c(id: UUID) = SlotEngine.Candidate(id, 0, 0, 0)
        // Therapist A is preferred for both, but only A can fill the first requirement, so B must take the second.
        val picked = SlotEngine.pickDistinct(listOf(listOf(c(therapistA)), listOf(c(therapistA), c(therapistB))), listOf(1, 1))
        assertEquals(listOf(0 to therapistA, 1 to therapistB), picked!!.map { (i, cand) -> i to cand.resourceId })
        assertEquals(
            listOf(therapistA, therapistB),
            SlotEngine.pickDistinct(listOf(listOf(c(therapistA), c(therapistB))), listOf(2))!!.map {
                it.second.resourceId
            },
        )
        assertEquals(null, SlotEngine.pickDistinct(listOf(listOf(c(therapistA)), listOf(c(therapistA))), listOf(1, 1)))
        assertEquals(null, SlotEngine.pickDistinct(listOf(listOf(c(therapistA))), listOf(2)))
    }
}
