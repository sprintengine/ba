package ie.bookanything.customers

import ie.bookanything.db.UuidArray
import ie.bookanything.db.bool
import ie.bookanything.db.exists
import ie.bookanything.db.int
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import java.sql.Connection
import java.sql.ResultSet
import java.util.UUID

object CustomerGroupRepository {
    fun map(rs: ResultSet) = CustomerGroupDto(
        rs.uuid("id").toString(), rs.str("name"), rs.strOrNull("description"), rs.bool("restricted"), rs.int("sort_order"),
        rs.bool("is_active"),
    )

    fun list(conn: Connection, businessId: UUID) = conn.query(
        "SELECT * FROM customer_groups WHERE business_id = ? ORDER BY sort_order, name", businessId, map = ::map,
    )

    fun get(conn: Connection, businessId: UUID, id: UUID) = conn.queryOne(
        "SELECT * FROM customer_groups WHERE business_id = ? AND id = ?", businessId, id, map = ::map,
    )

    fun insert(conn: Connection, businessId: UUID, g: CustomerGroupInput): CustomerGroupDto = conn.queryOne(
        "INSERT INTO customer_groups (business_id, name, description, restricted, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?) " +
            "RETURNING *",
        businessId, g.name.trim(), g.description?.trim()?.ifEmpty { null }, g.restricted, g.sortOrder, g.isActive, map = ::map,
    )!!

    fun update(conn: Connection, businessId: UUID, id: UUID, g: CustomerGroupInput): CustomerGroupDto? = conn.queryOne(
        "UPDATE customer_groups SET name = ?, description = ?, restricted = ?, sort_order = ?, is_active = ? WHERE business_id = ? AND " +
            "id = ? RETURNING *",
        g.name.trim(), g.description?.trim()?.ifEmpty { null }, g.restricted, g.sortOrder, g.isActive, businessId, id, map = ::map,
    )

    /** Group ids of each of [businessIds] that are restricted (only windows listing them are open to them). */
    fun restrictedIds(conn: Connection, businessIds: Set<UUID>): Map<UUID, Set<UUID>> = conn.query(
        "SELECT business_id, id FROM customer_groups WHERE business_id = ANY(?) AND restricted", UuidArray(businessIds),
    ) { it.uuid("business_id") to it.uuid("id") }.groupBy({ it.first }, { it.second }).mapValues { it.value.toSet() }

    fun activeExists(conn: Connection, businessId: UUID, id: UUID) =
        conn.exists("SELECT 1 FROM customer_groups WHERE business_id = ? AND id = ? AND is_active", businessId, id)

    /** Which of the (business, group) pairs in [asked] are active groups of that business, in one query. */
    fun activePairs(conn: Connection, asked: Set<Pair<UUID, UUID>>): Set<Pair<UUID, UUID>> {
        if (asked.isEmpty()) return emptySet()
        return conn.query(
            "SELECT business_id, id FROM customer_groups WHERE business_id = ANY(?) AND id = ANY(?) AND is_active",
            UuidArray(asked.map { it.first }.toSet()), UuidArray(asked.map { it.second }.toSet()),
        ) { it.uuid("business_id") to it.uuid("id") }.toSet().intersect(asked)
    }

    /** Whether bookings, availability windows, service restrictions or release schedules still reference the group. */
    fun isInUse(conn: Connection, businessId: UUID, id: UUID): Boolean = conn.exists(
        """
        SELECT 1 WHERE EXISTS (SELECT 1 FROM bookings WHERE business_id = ? AND group_id = ?)
           OR EXISTS (SELECT 1 FROM availability_rules WHERE business_id = ? AND ? = ANY(audience_group_ids))
           OR EXISTS (SELECT 1 FROM services WHERE business_id = ? AND ? = ANY(allowed_group_ids))
           OR EXISTS (SELECT 1 FROM release_schedule_groups WHERE business_id = ? AND group_id = ?)
        """.trimIndent(),
        businessId, id, businessId, id, businessId, id, businessId, id,
    )

    fun deactivate(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("UPDATE customer_groups SET is_active = false WHERE business_id = ? AND id = ?", businessId, id)
    }

    fun delete(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("DELETE FROM customer_groups WHERE business_id = ? AND id = ?", businessId, id)
    }
}
