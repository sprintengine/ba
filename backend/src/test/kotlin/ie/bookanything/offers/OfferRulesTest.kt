package ie.bookanything.offers

import ie.bookanything.http.ApiException
import ie.bookanything.http.Validator
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OfferRulesTest {
    private val dublin = ZoneId.of("Europe/Dublin")
    private val service = UUID.fromString("00000000-0000-0000-0000-00000000000a")
    private val other = UUID.fromString("00000000-0000-0000-0000-00000000000b")

    /** Monday 5 October 2026, 09:00 in Dublin (IST, UTC+1). */
    private val now = Instant.parse("2026-10-05T08:00:00Z")

    private fun offer(
        schedule: OfferSchedule = OfferSchedule(), discount: Discount = Discount.Percent(20),
        id: String = "00000000-0000-0000-0000-000000000001",
        created: Instant = Instant.parse("2026-01-01T00:00:00Z"), max: Int? = null, status: OfferStatus = OfferStatus.ACTIVE,
        services: Set<UUID> = setOf(service),
    ) = OfferRule(UUID.fromString(id), "Offer $id", services, discount, schedule, max, status, created)

    private fun at(local: String, zone: ZoneId = dublin) = java.time.LocalDateTime.parse(local).atZone(zone).toInstant()
    private fun covers(
        o: OfferRule, local: String, zone: ZoneId = dublin, now: Instant = this.now,
    ) = OfferMatcher.matches(o, service, at(local, zone), zone, now)

    @Test
    fun `days of week and time windows are evaluated in the business timezone`() {
        val tuesdayAfternoons = offer(OfferSchedule(setOf(2), listOf(TimeWindow(LocalTime.of(13, 0), LocalTime.of(17, 0)))))
        assertTrue(covers(tuesdayAfternoons, "2026-10-06T13:00"))
        assertTrue(covers(tuesdayAfternoons, "2026-10-06T16:59"))
        assertFalse(covers(tuesdayAfternoons, "2026-10-06T17:00"), "window end is exclusive")
        assertFalse(covers(tuesdayAfternoons, "2026-10-06T12:59"))
        assertFalse(covers(tuesdayAfternoons, "2026-10-07T14:00"), "Wednesday")
        // 13:30 in Dublin is 12:30 UTC: judged in local time, not UTC.
        assertTrue(OfferMatcher.matches(tuesdayAfternoons, service, Instant.parse("2026-10-06T12:30:00Z"), dublin, now))
        // The same instant is 08:30 in New York: not an afternoon there.
        assertFalse(
            OfferMatcher.matches(tuesdayAfternoons, service, Instant.parse("2026-10-06T12:30:00Z"), ZoneId.of("America/New_York"), now),
        )
    }

    @Test
    fun `local windows survive daylight saving changes`() {
        // Clocks go back on Sunday 25 October 2026 in Dublin; 14:00 local is 14:00 UTC after the change (13:00 UTC before).
        val sundayAfternoon = offer(OfferSchedule(setOf(7), listOf(TimeWindow(LocalTime.of(14, 0), LocalTime.of(15, 0)))))
        assertTrue(OfferMatcher.matches(sundayAfternoon, service, Instant.parse("2026-10-25T14:00:00Z"), dublin, now))
        assertFalse(OfferMatcher.matches(sundayAfternoon, service, Instant.parse("2026-10-25T13:00:00Z"), dublin, now))
        assertTrue(
            OfferMatcher.matches(sundayAfternoon, service, Instant.parse("2026-10-18T13:00:00Z"), dublin, now),
            "the Sunday before is still IST",
        )
        // Spring forward (29 March 2026): 01:30 local does not exist; 02:30 local is 01:30 UTC.
        val earlyHours = offer(OfferSchedule(windows = listOf(TimeWindow(LocalTime.of(2, 0), LocalTime.of(3, 0)))))
        assertTrue(
            OfferMatcher.matches(earlyHours, service, Instant.parse("2026-03-29T01:30:00Z"), dublin, Instant.parse("2026-03-01T00:00:00Z")),
        )
    }

    @Test
    fun `last-minute offers cover slots starting within the window from now`() {
        val lastMinute = offer(OfferSchedule(lastMinuteHours = 3))
        assertTrue(covers(lastMinute, "2026-10-05T10:00"))
        assertTrue(covers(lastMinute, "2026-10-05T12:00"), "exactly three hours ahead")
        assertFalse(covers(lastMinute, "2026-10-05T12:01"))
        assertFalse(covers(lastMinute, "2026-10-05T09:00"), "starting now is not in the future")
        // Combined with a schedule, both must hold.
        val weekdayLastMinute = offer(OfferSchedule(setOf(1, 2, 3, 4, 5), lastMinuteHours = 48))
        assertTrue(covers(weekdayLastMinute, "2026-10-06T09:00"))
        assertFalse(covers(weekdayLastMinute, "2026-10-04T09:00"))
    }

    @Test
    fun `date ranges are inclusive and use the local date`() {
        val october = offer(OfferSchedule(validFrom = LocalDate.of(2026, 10, 6), validUntil = LocalDate.of(2026, 10, 31)))
        assertFalse(covers(october, "2026-10-05T23:59"))
        assertTrue(covers(october, "2026-10-06T00:00"))
        assertTrue(covers(october, "2026-10-31T23:30"))
        assertFalse(covers(october, "2026-11-01T00:00"))
        // 23:30 local on the 31st is 23:30 UTC (after the clocks change), still the 31st locally.
        assertTrue(OfferMatcher.matches(october, service, Instant.parse("2026-10-31T23:30:00Z"), dublin, now))
    }

    @Test
    fun `paused offers and other services never match`() {
        assertFalse(covers(offer(status = OfferStatus.PAUSED), "2026-10-06T10:00"))
        assertFalse(OfferMatcher.matches(offer(), other, at("2026-10-06T10:00"), dublin, now))
    }

    @Test
    fun `the best offer is the largest discount, ties go to the older offer then the lower id`() {
        val start = at("2026-10-06T14:00")
        val tenPercent = offer(discount = Discount.Percent(10), id = "00000000-0000-0000-0000-000000000001")
        val fiveEuro = offer(discount = Discount.Fixed(500), id = "00000000-0000-0000-0000-000000000002")
        // On €40, 10% = €4 < €5; on €80, 10% = €8 > €5.
        assertEquals(fiveEuro.id, OfferMatcher.best(listOf(tenPercent, fiveEuro), service, start, dublin, now, 4000)!!.offer.id)
        assertEquals(tenPercent.id, OfferMatcher.best(listOf(tenPercent, fiveEuro), service, start, dublin, now, 8000)!!.offer.id)
        // €50 each: 10% == €5. Older wins; with the same age, the lower id.
        val newer = offer(
            discount = Discount.Fixed(500), id = "00000000-0000-0000-0000-000000000003", created = Instant.parse("2026-02-01T00:00:00Z"),
        )
        assertEquals(tenPercent.id, OfferMatcher.best(listOf(newer, tenPercent), service, start, dublin, now, 5000)!!.offer.id)
        assertEquals(tenPercent.id, OfferMatcher.best(listOf(fiveEuro, tenPercent), service, start, dublin, now, 5000)!!.offer.id)
    }

    @Test
    fun `offers without capacity or discount do not apply`() {
        val start = at("2026-10-06T14:00")
        val capped = offer(max = 2)
        assertNotNull(OfferMatcher.best(listOf(capped), service, start, dublin, now, 4000, mapOf(capped.id to 1)))
        assertNull(OfferMatcher.best(listOf(capped), service, start, dublin, now, 4000, mapOf(capped.id to 2)))
        assertNull(OfferMatcher.best(listOf(offer()), service, start, dublin, now, 0), "a free service has nothing to discount")
    }

    @Test
    fun `discounts round to the cent in the customer's favour and never exceed the price`() {
        assertEquals(1000, Discount.Percent(20).amountOff(5000))
        assertEquals(333, Discount.Percent(10).amountOff(3333)) // 333.3
        assertEquals(167, Discount.Percent(5).amountOff(3333)) // 166.65 rounds up
        assertEquals(3333, Discount.Percent(100).amountOff(3333))
        assertEquals(1500, Discount.Fixed(2000).amountOff(1500))
        val applied = AppliedOffer(offer(discount = Discount.Fixed(1500)), 6000, 1500)
        assertEquals(4500, applied.finalCents)
        assertFailsWith<IllegalArgumentException> { Discount.Percent(0) }
        assertFailsWith<IllegalArgumentException> { TimeWindow(LocalTime.of(10, 0), LocalTime.of(10, 0)) }
    }

    @Test
    fun `labels and summaries read naturally`() {
        assertEquals("20% off", OfferText.label(Discount.Percent(20), "EUR"))
        assertEquals("€5 off", OfferText.label(Discount.Fixed(500), "EUR"))
        assertEquals("€2.50 off", OfferText.label(Discount.Fixed(250), "EUR"))
        assertEquals("Free", OfferText.label(Discount.Percent(100), "EUR"))
        assertEquals(
            "Tue, 13:00–17:00", OfferText.summary(OfferSchedule(setOf(2), listOf(TimeWindow(LocalTime.of(13, 0), LocalTime.of(17, 0))))),
        )
        assertEquals("Mon–Fri", OfferText.days(setOf(1, 2, 3, 4, 5)))
        assertEquals("Tue and Thu", OfferText.days(setOf(2, 4)))
        assertEquals("Starting within 3 hours", OfferText.summary(OfferSchedule(lastMinuteHours = 3)))
        assertEquals("Any time", OfferText.summary(OfferSchedule()))
    }

    @Test
    fun `kinds follow the schedule`() {
        assertEquals(OfferKind.LAST_MINUTE, offer(OfferSchedule(lastMinuteHours = 2)).kind)
        assertEquals(OfferKind.OFF_PEAK, offer(OfferSchedule(setOf(2))).kind)
        assertEquals(OfferKind.ALWAYS, offer().kind)
    }

    private fun input(
        discount: DiscountDto = DiscountDto.Percent(20), schedule: OfferScheduleDto = OfferScheduleDto(), name: String = "Deal",
        services: List<String> = listOf(service.toString()), from: String? = null, until: String? = null, max: Int? = null,
    ) = OfferInput(name, null, services, discount, schedule, from, until, max)

    private fun errors(i: OfferInput): Map<String, String> = Validator().also { OfferValidation.validate(i, it) }.errors()

    @Test
    fun `offer input validation reports every problem by field`() {
        assertNotNull(OfferValidation.validate(input()))
        assertEquals("Must be between 1 and 100", errors(input(discount = DiscountDto.Percent(0)))["discount.percent"])
        assertEquals("Must be more than 0", errors(input(discount = DiscountDto.Fixed(0)))["discount.amountCents"])
        assertEquals("Choose at least one service", errors(input(services = emptyList()))["serviceIds"])
        assertEquals("Must be a valid id", errors(input(services = listOf("nope")))["serviceIds[0]"])
        assertEquals("Required", errors(input(name = " "))["name"])
        val badDays = errors(input(schedule = OfferScheduleDto(daysOfWeek = listOf(0, 8))))
        assertTrue("schedule.daysOfWeek[0]" in badDays && "schedule.daysOfWeek[1]" in badDays)
        assertEquals(
            "Must be after the start",
            errors(
                input(schedule = OfferScheduleDto(timeWindows = listOf(TimeWindowDto("17:00", "13:00")))),
            )["schedule.timeWindows[0].end"],
        )
        assertEquals(
            "Time windows must not overlap",
            errors(
                input(
                    schedule = OfferScheduleDto(
                        timeWindows = listOf(
                            TimeWindowDto("09:00", "12:00"),
                            TimeWindowDto("11:00", "13:00"),
                        ),
                    ),
                ),
            )["schedule.timeWindows"],
        )
        assertEquals(
            "Must be a time in HH:mm format",
            errors(
                input(
                    schedule = OfferScheduleDto(
                        timeWindows = listOf(
                            TimeWindowDto(
                                "9am",
                                "12:00",
                            ),
                        ),
                    ),
                ),
            )["schedule.timeWindows[0].start"],
        )
        assertEquals(
            "Must be between 1 and 168", errors(input(schedule = OfferScheduleDto(lastMinuteHours = 0)))["schedule.lastMinuteHours"],
        )
        assertEquals("Must be on or after the start date", errors(input(from = "2026-10-10", until = "2026-10-01"))["validUntil"])
        assertEquals("Must be between 1 and 100000", errors(input(max = 0))["maxRedemptions"])
        assertFailsWith<ApiException> { Validator().also { OfferValidation.validate(input(max = 0), it) }.throwIfInvalid() }
    }

    @Test
    fun `a valid offer keeps its windows in time order and its days and dates`() {
        val spec = OfferValidation.validate(
            input(
                schedule = OfferScheduleDto(listOf(6, 7), listOf(TimeWindowDto("14:00", "16:00"), TimeWindowDto("09:00", "11:00")), 24),
                from = "2026-10-01", until = "2026-10-31", max = 10,
            ),
        )!!
        assertEquals(listOf("09:00", "14:00"), spec.schedule.windows.map { it.start.toString() })
        assertEquals(setOf(6, 7), spec.schedule.daysOfWeek)
        assertEquals("2026-10-31", spec.schedule.validUntil.toString())
        assertEquals(10, spec.maxRedemptions)
        val largest = OfferValidation.discount(DiscountDto.Fixed(OfferValidation.MAX_FIXED_CENTS), Validator())
        assertEquals(Discount.Fixed(OfferValidation.MAX_FIXED_CENTS), largest)
    }
}
