package ie.bookanything.services

import ie.bookanything.db.UuidArray
import ie.bookanything.db.bool
import ie.bookanything.db.exists
import ie.bookanything.db.int
import ie.bookanything.db.intOrNull
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidList
import ie.bookanything.http.Errors
import java.sql.Connection
import java.util.UUID

object ServiceRepository {

    /** Loads services with options, add-ons and requirements in four queries. */
    fun list(conn: Connection, businessId: UUID, ids: Collection<UUID>? = null): List<ServiceDto> =
        load(conn, setOf(businessId), ids)[businessId].orEmpty()

    /** Every service of each of [businessIds], as [list] loads them, in the same four queries for all of them. */
    fun listByBusiness(conn: Connection, businessIds: Set<UUID>): Map<UUID, List<ServiceDto>> =
        if (businessIds.isEmpty()) emptyMap() else load(conn, businessIds, null)

    private fun load(conn: Connection, businessIds: Set<UUID>, ids: Collection<UUID>?): Map<UUID, List<ServiceDto>> {
        val businesses = UuidArray(businessIds)
        val filter = if (ids == null) "" else " AND id = ANY(?)"
        val params: Array<Any?> = if (ids == null) arrayOf(businesses) else arrayOf(businesses, UuidArray(ids))
        val services = conn.query(
            """
            SELECT business_id, id, name, description, category, color, duration_minutes, buffer_before_minutes, buffer_after_minutes,
                slot_interval_minutes, min_notice_minutes, max_advance_days, capacity, price_cents, payment_mode::text AS payment_mode,
                deposit_cents, allow_pay_at_venue, requires_approval, location_type::text AS location_type, allowed_group_ids, is_public,
                is_active, sort_order
            FROM services WHERE business_id = ANY(?)$filter ORDER BY sort_order, name, id
            """.trimIndent(),
            *params,
        ) { rs ->
            rs.uuid("business_id") to ServiceDto(
                id = rs.uuid("id").toString(), name = rs.str("name"), description = rs.strOrNull("description"),
                category = rs.strOrNull("category"), color = rs.str("color"), durationMinutes = rs.int("duration_minutes"),
                bufferBeforeMinutes = rs.int("buffer_before_minutes"), bufferAfterMinutes = rs.int("buffer_after_minutes"),
                slotIntervalMinutes = rs.intOrNull("slot_interval_minutes"), minNoticeMinutes = rs.intOrNull("min_notice_minutes"),
                maxAdvanceDays = rs.intOrNull("max_advance_days"), capacity = rs.int("capacity"), priceCents = rs.int("price_cents"),
                paymentMode = rs.str("payment_mode"), depositCents = rs.intOrNull("deposit_cents"),
                allowPayAtVenue = rs.bool("allow_pay_at_venue"),
                requiresApproval = rs.bool("requires_approval"), locationType = rs.str("location_type"),
                allowedGroupIds = rs.uuidList("allowed_group_ids").map { it.toString() }, isPublic = rs.bool("is_public"),
                isActive = rs.bool("is_active"), sortOrder = rs.int("sort_order"),
                options = emptyList(), addons = emptyList(), requirements = emptyList(),
            )
        }
        if (services.isEmpty()) return emptyMap()
        val serviceIds = UuidArray(services.map { UUID.fromString(it.second.id) })
        val options = conn.query(
            "SELECT * FROM service_options WHERE business_id = ANY(?) AND service_id = ANY(?) ORDER BY sort_order, name", businesses,
            serviceIds,
        ) { rs ->
            rs.uuid("service_id") to ServiceOptionDto(
                rs.uuid("id").toString(), rs.str("name"), rs.strOrNull("description"), rs.int("duration_minutes"), rs.int("price_cents"),
                rs.int("sort_order"),
            )
        }
            .groupBy({ it.first.toString() }, { it.second })
        val addons = conn.query(
            "SELECT * FROM service_addons WHERE business_id = ANY(?) AND service_id = ANY(?) ORDER BY sort_order, name", businesses,
            serviceIds,
        ) { rs ->
            rs.uuid("service_id") to ServiceAddonDto(
                rs.uuid("id").toString(), rs.str("name"), rs.strOrNull("description"), rs.int("extra_minutes"), rs.int("price_cents"),
                rs.int("sort_order"),
            )
        }
            .groupBy({ it.first.toString() }, { it.second })
        val requirements = conn.query(
            """
            SELECT r.id, r.service_id, r.label, r.quantity, r.customer_selectable, r.sort_order,
                COALESCE(array_agg(rr.resource_id ORDER BY res.sort_order, res.name) FILTER (WHERE rr.resource_id IS NOT NULL), '{}') AS resource_ids
            FROM service_requirements r
            LEFT JOIN service_requirement_resources rr ON rr.requirement_id = r.id
            LEFT JOIN resources res ON res.id = rr.resource_id
            WHERE r.business_id = ANY(?) AND r.service_id = ANY(?)
            GROUP BY r.id ORDER BY r.sort_order, r.label
            """.trimIndent(),
            businesses, serviceIds,
        ) { rs ->
            rs.uuid("service_id") to ServiceRequirementDto(
                rs.uuid("id").toString(), rs.str("label"), rs.int("quantity"), rs.bool("customer_selectable"),
                rs.uuidList("resource_ids").map { it.toString() }, rs.int("sort_order"),
            )
        }.groupBy({ it.first.toString() }, { it.second })
        return services.groupBy({ it.first }, { it.second }).mapValues { (_, list) ->
            list.map {
                it.copy(options = options[it.id].orEmpty(), addons = addons[it.id].orEmpty(), requirements = requirements[it.id].orEmpty())
            }
        }
    }

    fun get(conn: Connection, businessId: UUID, id: UUID): ServiceDto? = list(conn, businessId, listOf(id)).firstOrNull()

    fun exists(conn: Connection, businessId: UUID, id: UUID): Boolean =
        conn.exists("SELECT 1 FROM services WHERE business_id = ? AND id = ?", businessId, id)

    fun anyActive(conn: Connection, businessId: UUID): Boolean =
        conn.exists("SELECT 1 FROM services WHERE business_id = ? AND is_active", businessId)

    /**
     * Whether an active service is paid online: [ServiceDef.needsOnlinePayment] in SQL (full or deposit, with a price on
     * the service, an option or an add-on). Change both together.
     */
    fun anyNeedsOnlinePayment(conn: Connection, businessId: UUID): Boolean = conn.exists(
        """
        SELECT 1 FROM services s WHERE s.business_id = ? AND s.is_active AND s.payment_mode IN ('full', 'deposit') AND (s.price_cents > 0
            OR EXISTS (SELECT 1 FROM service_options o WHERE o.business_id = s.business_id AND o.service_id = s.id AND o.price_cents > 0)
            OR EXISTS (SELECT 1 FROM service_addons a WHERE a.business_id = s.business_id AND a.service_id = s.id AND a.price_cents > 0))
        """.trimIndent(),
        businessId,
    )

    /** Whether any booking (past or present) is for the service. */
    fun hasBookings(conn: Connection, businessId: UUID, id: UUID): Boolean =
        conn.exists("SELECT 1 FROM bookings WHERE business_id = ? AND service_id = ?", businessId, id)

    fun deactivate(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("UPDATE services SET is_active = false, updated_at = now() WHERE business_id = ? AND id = ?", businessId, id)
    }

    fun delete(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("DELETE FROM services WHERE business_id = ? AND id = ?", businessId, id)
    }

    /** Verifies resource and group references belong to this business. */
    fun checkReferences(conn: Connection, businessId: UUID, input: ServiceInput) {
        val resourceIds = input.requirements.flatMap { it.resourceIds }.map(UUID::fromString).toSet()
        if (resourceIds.isNotEmpty()) {
            val found = conn.query(
                "SELECT id FROM resources WHERE business_id = ? AND id = ANY(?)", businessId, UuidArray(resourceIds),
            ) { it.uuid("id") }.toSet()
            if (found.size != resourceIds.size) throw Errors.field("requirements", "Unknown resource in requirements")
        }
        val groupIds = input.allowedGroupIds.map(UUID::fromString).toSet()
        if (groupIds.isNotEmpty()) {
            val found = conn.query(
                "SELECT id FROM customer_groups WHERE business_id = ? AND id = ANY(?)", businessId, UuidArray(groupIds),
            ) { it.uuid("id") }.toSet()
            if (found.size != groupIds.size) throw Errors.field("allowedGroupIds", "Unknown customer group")
        }
    }

    fun insert(conn: Connection, businessId: UUID, s: ServiceInput): UUID {
        val id = conn.queryOne(
            """
            INSERT INTO services (business_id, name, description, category, color, duration_minutes, buffer_before_minutes, buffer_after_minutes,
                slot_interval_minutes, min_notice_minutes, max_advance_days, capacity, price_cents, payment_mode, deposit_cents,
                allow_pay_at_venue, requires_approval, location_type, allowed_group_ids, is_public, is_active, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::payment_mode, ?, ?, ?, ?::location_type, ?, ?, ?, ?) RETURNING id
            """.trimIndent(),
            *serviceParams(businessId, s),
        ) { it.uuid("id") }!!
        replaceChildren(conn, businessId, id, s)
        return id
    }

    fun update(conn: Connection, businessId: UUID, id: UUID, s: ServiceInput) {
        conn.update(
            """
            UPDATE services SET name = ?, description = ?, category = ?, color = ?, duration_minutes = ?, buffer_before_minutes = ?,
                buffer_after_minutes = ?, slot_interval_minutes = ?, min_notice_minutes = ?, max_advance_days = ?, capacity = ?,
                price_cents = ?, payment_mode = ?::payment_mode, deposit_cents = ?, allow_pay_at_venue = ?, requires_approval = ?,
                location_type = ?::location_type,
                allowed_group_ids = ?, is_public = ?, is_active = ?, sort_order = ?, updated_at = now()
            WHERE business_id = ? AND id = ?
            """.trimIndent(),
            *serviceParams(businessId, s).drop(1).toTypedArray(), businessId, id,
        )
        replaceChildren(conn, businessId, id, s)
    }

    private fun serviceParams(businessId: UUID, s: ServiceInput): Array<Any?> = arrayOf(
        businessId, s.name.trim(), s.description?.trim()?.ifEmpty { null }, s.category?.trim()?.ifEmpty { null }, s.color.lowercase(),
        s.durationMinutes, s.bufferBeforeMinutes, s.bufferAfterMinutes, s.slotIntervalMinutes, s.minNoticeMinutes, s.maxAdvanceDays,
        s.capacity, s.priceCents, s.paymentMode, if (s.paymentMode == "deposit") s.depositCents else null,
        s.allowPayAtVenue && (s.paymentMode == "full" || s.paymentMode == "deposit"), s.requiresApproval,
        s.locationType, UuidArray(s.allowedGroupIds.map(UUID::fromString).distinct()), s.isPublic, s.isActive, s.sortOrder,
    )

    /**
     * Replaces options/add-ons/requirements. Items whose `id` (or, failing that, name/label)
     * matches an existing item are updated in place so ids referenced by bookings stay stable.
     */
    private fun replaceChildren(conn: Connection, businessId: UUID, serviceId: UUID, s: ServiceInput) {
        val children = Children(conn, businessId, serviceId)
        children.upsert(OPTIONS, s.options, { it.id }, { it.name }) { o ->
            listOf(o.name.trim(), o.description?.trim()?.ifEmpty { null }, o.durationMinutes, o.priceCents, o.sortOrder)
        }
        children.upsert(ADDONS, s.addons, { it.id }, { it.name }) { a ->
            listOf(a.name.trim(), a.description?.trim()?.ifEmpty { null }, a.extraMinutes, a.priceCents, a.sortOrder)
        }
        val requirementIds = children.upsert(REQUIREMENTS, s.requirements, { it.id }, { it.label }) { r ->
            listOf(r.label.trim(), r.quantity, r.customerSelectable, r.sortOrder)
        }
        // Each requirement's resource pool is rewritten: one delete for the kept requirements, one insert for every pool.
        val kept = requirementIds.filter { it in children.matched }
        if (kept.isNotEmpty()) {
            conn.update(
                "DELETE FROM service_requirement_resources WHERE business_id = ? AND requirement_id = ANY(?)", businessId, UuidArray(kept),
            )
        }
        val pool = requirementIds.zip(s.requirements).flatMap { (id, r) -> r.resourceIds.map(UUID::fromString).distinct().map { id to it } }
        if (pool.isNotEmpty()) {
            conn.update(
                "INSERT INTO service_requirement_resources (business_id, requirement_id, resource_id) " +
                    "SELECT ?, r, x FROM unnest(?::uuid[], ?::uuid[]) AS p(r, x)",
                businessId, UuidArray(pool.map { it.first }), UuidArray(pool.map { it.second }),
            )
        }
    }

    /** A child table of services: [columns] are written from the input, after `business_id` and `service_id`. */
    private class ChildTable(val table: String, val nameColumn: String, val columns: List<String>)

    private val OPTIONS =
        ChildTable("service_options", "name", listOf("name", "description", "duration_minutes", "price_cents", "sort_order"))
    private val ADDONS = ChildTable("service_addons", "name", listOf("name", "description", "extra_minutes", "price_cents", "sort_order"))
    private val REQUIREMENTS = ChildTable("service_requirements", "label", listOf("label", "quantity", "customer_selectable", "sort_order"))

    /** Writes one service's children, matching input items to existing rows by id, then by name. */
    private class Children(private val conn: Connection, private val businessId: UUID, private val serviceId: UUID) {
        /** Ids of existing rows that some input item matched (updated in place). */
        val matched = mutableSetOf<UUID>()

        /** Deletes unmatched rows, updates matched ones and inserts the rest; returns each item's row id, in input order. */
        fun <T> upsert(
            t: ChildTable, items: List<T>, idOf: (T) -> String?, nameOf: (T) -> String, values: (T) -> List<Any?>,
        ): List<UUID> {
            val pairs = match(items, existing(t), idOf, nameOf)
            conn.update(
                "DELETE FROM ${t.table} WHERE business_id = ? AND service_id = ? AND NOT (id = ANY(?))",
                businessId, serviceId, UuidArray(pairs.mapNotNull { it.second }),
            )
            return pairs.map { (item, id) ->
                if (id != null) {
                    matched += id
                    conn.update(
                        "UPDATE ${t.table} SET ${t.columns.joinToString(", ") { "$it = ?" }} WHERE business_id = ? AND id = ?",
                        *values(item).toTypedArray(), businessId, id,
                    )
                    id
                } else {
                    conn.queryOne(
                        "INSERT INTO ${t.table} (business_id, service_id, ${t.columns.joinToString(", ")}) " +
                            "VALUES (?, ?, ${t.columns.joinToString(", ") { "?" }}) RETURNING id",
                        businessId, serviceId, *values(item).toTypedArray(),
                    ) { it.uuid("id") }!!
                }
            }
        }

        private fun existing(t: ChildTable): List<Pair<UUID, String>> = conn.query(
            "SELECT id, ${t.nameColumn} AS n FROM ${t.table} WHERE business_id = ? AND service_id = ?", businessId, serviceId,
        ) { it.uuid("id") to it.str("n").lowercase() }

        private fun <T> match(
            items: List<T>, current: List<Pair<UUID, String>>, idOf: (T) -> String?, nameOf: (T) -> String,
        ): List<Pair<T, UUID?>> {
            val free = current.toMutableList()
            return items.map { item ->
                val byId = idOf(item)?.let(UUID::fromString)?.let { id -> free.firstOrNull { it.first == id } }
                val hit = byId ?: free.firstOrNull { it.second == nameOf(item).trim().lowercase() }
                if (hit != null) free.remove(hit)
                item to hit?.first
            }
        }
    }
}
