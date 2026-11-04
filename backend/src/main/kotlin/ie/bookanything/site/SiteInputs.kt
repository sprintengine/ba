package ie.bookanything.site

import ie.bookanything.availability.MinuteInterval
import ie.bookanything.availability.Windows
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.int
import ie.bookanything.db.localTime
import ie.bookanything.db.query
import ie.bookanything.resources.ResourceDto
import ie.bookanything.resources.ResourceRepository
import ie.bookanything.services.ServiceDto
import ie.bookanything.services.ServiceRepository
import kotlinx.serialization.Serializable
import java.sql.Connection
import java.time.LocalDate
import java.util.Locale

@Serializable
data class SiteTeamPerson(val id: String, val name: String, val description: String?)

@Serializable
data class HoursInterval(val start: String, val end: String)

@Serializable
data class OpeningDay(val dayOfWeek: Int, val intervals: List<HoursInterval>)

/** Live data the renderer needs next to the plan (section 15.5). */
@Serializable
data class SiteContext(val team: List<SiteTeamPerson>, val openingHours: List<OpeningDay>)

/** Everything about a business that site generation, validation and rendering read, loaded in one transaction. */
data class SiteInputs(
    val business: BusinessRow,
    /** Every service of the business (plans may reference any; the renderer shows public, active ones). */
    val services: List<ServiceDto>,
    /** Active `person` resources in sort order. */
    val team: List<ResourceDto>,
    val context: SiteContext,
) {
    val publicServices: List<ServiceDto> get() = services.filter { it.isPublic && it.isActive }

    fun refs(uploadPrefix: String?) = SiteRefs(services.map { it.id }.toSet(), team.map { it.id }.toSet(), uploadPrefix)

    companion object {
        /** [today] is the current date in the business timezone (rules valid today make up the opening hours). */
        fun load(conn: Connection, business: BusinessRow, today: LocalDate): SiteInputs {
            val services = ServiceRepository.list(conn, business.id)
            val team = team(conn, business)
            return SiteInputs(business, services, team, context(conn, business, team, today))
        }

        /** Just the live [SiteContext], for showing a plan that is already built (the published one). */
        fun context(conn: Connection, business: BusinessRow, today: LocalDate): SiteContext =
            context(conn, business, team(conn, business), today)

        private fun team(conn: Connection, business: BusinessRow): List<ResourceDto> =
            ResourceRepository.list(conn, business.id).filter { it.kind == "person" && it.isActive }

        private fun context(conn: Connection, business: BusinessRow, team: List<ResourceDto>, today: LocalDate) = SiteContext(
            team = team.map { SiteTeamPerson(it.id, it.name, it.description) },
            openingHours = openingHours(conn, business, today),
        )

        /**
         * Mon..Sun, each the union of the weekly rules of all active resources that are valid on [today]
         * (audiences ignored), merged into disjoint intervals. Empty intervals = closed.
         */
        fun openingHours(conn: Connection, business: BusinessRow, today: LocalDate): List<OpeningDay> {
            val rows = conn.query(
                """
                SELECT r.day_of_week, r.start_time, r.end_time FROM availability_rules r
                JOIN resources res ON res.business_id = r.business_id AND res.id = r.resource_id
                WHERE r.business_id = ? AND res.is_active
                  AND (r.valid_from IS NULL OR r.valid_from <= ?) AND (r.valid_until IS NULL OR r.valid_until >= ?)
                """.trimIndent(),
                business.id, today, today,
            ) { rs ->
                val start = rs.localTime("start_time")
                val end = rs.localTime("end_time")
                rs.int("day_of_week") to MinuteInterval(start.hour * 60 + start.minute, end.hour * 60 + end.minute)
            }
            val byDay = rows.groupBy({ it.first }, { it.second })
            return (1..7).map { day ->
                OpeningDay(day, Windows.merge(byDay[day].orEmpty()).map { HoursInterval(hhmm(it.start), hhmm(it.end)) })
            }
        }

        private fun hhmm(minutes: Int) = "%02d:%02d".format(Locale.ROOT, minutes / 60, minutes % 60)
    }
}
