package ie.bookanything.availability

import ie.bookanything.business.Policies
import ie.bookanything.http.ApiException
import ie.bookanything.services.RequirementDef
import ie.bookanything.services.toDef
import ie.bookanything.support.SiteFixtures
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** The pure parts of [AvailabilityService]: requirement pools and the booking window. */
class AvailabilityRulesTest {
    private val alex = UUID.randomUUID()
    private val sam = UUID.randomUUID()
    private val room = UUID.randomUUID()
    private val retired = UUID.randomUUID()
    private val therapist = RequirementDef(UUID.randomUUID(), "Therapist", 1, true, listOf(alex, sam, retired), 0)
    private val rooms = RequirementDef(UUID.randomUUID(), "Room", 1, false, listOf(room), 1)
    private val service = SiteFixtures.service().toDef().copy(requirements = listOf(therapist, rooms))
    private val active = setOf(alex, sam, room)

    private fun pools(selected: UUID? = null, forced: List<UUID>? = null) =
        AvailabilityService.requirementPools(service, active, selected, forced).map { it.pool }

    @Test
    fun `pools hold the active resources, narrowed by the customer's choice and staff's resources`() {
        assertEquals(listOf(listOf(alex, sam), listOf(room)), pools())
        assertEquals(listOf(listOf(sam), listOf(room)), pools(selected = sam))
        assertEquals(listOf(listOf(alex), listOf(room)), pools(forced = listOf(alex)))
        // A forced resource narrows only the requirement it belongs to.
        assertEquals(listOf(listOf(alex, sam), listOf(room)), pools(forced = listOf(room)))
    }

    @Test
    fun `choices the service can't use are field errors`() {
        val notSelectable = assertFailsWith<ApiException> { pools(selected = room) }
        assertEquals(mapOf("resourceId" to "That choice is not available for this service"), notSelectable.fields)
        assertFailsWith<ApiException> { pools(selected = retired) }
        val foreign = assertFailsWith<ApiException> { pools(forced = listOf(UUID.randomUUID())) }
        assertEquals(mapOf("resourceIds" to "Resource cannot be used for this service"), foreign.fields)
        assertFailsWith<ApiException> { pools(forced = listOf(retired)) }
    }

    @Test
    fun `customers need notice and may book up to the max advance, staff from now on`() {
        val now = Instant.parse("2026-10-05T08:00:00Z")
        val business = SiteFixtures.business(policies = Policies(minNoticeMinutes = 90, maxAdvanceDays = 30))
        assertEquals(
            BookingWindow(now.plusSeconds(90 * 60), LocalDate.parse("2026-11-04")),
            AvailabilityService.bookingWindow(service, business, AvailabilityMode.PUBLIC, now),
        )
        assertEquals(
            BookingWindow(now.plusSeconds(15 * 60), LocalDate.parse("2026-10-12")),
            AvailabilityService.bookingWindow(
                service.copy(minNoticeMinutes = 15, maxAdvanceDays = 7), business, AvailabilityMode.PUBLIC, now,
            ),
        )
        assertEquals(BookingWindow(now, null), AvailabilityService.bookingWindow(service, business, AvailabilityMode.STAFF, now))
    }
}
