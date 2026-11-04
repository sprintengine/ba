package ie.bookanything.availability

import ie.bookanything.db.UuidArray
import ie.bookanything.db.bool
import ie.bookanything.db.exists
import ie.bookanything.db.int
import ie.bookanything.db.localDate
import ie.bookanything.db.localDateOrNull
import ie.bookanything.db.localTime
import ie.bookanything.db.localTimeOrNull
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidList
import ie.bookanything.db.uuidOrNull
import ie.bookanything.http.formatTime
import java.sql.Connection
import java.sql.ResultSet
import java.time.LocalDate
import java.util.UUID

object AvailabilityRepository {
    fun mapRule(rs: ResultSet) = AvailabilityRuleDto(
        id = rs.uuid("id").toString(), resourceId = rs.uuid("resource_id").toString(), dayOfWeek = rs.int("day_of_week"),
        startTime = formatTime(rs.localTime("start_time")), endTime = formatTime(rs.localTime("end_time")),
        validFrom = rs.localDateOrNull("valid_from")?.toString(), validUntil = rs.localDateOrNull("valid_until")?.toString(),
        audienceGroupIds = rs.uuidList("audience_group_ids").map { it.toString() },
    )

    fun mapOverride(rs: ResultSet) = AvailabilityOverrideDto(
        id = rs.uuid("id").toString(), resourceId = rs.uuidOrNull("resource_id")?.toString(), date = rs.localDate("date").toString(),
        isAvailable = rs.bool("is_available"), startTime = rs.localTimeOrNull("start_time")?.let(::formatTime),
        endTime = rs.localTimeOrNull("end_time")?.let(::formatTime), reason = rs.strOrNull("reason"),
    )

    fun rules(conn: Connection, businessId: UUID, resourceId: UUID) = conn.query(
        "SELECT * FROM availability_rules WHERE business_id = ? AND resource_id = ? ORDER BY day_of_week, start_time",
        businessId, resourceId, map = ::mapRule,
    )

    fun anyRules(conn: Connection, businessId: UUID): Boolean =
        conn.exists("SELECT 1 FROM availability_rules WHERE business_id = ?", businessId)

    /** Every resource's weekly rules in one statement, by resource id (resources without rules are absent). */
    fun rulesByResource(conn: Connection, businessId: UUID): Map<String, List<AvailabilityRuleDto>> = conn.query(
        "SELECT * FROM availability_rules WHERE business_id = ? ORDER BY resource_id, day_of_week, start_time",
        businessId, map = ::mapRule,
    ).groupBy { it.resourceId }

    fun overrides(conn: Connection, businessId: UUID, resourceId: UUID?, fromDate: LocalDate?) = conn.query(
        """
        SELECT * FROM availability_overrides WHERE business_id = ?
          AND (resource_id = ? OR (?::uuid IS NULL AND resource_id IS NULL)) AND (?::date IS NULL OR date >= ?::date)
        ORDER BY date, start_time NULLS FIRST
        """.trimIndent(),
        businessId, resourceId, resourceId, fromDate, fromDate, map = ::mapOverride,
    )

    fun replaceRules(conn: Connection, businessId: UUID, resourceId: UUID, rules: List<ValidRule>) {
        conn.update("DELETE FROM availability_rules WHERE business_id = ? AND resource_id = ?", businessId, resourceId)
        rules.forEach { insertRule(conn, businessId, resourceId, it) }
    }

    fun insertRule(conn: Connection, businessId: UUID, resourceId: UUID, r: ValidRule) {
        conn.update(
            """
            INSERT INTO availability_rules (business_id, resource_id, day_of_week, start_time, end_time, valid_from, valid_until, audience_group_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            businessId, resourceId, r.dayOfWeek, r.start, r.end, r.validFrom, r.validUntil, UuidArray(r.audience),
        )
    }

    fun insertOverride(conn: Connection, businessId: UUID, resourceId: UUID?, o: ValidOverride): AvailabilityOverrideDto = conn.queryOne(
        """
        INSERT INTO availability_overrides (business_id, resource_id, date, is_available, start_time, end_time, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
        """.trimIndent(),
        businessId, resourceId, o.date, o.isAvailable, o.start, o.end, o.reason, map = ::mapOverride,
    )!!

    fun validGroupIds(conn: Connection, businessId: UUID, ids: Collection<UUID>): Set<UUID> =
        if (ids.isEmpty()) {
            emptySet()
        } else {
            conn.query(
                "SELECT id FROM customer_groups WHERE business_id = ? AND id = ANY(?)", businessId, UuidArray(ids),
            ) { it.uuid("id") }.toSet()
        }

    fun overrideRef(conn: Connection, businessId: UUID, id: UUID): OverrideRef? = conn.queryOne(
        "SELECT resource_id FROM availability_overrides WHERE business_id = ? AND id = ?", businessId, id,
    ) { OverrideRef(it.uuidOrNull("resource_id")) }

    fun deleteOverride(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("DELETE FROM availability_overrides WHERE business_id = ? AND id = ?", businessId, id)
    }
}
