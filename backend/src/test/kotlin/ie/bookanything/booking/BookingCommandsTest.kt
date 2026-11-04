package ie.bookanything.booking

import ie.bookanything.audit.Actor
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.payments.CancelActor
import ie.bookanything.payments.RefundOverride
import ie.bookanything.services.toDef
import ie.bookanything.support.SiteFixtures
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The request types of the booking engine and lifecycle. */
class BookingCommandsTest {
    private val business = SiteFixtures.business()
    private val service = SiteFixtures.service().toDef()

    @Test
    fun `a slot check asks for exactly its start on that day in the business timezone`() {
        // 23:30 UTC on 10 October is 00:30 on 11 October in Dublin (summer time).
        val start = Instant.parse("2026-10-10T23:30:00Z")
        val req = SlotCheck(service, start, AvailabilityMode.PUBLIC, addonIds = listOf(UUID.randomUUID())).toRequest(business)
        assertEquals(LocalDate.parse("2026-10-11"), req.from)
        assertEquals(req.from, req.to)
        assertEquals(start, req.onlyStart)
        assertEquals(AvailabilityMode.PUBLIC, req.mode)
        assertNull(req.excludeBookingId)
    }

    @Test
    fun `moving a booking keeps its group and duration and ignores its own allocations`() {
        val mine = UUID.randomUUID()
        val booking = bookingRow(listOf(mine)).copy(groupId = UUID.randomUUID())
        val start = Instant.parse("2026-10-12T09:00:00Z")
        val check = SlotCheck.move(booking, service, start, AvailabilityMode.STAFF, forcedResourceIds = listOf(mine))
        assertEquals(booking.groupId, check.groupId)
        assertEquals(booking.id, check.excludeBookingId)
        assertEquals(60, check.fixedDurationMinutes)
        assertEquals(listOf(mine), check.forcedResourceIds)
        assertNull(check.optionId)
        assertTrue(check.addonIds.isEmpty())
    }

    @Test
    fun `customer moves and cancellations follow the customer rules`() {
        val id = UUID.randomUUID()
        val start = Instant.parse("2026-10-12T09:00:00Z")
        val actor = Actor.customer(null)
        val resource = UUID.randomUUID()
        assertEquals(
            Reschedule(id, start, AvailabilityMode.PUBLIC, actor, notifyCustomer = true, selectedResourceId = resource),
            Reschedule.byCustomer(id, start, resource, actor),
        )
        assertEquals(
            Reschedule(id, start, AvailabilityMode.STAFF, actor, notifyCustomer = false, forcedResourceIds = listOf(resource)),
            Reschedule.byStaff(id, start, listOf(resource), actor, notifyCustomer = false),
        )
        assertEquals(
            Cancellation(CancelActor.CUSTOMER, actor, "Ill", RefundOverride.POLICY, notifyCustomer = true),
            Cancellation.byCustomer(actor, "Ill"),
        )
    }
}
