package ie.bookanything.booking

import ie.bookanything.business.BusinessRow
import ie.bookanything.db.Jsonb
import ie.bookanything.db.UuidArray
import ie.bookanything.db.bool
import ie.bookanything.db.count
import ie.bookanything.db.exists
import ie.bookanything.db.instant
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.int
import ie.bookanything.db.intOrNull
import ie.bookanything.db.jsonOr
import ie.bookanything.db.query
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidOrNull
import ie.bookanything.http.ApiJson
import ie.bookanything.http.formatInstant
import ie.bookanything.http.formatInstantOrNull
import ie.bookanything.offers.BookingOfferDto
import ie.bookanything.payments.CancelActor
import ie.bookanything.payments.PaymentStatus
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.serializer
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

object BookingRepository {
    const val SELECT = """
        SELECT b.id, b.business_id, b.reference, b.customer_id, b.service_id, b.option_id, b.option_name, b.addons::text AS addons,
            b.group_id, b.start_at, b.end_at, b.status::text AS status, b.hold_expires_at, b.price_cents, b.deposit_cents, b.currency,
            b.amount_paid_cents, b.amount_paid_in_person_cents, b.amount_refunded_cents, b.payment_status::text AS payment_status, b.answers::text AS answers,
            b.customer_notes, b.internal_notes, b.source::text AS source, b.idempotency_key, b.cancelled_at,
            b.cancelled_by::text AS cancelled_by, b.cancellation_reason, b.created_at, b.updated_at,
            b.offer_id, b.original_price_cents, b.offer_snapshot::text AS offer_snapshot, b.created_by_user_id,
            s.name AS service_name, s.color AS service_color, s.is_active AS service_active,
            s.buffer_before_minutes, s.buffer_after_minutes,
            c.name AS customer_name, c.email::text AS customer_email, c.phone AS customer_phone, c.group_id AS customer_group_id,
            c.user_id AS customer_user_id
        FROM bookings b
        JOIN services s ON s.id = b.service_id AND s.business_id = b.business_id
        JOIN customers c ON c.id = b.customer_id AND c.business_id = b.business_id
    """

    private val addonsSerializer = ListSerializer(serializer<AddonSnapshot>())
    private val answersSerializer = ListSerializer(serializer<AnswerDto>())

    private fun mapRow(rs: ResultSet) = BookingRow(
        id = rs.uuid("id"), businessId = rs.uuid("business_id"), reference = rs.str("reference"),
        customer = BookingCustomer(
            rs.uuid("customer_id"), rs.str("customer_name"), rs.strOrNull("customer_email"),
            rs.strOrNull("customer_phone"), rs.uuidOrNull("customer_group_id"), rs.uuidOrNull("customer_user_id"),
        ),
        serviceId = rs.uuid("service_id"), serviceName = rs.str("service_name"), serviceColor = rs.str("service_color"),
        serviceActive = rs.bool("service_active"),
        bufferBeforeMinutes = rs.int("buffer_before_minutes"), bufferAfterMinutes = rs.int("buffer_after_minutes"),
        optionId = rs.uuidOrNull("option_id"), optionName = rs.strOrNull("option_name"),
        addons = rs.jsonOr("addons", addonsSerializer, emptyList()),
        groupId = rs.uuidOrNull("group_id"), start = rs.instant("start_at"), end = rs.instant("end_at"),
        status = BookingStatus.parse(rs.str("status")),
        holdExpiresAt = rs.instantOrNull("hold_expires_at"), priceCents = rs.int("price_cents"),
        depositCents = rs.intOrNull("deposit_cents"),
        currency = rs.str("currency").trim(), amountPaidCents = rs.int("amount_paid_cents"),
        amountPaidInPersonCents = rs.int("amount_paid_in_person_cents"),
        amountRefundedCents = rs.int("amount_refunded_cents"),
        paymentStatus = PaymentStatus.parse(rs.str("payment_status")),
        answers = rs.jsonOr("answers", answersSerializer, emptyList()),
        customerNotes = rs.strOrNull("customer_notes"), internalNotes = rs.strOrNull("internal_notes"),
        source = BookingSource.parse(rs.str("source")),
        idempotencyKey = rs.strOrNull("idempotency_key"), cancelledAt = rs.instantOrNull("cancelled_at"),
        cancelledBy = rs.strOrNull("cancelled_by")?.let(CancelActor::parse), cancellationReason = rs.strOrNull("cancellation_reason"),
        createdAt = rs.instant("created_at"), updatedAt = rs.instant("updated_at"), resources = emptyList(),
        createdByUserId = rs.uuidOrNull("created_by_user_id"),
        offerId = rs.uuidOrNull("offer_id"), originalPriceCents = rs.intOrNull("original_price_cents"),
        offer = rs.jsonOr("offer_snapshot", serializer<BookingOfferDto?>(), null),
    )

    /** Loads bookings with the given WHERE clause (use alias b), then their resources in one query. */
    fun load(conn: Connection, where: String, vararg params: Any?, suffix: String = "ORDER BY b.start_at, b.id"): List<BookingRow> {
        val rows = conn.query("$SELECT WHERE $where $suffix", *params, map = ::mapRow)
        if (rows.isEmpty()) return rows
        val resources = conn.query(
            """
            SELECT a.booking_id, r.id, r.name, r.kind::text AS kind, a.requirement_id
            FROM booking_allocations a JOIN resources r ON r.id = a.resource_id AND r.business_id = a.business_id
            WHERE a.booking_id = ANY(?) ORDER BY r.sort_order, r.name
            """.trimIndent(),
            UuidArray(rows.map { it.id }),
        ) {
            it.uuid("booking_id") to AllocatedResourceRef(
                it.uuid("id").toString(), it.str("name"), it.str("kind"), it.uuidOrNull("requirement_id")?.toString(),
            )
        }
            .groupBy({ it.first }, { it.second })
        return rows.map { it.copy(resources = resources[it.id].orEmpty().distinctBy { r -> r.id }) }
    }

    fun get(conn: Connection, businessId: UUID, id: UUID, forUpdate: Boolean = false): BookingRow? {
        if (forUpdate) conn.query("SELECT id FROM bookings WHERE business_id = ? AND id = ? FOR UPDATE", businessId, id) { 1 }
        return load(conn, "b.business_id = ? AND b.id = ?", businessId, id).firstOrNull()
    }

    fun byManageTokenHash(conn: Connection, hash: String): BookingRow? =
        load(conn, "b.manage_token_hash = ?", hash).firstOrNull()

    fun byIdempotencyKey(conn: Connection, businessId: UUID, key: String): BookingRow? =
        load(conn, "b.business_id = ? AND b.idempotency_key = ?", businessId, key).firstOrNull()

    fun insert(conn: Connection, b: NewBooking) {
        conn.update(
            """
            INSERT INTO bookings (id, business_id, reference, customer_id, service_id, option_id, option_name, addons, group_id,
                start_at, end_at, status, hold_expires_at, price_cents, deposit_cents, currency, payment_status, answers,
                customer_notes, internal_notes, source, manage_token_hash, idempotency_key, created_by_user_id, created_at, updated_at,
                offer_id, original_price_cents, offer_snapshot, reminder_sent_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::booking_status, ?, ?, ?, ?, ?::payment_status, ?, ?, ?, ?::booking_source, ?, ?, ?, ?, ?, ?, ?, ?,
                ?)
            """.trimIndent(),
            b.id, b.businessId, b.reference, b.customerId, b.serviceId, b.optionId, b.optionName,
            Jsonb(ApiJson.encodeToString(addonsSerializer, b.addons)), b.groupId, b.start, b.end, b.status, b.holdExpiresAt, b.priceCents,
            b.depositCents, b.currency, b.paymentStatus, Jsonb(ApiJson.encodeToString(answersSerializer, b.answers)),
            b.customerNotes, b.internalNotes, b.source.wire, b.manageTokenHash, b.idempotencyKey, b.createdByUserId, b.createdAt,
            b.createdAt, b.offerId, b.originalPriceCents, b.offer?.let { Jsonb(ApiJson.encodeToString(serializer<BookingOfferDto>(), it)) },
            b.reminderSentAt,
        )
    }

    fun referenceExists(conn: Connection, businessId: UUID, reference: String): Boolean =
        conn.exists("SELECT 1 FROM bookings WHERE business_id = ? AND reference = ?", businessId, reference)

    /**
     * Bookings created since [since] (the Free plan's monthly limit, the overview), only those on [onResources] when given
     * (a staff member's overview); holds that expired unpaid don't count.
     */
    fun countCreatedSince(conn: Connection, businessId: UUID, since: Instant, onResources: Set<UUID>? = null): Long = conn.count(
        "SELECT count(*) FROM bookings b WHERE b.business_id = ? AND b.created_at >= ? AND b.status <> 'expired'${onResourcesSql(onResources)}",
        businessId, since, *onResourcesParams(onResources),
    )

    /** Bookings that still hold their time and start in [[from], [to]), only those on [onResources] when given. */
    fun countBlockingStarting(conn: Connection, businessId: UUID, from: Instant, to: Instant, onResources: Set<UUID>?): Long = conn.count(
        "SELECT count(*) FROM bookings b WHERE b.business_id = ? AND b.start_at >= ? AND b.start_at < ? AND " +
            "${BookingStatus.sqlIn("b.status", BookingStatus.BLOCKING)}${onResourcesSql(onResources)}",
        businessId, from, to, *onResourcesParams(onResources),
    )

    private fun onResourcesSql(onResources: Set<UUID>?) = if (onResources != null) " AND ${StaffScope.ON_RESOURCES_SQL}" else ""

    private fun onResourcesParams(onResources: Set<UUID>?): Array<Any?> = if (onResources !=
        null
    ) {
        arrayOf(UuidArray(onResources))
    } else {
        emptyArray()
    }

    /** Sets the status; [clearHold] also ends the payment hold (held bookings leaving `held`). */
    fun setStatus(conn: Connection, businessId: UUID, id: UUID, status: BookingStatus, now: Instant, clearHold: Boolean = false) {
        conn.update(
            "UPDATE bookings SET status = ?::booking_status, ${if (clearHold) "hold_expires_at = NULL, " else ""}updated_at = ? " +
                "WHERE business_id = ? AND id = ?",
            status, now, businessId, id,
        )
    }

    /** Marks the booking cancelled by [by]; [clearHold] also ends a payment hold. */
    fun markCancelled(
        conn: Connection, businessId: UUID, id: UUID, by: CancelActor, reason: String?, now: Instant, clearHold: Boolean = true,
    ) {
        conn.update(
            "UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?::cancelled_by, cancellation_reason = ?, " +
                "${if (clearHold) "hold_expires_at = NULL, " else ""}updated_at = ? WHERE business_id = ? AND id = ?",
            now, by, reason, now, businessId, id,
        )
    }

    /** Frees the booking's Idempotency-Key, so a retry of the request that made it books again. */
    fun releaseIdempotencyKey(conn: Connection, businessId: UUID, id: UUID) {
        conn.update("UPDATE bookings SET idempotency_key = NULL WHERE business_id = ? AND id = ?", businessId, id)
    }

    /** A booking that was waiting for payment and got none no longer expects one. */
    fun dropUnpaidPayment(conn: Connection, businessId: UUID, id: UUID) {
        conn.update(
            "UPDATE bookings SET payment_status = 'not_required' WHERE business_id = ? AND id = ? AND amount_paid_cents = 0",
            businessId, id,
        )
    }

    /** Adds a successful charge to the amount paid. */
    fun recordPayment(conn: Connection, businessId: UUID, id: UUID, amountCents: Int, now: Instant) {
        conn.update(
            "UPDATE bookings SET amount_paid_cents = amount_paid_cents + ?, payment_status = 'paid', updated_at = ? WHERE business_id = " +
                "? AND id = ?",
            amountCents, now, businessId, id,
        )
    }

    /** Adds a payment taken in person to the amount paid (and its in-person part). */
    fun recordInPersonPayment(conn: Connection, businessId: UUID, id: UUID, amountCents: Int, now: Instant) {
        conn.update(
            "UPDATE bookings SET amount_paid_cents = amount_paid_cents + ?, " +
                "amount_paid_in_person_cents = amount_paid_in_person_cents + ?, payment_status = 'paid', updated_at = ? " +
                "WHERE business_id = ? AND id = ?",
            amountCents, amountCents, now, businessId, id,
        )
    }

    /** Moves the booking's times; a reminder is due again for the new time unless [reminderSentAt] says otherwise. */
    fun moveTo(conn: Connection, businessId: UUID, id: UUID, start: Instant, end: Instant, reminderSentAt: Instant?, now: Instant) {
        conn.update(
            "UPDATE bookings SET start_at = ?, end_at = ?, reminder_sent_at = ?, updated_at = ? WHERE business_id = ? AND id = ?",
            start, end, reminderSentAt, now, businessId, id,
        )
    }

    /** Updates the notes and, when [answers] is given, the answers snapshot. */
    fun updateDetails(
        conn: Connection, businessId: UUID, id: UUID, internalNotes: String?, customerNotes: String?, answers: List<AnswerDto>?,
        now: Instant,
    ) {
        conn.update(
            "UPDATE bookings SET internal_notes = ?, customer_notes = ?, answers = COALESCE(?::jsonb, answers), updated_at = ? WHERE " +
                "business_id = ? AND id = ?",
            internalNotes, customerNotes, answers?.let { ApiJson.encodeToString(answersSerializer, it) }, now, businessId, id,
        )
    }

    /**
     * Marks held bookings whose hold ran out as expired; scoped to [businessId] and to bookings on [resourceIds] when given.
     * Returns (booking id, business id) of each.
     */
    fun expireHolds(conn: Connection, now: Instant, businessId: UUID?, resourceIds: Collection<UUID>?): List<Pair<UUID, UUID>> {
        val filter = StringBuilder("status = 'held' AND hold_expires_at <= ?")
        val params = mutableListOf<Any?>(now)
        if (businessId != null) { filter.append(" AND business_id = ?"); params += businessId }
        if (resourceIds != null) {
            filter.append(" AND id IN (SELECT booking_id FROM booking_allocations WHERE active AND resource_id = ANY(?))")
            params += UuidArray(resourceIds.toSet())
        }
        return conn.query(
            "UPDATE bookings SET status = 'expired', updated_at = now() WHERE $filter RETURNING id, business_id", *params.toTypedArray(),
        ) { it.uuid("id") to it.uuid("business_id") }
    }

    /** Marks confirmed bookings that ended before [now] completed. Returns (booking id, business id) of each. */
    fun completeEnded(conn: Connection, now: Instant): List<Pair<UUID, UUID>> = conn.query(
        "UPDATE bookings SET status = 'completed', updated_at = now() WHERE status = 'confirmed' AND end_at < ? RETURNING id, business_id",
        now,
    ) { it.uuid("id") to it.uuid("business_id") }

    /**
     * Claims the confirmed bookings starting in (now, until] whose reminder is not sent yet (once per booking); a
     * suspended business's bookings get none.
     */
    fun claimReminders(conn: Connection, now: Instant, until: Instant): List<Pair<UUID, UUID>> = conn.query(
        """
        UPDATE bookings SET reminder_sent_at = ? WHERE status = 'confirmed' AND reminder_sent_at IS NULL
          AND start_at > ? AND start_at <= ?
          AND business_id IN (SELECT id FROM businesses WHERE status <> 'suspended')
        RETURNING id, business_id
        """.trimIndent(),
        now, now, until,
    ) { it.uuid("id") to it.uuid("business_id") }

    fun toDto(b: BookingRow, business: BusinessRow): BookingDto {
        val zone = business.zone
        return BookingDto(
            id = b.id.toString(), reference = b.reference, status = b.status, paymentStatus = b.paymentStatus, source = b.source.wire,
            start = formatInstant(b.start, zone), end = formatInstant(b.end, zone),
            bufferBeforeMinutes = b.bufferBeforeMinutes, bufferAfterMinutes = b.bufferAfterMinutes,
            customer = BookingCustomerRef(
                b.customer.id.toString(), b.customer.name, b.customer.email, b.customer.phone,
                b.customer.groupId?.toString(),
            ),
            service = ServiceRef(b.serviceId.toString(), b.serviceName, b.serviceColor),
            option = b.optionRef,
            addons = b.addons.map { AddonRef(it.id, it.name, it.extraMinutes, it.priceCents) },
            resources = b.resources, groupId = b.groupId?.toString(), answers = b.answers,
            customerNotes = b.customerNotes, internalNotes = b.internalNotes,
            priceCents = b.priceCents, depositCents = b.depositCents, amountPaidCents = b.amountPaidCents,
            amountPaidInPersonCents = b.amountPaidInPersonCents, amountRefundedCents = b.amountRefundedCents, currency = b.currency,
            holdExpiresAt = formatInstantOrNull(b.holdExpiresAt, zone), cancelledAt = formatInstantOrNull(b.cancelledAt, zone),
            cancelledBy = b.cancelledBy, cancellationReason = b.cancellationReason,
            createdAt = formatInstant(b.createdAt, zone), updatedAt = formatInstant(b.updatedAt, zone),
            originalPriceCents = b.originalPriceCents, offer = b.offer,
        )
    }
}
