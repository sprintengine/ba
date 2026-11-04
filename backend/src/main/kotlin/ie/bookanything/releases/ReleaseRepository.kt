package ie.bookanything.releases

import ie.bookanything.db.UuidArray
import ie.bookanything.db.bool
import ie.bookanything.db.instant
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.intOrNull
import ie.bookanything.db.localDate
import ie.bookanything.db.localDateOrNull
import ie.bookanything.db.localTime
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidList
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** A release schedule row with its bookkeeping. */
data class StoredSchedule(val schedule: ReleaseSchedule, val createdAt: Instant, val updatedAt: Instant)

/** A release change with who made it, for the dashboard. */
data class StoredChange(val change: ReleaseChange, val changedBy: String?, val changedAt: Instant)

/** A validated schedule, ready to store. */
data class ScheduleSpec(
    val name: String,
    val timing: ReleaseTiming,
    val serviceIds: Set<UUID>,
    val everyone: Boolean,
    val groupIds: Set<UUID>,
    val status: ReleaseStatus,
)

object ReleaseRepository {
    private const val COLUMNS = """
        s.business_id, s.id, s.name, s.cadence, s.release_time, s.days_before, s.weekdays_only, s.weekday, s.weeks_ahead,
        s.everyone, s.status, s.created_at, s.updated_at,
        COALESCE((SELECT array_agg(x.service_id) FROM release_schedule_services x WHERE x.schedule_id = s.id), '{}') AS service_ids,
        COALESCE((SELECT array_agg(g.group_id) FROM release_schedule_groups g WHERE g.schedule_id = s.id), '{}') AS group_ids
    """

    private fun schedule(rs: ResultSet) = ReleaseSchedule(
        id = rs.uuid("id"),
        name = rs.str("name"),
        timing = ReleaseTiming(
            cadence = ReleaseCadence.parse(rs.str("cadence")), time = rs.localTime("release_time"),
            daysBefore = rs.intOrNull("days_before") ?: 0, weekdaysOnly = rs.bool("weekdays_only"),
            weekday = rs.intOrNull("weekday") ?: 1, weeksAhead = rs.intOrNull("weeks_ahead") ?: 1,
        ),
        serviceIds = rs.uuidList("service_ids").toSet(),
        everyone = rs.bool("everyone"),
        groupIds = rs.uuidList("group_ids").toSet(),
        status = ReleaseStatus.parse(rs.str("status")),
    )

    private fun stored(rs: ResultSet) = StoredSchedule(schedule(rs), rs.instant("created_at"), rs.instant("updated_at"))

    /**
     * The active schedules of each of [businessIds] with their changes to days in [from]..[to], in one query (it runs on
     * every availability request). Businesses without schedules are left out.
     */
    fun books(conn: Connection, businessIds: Set<UUID>, from: LocalDate, to: LocalDate): Map<UUID, ReleaseBook> {
        if (businessIds.isEmpty()) return emptyMap()
        val rows = conn.query(
            """
            SELECT x.*, c.date AS change_date, c.opens_at AS change_opens_at
            FROM (SELECT $COLUMNS FROM release_schedules s WHERE s.business_id = ANY(?) AND s.status = 'active') x
            LEFT JOIN release_changes c ON c.business_id = x.business_id AND c.schedule_id = x.id AND c.date BETWEEN ? AND ?
            """.trimIndent(),
            UuidArray(businessIds), from, to,
        ) { rs ->
            val s = schedule(rs)
            val change = rs.localDateOrNull("change_date")?.let { ReleaseChange(s.id, it, rs.instantOrNull("change_opens_at")) }
            Triple(rs.uuid("business_id"), s, change)
        }
        return rows.groupBy { it.first }.mapValues { (_, list) ->
            ReleaseBook(list.map { it.second }.distinctBy { it.id }, list.mapNotNull { it.third })
        }
    }

    /** Every schedule of the business (active and paused), oldest first. */
    fun list(conn: Connection, businessId: UUID): List<StoredSchedule> =
        conn.query(
            "SELECT $COLUMNS FROM release_schedules s WHERE s.business_id = ? ORDER BY s.created_at, s.name, s.id",
            businessId, map = ::stored,
        )

    fun get(conn: Connection, businessId: UUID, id: UUID): StoredSchedule? =
        conn.queryOne("SELECT $COLUMNS FROM release_schedules s WHERE s.business_id = ? AND s.id = ?", businessId, id, map = ::stored)

    /** Serialises changes to a business's schedules, so two saves can't both pass the overlap check. */
    fun lock(conn: Connection, businessId: UUID) {
        conn.queryOne("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "release_schedules:$businessId") { }
    }

    fun insert(conn: Connection, businessId: UUID, spec: ScheduleSpec, now: Instant): UUID {
        val id = UUID.randomUUID()
        val t = spec.timing
        conn.update(
            """
            INSERT INTO release_schedules (id, business_id, name, cadence, release_time, days_before, weekdays_only, weekday,
                weeks_ahead, everyone, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id, businessId, spec.name, t.cadence.value, t.time, daysBefore(t), t.weekdaysOnly && t.cadence == ReleaseCadence.DAILY,
            weekday(t), weeksAhead(t), spec.everyone, spec.status.value, now, now,
        )
        replaceCoverage(conn, businessId, id, spec)
        return id
    }

    fun update(conn: Connection, businessId: UUID, id: UUID, spec: ScheduleSpec, now: Instant) {
        val t = spec.timing
        conn.update(
            """
            UPDATE release_schedules SET name = ?, cadence = ?, release_time = ?, days_before = ?, weekdays_only = ?, weekday = ?,
                weeks_ahead = ?, everyone = ?, status = ?, updated_at = ?
            WHERE business_id = ? AND id = ?
            """.trimIndent(),
            spec.name, t.cadence.value, t.time, daysBefore(t), t.weekdaysOnly && t.cadence == ReleaseCadence.DAILY, weekday(t),
            weeksAhead(t), spec.everyone, spec.status.value, now, businessId, id,
        )
        replaceCoverage(conn, businessId, id, spec)
    }

    fun delete(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("DELETE FROM release_schedules WHERE business_id = ? AND id = ?", businessId, id)
    }

    /** The changes to [scheduleIds]' releases of days in [from]..[to], with the name of whoever made each. */
    fun changes(conn: Connection, businessId: UUID, scheduleIds: Set<UUID>, from: LocalDate, to: LocalDate): List<StoredChange> {
        if (scheduleIds.isEmpty()) return emptyList()
        return conn.query(
            """
            SELECT c.schedule_id, c.date, c.opens_at, c.updated_at, u.name AS changed_by
            FROM release_changes c LEFT JOIN users u ON u.id = c.created_by_user_id
            WHERE c.business_id = ? AND c.schedule_id = ANY(?) AND c.date BETWEEN ? AND ?
            """.trimIndent(),
            businessId, UuidArray(scheduleIds), from, to,
        ) {
            StoredChange(
                ReleaseChange(it.uuid("schedule_id"), it.localDate("date"), it.instantOrNull("opens_at")),
                it.strOrNull("changed_by"), it.instant("updated_at"),
            )
        }
    }

    /** Moves (or holds, with [opensAt] null) [scheduleId]'s release of each of [dates], replacing earlier changes. */
    fun putChanges(
        conn: Connection, businessId: UUID, scheduleId: UUID, dates: Collection<LocalDate>, opensAt: Instant?, userId: UUID?, now: Instant,
    ) {
        if (dates.isEmpty()) return
        conn.update(
            """
            INSERT INTO release_changes (business_id, schedule_id, date, opens_at, created_by_user_id, created_at, updated_at)
            SELECT ?, ?, d, ?::timestamptz, ?::uuid, ?, ? FROM unnest(?::date[]) AS d
            ON CONFLICT (schedule_id, date) DO UPDATE
                SET opens_at = EXCLUDED.opens_at, created_by_user_id = EXCLUDED.created_by_user_id, updated_at = EXCLUDED.updated_at
            """.trimIndent(),
            businessId, scheduleId, opensAt, userId, now, now, dateArray(dates),
        )
    }

    /** Puts [scheduleId]'s releases of [dates] back on schedule. */
    fun deleteChanges(conn: Connection, businessId: UUID, scheduleId: UUID, dates: Collection<LocalDate>) {
        if (dates.isEmpty()) return
        conn.update(
            "DELETE FROM release_changes WHERE business_id = ? AND schedule_id = ? AND date = ANY(?::date[])",
            businessId, scheduleId, dateArray(dates),
        )
    }

    private fun replaceCoverage(conn: Connection, businessId: UUID, id: UUID, spec: ScheduleSpec) {
        conn.update("DELETE FROM release_schedule_services WHERE business_id = ? AND schedule_id = ?", businessId, id)
        conn.update(
            "INSERT INTO release_schedule_services (business_id, schedule_id, service_id) SELECT ?, ?, unnest(?::uuid[])",
            businessId, id, UuidArray(spec.serviceIds),
        )
        conn.update("DELETE FROM release_schedule_groups WHERE business_id = ? AND schedule_id = ?", businessId, id)
        if (!spec.everyone) {
            conn.update(
                "INSERT INTO release_schedule_groups (business_id, schedule_id, group_id) SELECT ?, ?, unnest(?::uuid[])",
                businessId, id, UuidArray(spec.groupIds),
            )
        }
    }

    private fun daysBefore(t: ReleaseTiming) = t.daysBefore.takeIf { t.cadence == ReleaseCadence.DAILY }
    private fun weekday(t: ReleaseTiming) = t.weekday.takeIf { t.cadence == ReleaseCadence.WEEKLY }
    private fun weeksAhead(t: ReleaseTiming) = t.weeksAhead.takeIf { t.cadence == ReleaseCadence.WEEKLY }

    /** A Postgres date[] literal: ISO dates are safe inside it as they are. */
    private fun dateArray(dates: Collection<LocalDate>) = dates.distinct().sorted().joinToString(",", "{", "}")
}
