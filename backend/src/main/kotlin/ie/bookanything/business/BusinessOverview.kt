package ie.bookanything.business

import ie.bookanything.auth.BusinessAccess
import ie.bookanything.availability.AvailabilityRepository
import ie.bookanything.booking.BookingDto
import ie.bookanything.booking.BookingRepository
import ie.bookanything.booking.StaffScope
import ie.bookanything.db.UuidArray
import ie.bookanything.http.startIn
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.payments.PaymentRepository
import ie.bookanything.resources.ResourceRepository
import ie.bookanything.services.ServiceRepository
import kotlinx.serialization.Serializable
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.time.LocalDate

/** The dashboard overview (`GET /overview`), also used by the assistant. Staff see only their own resources and no revenue. */
@Serializable
data class ChecklistItem(val key: String, val done: Boolean)

@Serializable
data class OverviewDto(
    val today: List<BookingDto>,
    val upcomingCount7d: Int,
    val revenueCents30d: Int,
    val bookings30d: Int,
    val checklist: List<ChecklistItem>,
)

object BusinessOverview {
    fun compute(conn: Connection, access: BusinessAccess, payments: PaymentProvider, now: Instant): OverviewDto {
        val b = access.business
        val today = LocalDate.ofInstant(now, b.zone)
        val dayStart = today.startIn(b.zone)
        val dayEnd = today.plusDays(1).startIn(b.zone)
        val staff = access.isStaffOnly
        val scope = if (staff) " AND ${StaffScope.ON_RESOURCES_SQL}" else ""
        val scopeParams: Array<Any?> = if (staff) arrayOf(UuidArray(access.linkedResourceIds)) else emptyArray()
        val todays = BookingRepository.load(
            conn,
            "b.business_id = ? AND b.start_at >= ? AND b.start_at < ? AND b.status NOT IN ('expired', 'cancelled')$scope",
            b.id, dayStart, dayEnd, *scopeParams,
        )
        val onResources = if (staff) access.linkedResourceIds else null
        val upcoming = BookingRepository.countBlockingStarting(conn, b.id, now, now.plus(Duration.ofDays(7)), onResources)
        val since = now.minus(Duration.ofDays(30))
        val bookings30 = BookingRepository.countCreatedSince(conn, b.id, since, onResources)
        val revenue = if (staff) 0L else PaymentRepository.netTakenSince(conn, b.id, since)
        val checklist = listOf(
            ChecklistItem("services", ServiceRepository.anyActive(conn, b.id)),
            ChecklistItem("resources", ResourceRepository.anyActive(conn, b.id)),
            ChecklistItem("availability", AvailabilityRepository.anyRules(conn, b.id)),
            ChecklistItem("payments", payments.chargesEnabled(b) || !ServiceRepository.anyNeedsOnlinePayment(conn, b.id)),
            ChecklistItem("branding", b.branding.logoUrl != null || b.branding.primaryColor != Branding.DEFAULT_PRIMARY_COLOR),
            ChecklistItem("publish", b.status == "active"),
        )
        return OverviewDto(todays.map { BookingRepository.toDto(it, b) }, upcoming.toInt(), revenue.toInt(), bookings30.toInt(), checklist)
    }
}
