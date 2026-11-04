package ie.bookanything.booking

import ie.bookanything.http.ApiException
import ie.bookanything.services.RequirementDef
import ie.bookanything.services.toDef
import ie.bookanything.support.SiteFixtures
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StaffScopeTest {
    private val mine = UUID.randomUUID()
    private val mine2 = UUID.randomUUID()
    private val other = UUID.randomUUID()
    private val staff = StaffScope(setOf(mine, mine2))
    private val admin = StaffScope(null)

    private fun forbidden(message: String, block: () -> Unit) {
        val e = assertFailsWith<ApiException> { block() }
        assertEquals(403, e.status.value)
        assertEquals(message, e.message)
    }

    @Test
    fun `staff see bookings on their own resources only, admins see all`() {
        assertTrue(staff.covers(bookingRow(listOf(other, mine))))
        assertFalse(staff.covers(bookingRow(listOf(other))))
        assertFalse(staff.covers(bookingRow(emptyList())))
        assertTrue(admin.covers(bookingRow(listOf(other))))
        assertTrue(staff.isLimited)
        assertFalse(admin.isLimited)
    }

    @Test
    fun `new bookings use the requested own resources, else all of them`() {
        assertEquals(listOf(mine), staff.forNewBooking(listOf(mine)))
        assertEquals(setOf(mine, mine2), staff.forNewBooking(null)!!.toSet())
        forbidden(StaffScope.BOOK_OWN_ONLY) { staff.forNewBooking(listOf(mine, other)) }
        forbidden(StaffScope.BOOK_OWN_ONLY) { staff.forNewBooking(emptyList()) }
        forbidden(StaffScope.BOOK_OWN_ONLY) { StaffScope(emptySet()).forNewBooking(null) }
        assertNull(admin.forNewBooking(null))
        assertEquals(listOf(other), admin.forNewBooking(listOf(other)))
    }

    @Test
    fun `moves keep the requested resources, else a staff member's booking keeps its own`() {
        val booking = bookingRow(listOf(mine, other))
        assertEquals(listOf(mine2), staff.forMove(listOf(mine2), booking))
        assertEquals(listOf(mine, other), staff.forMove(null, booking))
        assertEquals(listOf(mine, other), staff.forMove(emptyList(), booking), "an empty request is no request")
        assertNull(admin.forMove(emptyList(), booking))
        assertNull(admin.forMove(null, booking))
        staff.requireOwn(null, StaffScope.VIEW_OWN_ONLY)
        staff.requireOwn(listOf(mine), StaffScope.VIEW_OWN_ONLY)
        admin.requireOwn(listOf(other), StaffScope.VIEW_OWN_ONLY)
        forbidden(StaffScope.VIEW_OWN_ONLY) { staff.requireOwn(listOf(other), StaffScope.VIEW_OWN_ONLY) }
    }

    /** A service whose one requirement can use [pool]. */
    private fun serviceUsing(vararg pool: UUID) =
        SiteFixtures.service().toDef().copy(requirements = listOf(RequirementDef(UUID.randomUUID(), "Who", 1, false, pool.toList(), 0)))

    @Test
    fun `availability narrows requests to own resources and refuses when none is left`() {
        val both = serviceUsing(mine, mine2, other)
        assertEquals(listOf(mine), staff.forAvailability(listOf(mine, other), both))
        assertEquals(setOf(mine, mine2), staff.forAvailability(null, both)!!.toSet())
        forbidden(StaffScope.VIEW_OWN_ONLY) { staff.forAvailability(listOf(other), both) }
        assertNull(admin.forAvailability(null, both))
        assertEquals(listOf(other), admin.forAvailability(listOf(other), both))
    }

    @Test
    fun `without a request, staff see and book only those of their resources the service can use`() {
        assertEquals(listOf(mine2), staff.forAvailability(null, serviceUsing(mine2, other)))
        forbidden(StaffScope.VIEW_OWN_ONLY) { staff.forAvailability(null, serviceUsing(other)) }
        assertEquals(listOf(mine2), StaffScope.usableFor(listOf(mine, mine2), serviceUsing(mine2, other)))
        assertEquals(emptyList(), StaffScope.usableFor(listOf(mine), serviceUsing(other)))
        assertTrue(staff.defaultsForNewBooking(null))
        assertFalse(staff.defaultsForNewBooking(listOf(mine)))
        assertFalse(admin.defaultsForNewBooking(null))
    }

    @Test
    fun `list filters narrow to own resources and admins filter only on request`() {
        assertEquals(setOf(mine, mine2), staff.listFilter(emptyList()))
        assertEquals(setOf(mine), staff.listFilter(listOf(mine, other)))
        assertEquals(emptySet(), staff.listFilter(listOf(other)))
        assertNull(admin.listFilter(emptyList()))
        assertEquals(setOf(other), admin.listFilter(listOf(other)))
    }
}
