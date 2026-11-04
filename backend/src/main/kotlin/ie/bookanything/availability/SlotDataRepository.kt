package ie.bookanything.availability

import ie.bookanything.db.UuidArray
import ie.bookanything.db.bool
import ie.bookanything.db.instant
import ie.bookanything.db.int
import ie.bookanything.db.localDate
import ie.bookanything.db.localDateOrNull
import ie.bookanything.db.localTime
import ie.bookanything.db.localTimeOrNull
import ie.bookanything.db.query
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidList
import ie.bookanything.db.uuidOrNull
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * What the slot engine needs for a date range, each in one query (docs/architecture.md section 5.1: never per day), for
 * one business or for several at once (the marketplace prices many businesses' next times per search).
 */
object SlotDataRepository {
    /** The active resources among [ids] of [businessIds], with the business each belongs to. */
    fun activeResources(conn: Connection, businessIds: Set<UUID>, ids: Set<UUID>): Map<UUID, OwnedResource> {
        if (ids.isEmpty()) return emptyMap()
        return conn.query(
            "SELECT business_id, id, sort_order FROM resources WHERE business_id = ANY(?) AND id = ANY(?) AND is_active",
            UuidArray(businessIds), UuidArray(ids),
        ) { OwnedResource(it.uuid("business_id"), ResourceSpec(it.uuid("id"), it.int("sort_order"))) }.associateBy { it.spec.id }
    }

    /** Weekly rules of [resourceIds] valid at some point in [from]..[to]. */
    fun rules(conn: Connection, businessId: UUID, resourceIds: Set<UUID>, from: LocalDate, to: LocalDate): List<RuleSpec> =
        rules(conn, setOf(businessId), resourceIds, from, to)

    /** Weekly rules of [resourceIds] (of [businessIds]) valid at some point in [from]..[to]. */
    fun rules(conn: Connection, businessIds: Set<UUID>, resourceIds: Set<UUID>, from: LocalDate, to: LocalDate): List<RuleSpec> =
        conn.query(
            """
            SELECT resource_id, day_of_week, start_time, end_time, valid_from, valid_until, audience_group_ids
            FROM availability_rules WHERE business_id = ANY(?) AND resource_id = ANY(?)
              AND (valid_until IS NULL OR valid_until >= ?) AND (valid_from IS NULL OR valid_from <= ?)
            """.trimIndent(),
            UuidArray(businessIds), UuidArray(resourceIds), from, to,
        ) {
            RuleSpec(
                it.uuid("resource_id"), it.int("day_of_week"), it.localTime("start_time"), it.localTime("end_time"),
                it.localDateOrNull("valid_from"), it.localDateOrNull("valid_until"), it.uuidList("audience_group_ids").toSet(),
            )
        }

    /** Date overrides of [resourceIds] and whole-business closures in [from]..[to]. */
    fun overrides(conn: Connection, businessId: UUID, resourceIds: Set<UUID>, from: LocalDate, to: LocalDate): List<OverrideSpec> =
        overrides(conn, setOf(businessId), resourceIds, from, to)[businessId].orEmpty()

    /** Date overrides of [resourceIds] and whole-business closures of [businessIds] in [from]..[to], by business. */
    fun overrides(
        conn: Connection, businessIds: Set<UUID>, resourceIds: Set<UUID>, from: LocalDate, to: LocalDate,
    ): Map<UUID, List<OverrideSpec>> = conn.query(
        """
        SELECT business_id, resource_id, date, is_available, start_time, end_time FROM availability_overrides
        WHERE business_id = ANY(?) AND date BETWEEN ? AND ? AND (resource_id IS NULL OR resource_id = ANY(?))
        """.trimIndent(),
        UuidArray(businessIds), from, to, UuidArray(resourceIds),
    ) {
        it.uuid("business_id") to OverrideSpec(
            it.uuidOrNull("resource_id"), it.localDate("date"), it.bool("is_available"), it.localTimeOrNull("start_time"),
            it.localTimeOrNull("end_time"),
        )
    }.groupBy({ it.first }, { it.second })

    /** Active allocations on [resourceIds] (of [businessIds]) overlapping [start]..[end], except holds that ran out by [now]. */
    fun busy(
        conn: Connection, businessIds: Set<UUID>, resourceIds: Set<UUID>, start: Instant, end: Instant, now: Instant,
    ): List<BusyAllocation> = conn.query(
        """
        SELECT a.booking_id, a.resource_id, lower(a.time_range) AS s, upper(a.time_range) AS e, a.exclusive, b.service_id, b.start_at
        FROM booking_allocations a JOIN bookings b ON b.id = a.booking_id AND b.business_id = a.business_id
        WHERE a.business_id = ANY(?) AND a.active AND a.resource_id = ANY(?)
          AND a.time_range && tstzrange(?, ?)
          AND NOT (b.status = 'held' AND b.hold_expires_at <= ?)
        """.trimIndent(),
        UuidArray(businessIds), UuidArray(resourceIds), start, end, now,
    ) {
        BusyAllocation(
            it.uuid("booking_id"), it.uuid("resource_id"), it.instant("s"), it.instant("e"), it.bool("exclusive"),
            it.uuid("service_id"), it.instant("start_at"),
        )
    }
}

/** An active resource as the slot engine sees it, with its business. */
data class OwnedResource(val businessId: UUID, val spec: ResourceSpec)
