package ie.bookanything.reports

import kotlinx.serialization.Serializable

@Serializable
data class ReportTotals(
    val bookings: Int, val confirmed: Int, val cancelled: Int, val noShows: Int,
    val revenueCents: Int, val refundedCents: Int, val newCustomers: Int,
)

@Serializable
data class ReportDay(val date: String, val bookings: Int, val revenueCents: Int)

@Serializable
data class ReportService(val serviceId: String, val name: String, val bookings: Int, val revenueCents: Int)

@Serializable
data class ReportResource(
    val resourceId: String, val name: String, val bookedMinutes: Int, val availableMinutes: Int, val utilisation: Double,
)

@Serializable
data class ReportSummary(
    val from: String, val to: String, val currency: String, val totals: ReportTotals,
    val byDay: List<ReportDay>, val byService: List<ReportService>, val byResource: List<ReportResource>,
)
