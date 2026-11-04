package ie.bookanything.booking

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.availability.AvailabilityDto
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.availability.AvailabilityRequest
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.customers.CustomerRepository
import ie.bookanything.customers.customerVisibleTo
import ie.bookanything.customers.visibleCustomer
import ie.bookanything.db.TextArray
import ie.bookanything.db.UuidArray
import ie.bookanything.db.likeContains
import ie.bookanything.http.DateRange
import ie.bookanything.http.Errors
import ie.bookanything.http.Patch
import ie.bookanything.http.Validator
import ie.bookanything.http.parseInstant
import ie.bookanything.http.startIn
import ie.bookanything.notifications.NotificationKind
import ie.bookanything.notifications.Notify
import ie.bookanything.payments.PaymentRepository
import ie.bookanything.reports.AuditRepository
import ie.bookanything.services.QuestionRepository
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** Filters of the staff booking list (`GET /bookings`); dates are in the business timezone. */
data class BookingFilter(
    val from: LocalDate? = null,
    val to: LocalDate? = null,
    val statuses: List<BookingStatus> = emptyList(),
    val resourceIds: List<UUID> = emptyList(),
    val serviceId: UUID? = null,
    val customerId: UUID? = null,
    val q: String? = null,
    val limit: Int = 50,
    val cursor: Pair<Instant, UUID>? = null,
)

/**
 * The staff booking commands and queries shared by the dashboard routes and the assistant's tools. Each runs in the
 * caller's (tenant-scoped) transaction, applies the member's scope (staff: only bookings on their own resources) and
 * records the audit event with the given [Actor].
 */
class StaffBookingCommands(
    private val engine: BookingEngine,
    private val lifecycle: BookingLifecycle,
    private val availability: BookingAvailability,
) {
    /** Up to `limit + 1` bookings (the extra one tells the caller there is a next page). */
    fun list(conn: Connection, access: BusinessAccess, f: BookingFilter): List<BookingRow> {
        val zone = access.business.zone
        val where = StringBuilder("b.business_id = ?")
        val params = mutableListOf<Any?>(access.businessId)
        f.from?.let { where.append(" AND b.start_at >= ?"); params += it.startIn(zone) }
        f.to?.let { where.append(" AND b.start_at < ?"); params += it.plusDays(1).startIn(zone) }
        if (f.statuses.isNotEmpty()) {
            where.append(" AND b.status::text = ANY(?)"); params += TextArray(f.statuses.map { it.wire })
        } else {
            where.append(" AND b.status <> 'expired'")
        }
        f.serviceId?.let { where.append(" AND b.service_id = ?"); params += it }
        f.customerId?.let { where.append(" AND b.customer_id = ?"); params += it }
        access.staffScope.listFilter(f.resourceIds)?.let { where.append(" AND ${StaffScope.ON_RESOURCES_SQL}"); params += UuidArray(it) }
        f.q?.let { q ->
            val like = likeContains(q.lowercase())
            where.append(" AND (lower(b.reference) LIKE ? OR lower(c.name) LIKE ? OR lower(c.email::text) LIKE ? OR c.phone LIKE ?)")
            params.addAll(listOf(like, like, like, like))
        }
        f.cursor?.let { (at, id) -> where.append(" AND (b.start_at, b.id) > (?, ?)"); params.addAll(listOf(at, id)) }
        return BookingRepository.load(
            conn, where.toString(), *params.toTypedArray(), suffix = "ORDER BY b.start_at, b.id LIMIT ${f.limit + 1}",
        )
    }

    /** Validates a `POST /bookings` body into a create command, enforcing that staff only book onto their own resources. */
    fun createCommand(
        access: BusinessAccess, input: CreateStaffBooking, source: BookingSource, actor: Actor, idempotencyKey: String?,
    ): CreateCommand {
        val v = Validator()
        val serviceId = v.uuid(input.serviceId, "serviceId")
        val optionId = v.uuid(input.optionId, "optionId")
        val addonIds = v.uuids(input.addonIds, "addonIds")
        val groupId = v.uuid(input.groupId, "groupId")
        val resourceIds = input.resourceIds?.let { v.uuids(it, "resourceIds") }
        val customerId = v.uuid(input.customerId, "customerId")
        val payment = v.oneOf(input.paymentMode, "paymentMode", setOf("collect_online", "at_venue", "none")) {
            when (it) { "collect_online" -> PaymentChoice.ONLINE; "at_venue" -> PaymentChoice.AT_VENUE; else -> PaymentChoice.NONE }
        }
        val customer = when {
            customerId != null -> CustomerSpec(existingId = customerId)
            input.customer != null -> {
                val c = input.customer
                CustomerSpec(
                    name = v.requireText(c.name, "customer.name", 120), email = v.email(c.email, "customer.email", required = false),
                    phone = v.phone(c.phone, "customer.phone", required = false),
                    notes = v.requireText(c.notes, "customer.notes", 2000, required = false),
                    groupId = v.uuid(c.groupId, "customer.groupId"),
                )
            }
            else -> { v.error("customer", "Choose an existing customer or enter new customer details"); CustomerSpec() }
        }
        val internalNotes = v.requireText(input.internalNotes, "internalNotes", 2000, required = false)
        v.throwIfInvalid()
        val start = parseInstant(input.start, "start", access.business.zone)
        val forced = access.staffScope.forNewBooking(resourceIds)
        return CreateCommand(
            serviceId = serviceId!!, optionId = optionId, addonIds = addonIds, groupId = groupId, selectedResourceId = null,
            forcedResourceIds = forced, start = start, customer = customer, answers = input.answers, customerNotes = null,
            internalNotes = internalNotes, source = source, mode = AvailabilityMode.STAFF, payment = payment!!,
            notifyCustomer = input.notifyCustomer, idempotencyKey = idempotencyKey, actor = actor, user = access.user, returnUrl = null,
            forcedIsWholeCalendar = access.staffScope.defaultsForNewBooking(resourceIds),
        )
    }

    /** A booking with its payments, history and (while it is held) checkout link (`GET /bookings/{id}`). */
    fun detail(conn: Connection, access: BusinessAccess, id: UUID, now: Instant): BookingDetailDto {
        val b = visibleBooking(conn, access, id)
        val d = BookingRepository.toDto(b, access.business)
        val rows = PaymentRepository.forBooking(conn, access.businessId, b.id)
        val history = AuditRepository.forEntity(conn, access.business, b.id)
        val checkoutUrl = if (b.status == BookingStatus.HELD && b.holdExpiresAt?.isAfter(now) == true) {
            rows.lastOrNull { it.kind == "charge" && it.status == "pending" }?.checkoutUrl
        } else {
            null
        }
        return BookingDetailDto(
            d.id, d.reference, d.status, d.paymentStatus, d.source, d.start, d.end, d.bufferBeforeMinutes, d.bufferAfterMinutes,
            d.customer, d.service, d.option, d.addons, d.resources, d.groupId, d.answers, d.customerNotes, d.internalNotes, d.priceCents,
            d.depositCents, d.amountPaidCents, d.amountPaidInPersonCents, d.amountRefundedCents, d.currency, d.holdExpiresAt, d.cancelledAt,
            d.cancelledBy, d.cancellationReason, d.createdAt, d.updatedAt, rows.map { it.toDto(access.business) }, history, checkoutUrl,
            d.originalPriceCents, d.offer,
        )
    }

    /**
     * Edits the notes and answers (`PATCH /bookings/{id}`; absent keys keep their value). Changed answers are validated
     * against the service's current questions and merged into the stored ones ([BookingAnswers.merge]).
     */
    fun update(conn: Connection, access: BusinessAccess, id: UUID, patch: Patch, actor: Actor, now: Instant): BookingRow {
        val b = visibleBooking(conn, access, id, forUpdate = true)
        val v = Validator()
        val internal = v.requireText(patch.string("internalNotes", b.internalNotes), "internalNotes", MAX_NOTES_LENGTH, required = false)
        val customerNotes =
            v.requireText(patch.string("customerNotes", b.customerNotes), "customerNotes", MAX_NOTES_LENGTH, required = false)
        v.throwIfInvalid()
        val answers = if (patch.has("answers")) {
            val changed = patch.decode("answers", emptyMap(), MapSerializer(String.serializer(), String.serializer()))
            BookingAnswers.merge(b.answers, QuestionRepository.forService(conn, access.businessId, b.serviceId), changed)
        } else {
            null
        }
        BookingRepository.updateDetails(conn, access.businessId, id, internal, customerNotes, answers, now)
        Audit.record(conn, access.businessId, actor, "booking.updated", "booking", id, mapOf("fields" to patch.keys.toList()))
        return BookingRepository.get(conn, access.businessId, id)!!
    }

    fun approve(conn: Connection, access: BusinessAccess, id: UUID, actor: Actor, now: Instant): BookingRow {
        visibleBooking(conn, access, id)
        return lifecycle.approve(conn, access.business, id, actor, now)
    }

    /** Declines a booking request (full refund); the reason is shown to the customer. */
    fun decline(conn: Connection, access: BusinessAccess, id: UUID, reason: String?, actor: Actor, now: Instant): BookingRow {
        visibleBooking(conn, access, id)
        return lifecycle.decline(conn, access.business, id, actor, trimReason(reason), now)
    }

    /** Marks a booking that has started completed or no-show. */
    fun setOutcome(conn: Connection, access: BusinessAccess, id: UUID, status: BookingStatus, actor: Actor, now: Instant): BookingRow {
        visibleBooking(conn, access, id)
        return lifecycle.setOutcome(conn, access.business, id, status, actor, now)
    }

    /** Records that a booking the member may see was paid in person at the venue. */
    fun markPaidInPerson(conn: Connection, access: BusinessAccess, id: UUID, actor: Actor, now: Instant): BookingRow {
        visibleBooking(conn, access, id)
        return lifecycle.markPaidInPerson(conn, access.business, id, actor, now)
    }

    /**
     * A staff member may only book an existing customer they can see (one of their calendar's, or one with no bookings
     * yet), as Bo's create_booking does: booking anyone else would show them that customer's details and add the
     * customer to their list. NOT_FOUND otherwise. New customer details with an existing customer's email would book
     * that customer (the engine reuses customers by email), so the same rule applies to them, as a field error.
     */
    fun checkCustomer(conn: Connection, access: BusinessAccess, cmd: CreateCommand) {
        if (!access.isStaffOnly) return
        val c = cmd.customer
        if (c.existingId != null) {
            visibleCustomer(conn, access, c.existingId)
        } else {
            val sameEmail = c.email?.let { CustomerRepository.findByEmail(conn, access.businessId, it.lowercase()) } ?: return
            if (!customerVisibleTo(conn, access, sameEmail.id)) {
                throw Errors.field("customer.email", "Another customer already uses this email address. Ask an admin to book them.")
            }
        }
    }

    /** The created booking must include one of a staff member's own resources. */
    fun checkCreated(access: BusinessAccess, booking: BookingRow) {
        if (!access.staffScope.covers(booking)) throw Errors.forbidden(StaffScope.BOOK_OWN_ONLY)
    }

    /** Loads a booking the member may see (staff: only bookings on their own resources); NOT_FOUND otherwise. */
    fun visibleBooking(conn: Connection, access: BusinessAccess, id: UUID, forUpdate: Boolean = false): BookingRow {
        val b = BookingRepository.get(conn, access.businessId, id, forUpdate) ?: throw Errors.notFound("Booking")
        if (!access.staffScope.covers(b)) throw Errors.notFound("Booking")
        return b
    }

    /** Cancels a booking the member may see ([Cancellation.byBusiness]). */
    fun cancel(conn: Connection, access: BusinessAccess, id: UUID, cancellation: Cancellation, now: Instant): BookingRow {
        visibleBooking(conn, access, id)
        return lifecycle.cancel(conn, access.business, id, cancellation, now)
    }

    fun reschedule(
        conn: Connection, access: BusinessAccess, id: UUID, start: Instant, resourceIds: List<UUID>?, notifyCustomer: Boolean, actor: Actor,
        now: Instant,
    ): BookingRow {
        val booking = visibleBooking(conn, access, id) // someone else's booking is not found, whatever is asked of it
        access.staffScope.requireOwn(resourceIds, StaffScope.BOOK_OWN_ONLY)
        val forced = access.staffScope.forMove(resourceIds, booking)
        return engine.reschedule(conn, access.business, Reschedule.byStaff(id, start, forced, actor, notifyCustomer), now)
    }

    /** Emails the pending checkout link of a held booking (`payment_requested`). */
    fun sendPaymentLink(conn: Connection, access: BusinessAccess, id: UUID, actor: Actor, now: Instant): PaymentLinkSent {
        val b = visibleBooking(conn, access, id, forUpdate = true)
        val url = engine.pendingCheckoutUrl(conn, access.business, b, now)
        val to = b.customer.email ?: throw Errors.policy(
            "This ${access.business.vocabulary.customer.lowercase()} has no email address. Copy the payment link and share it another way.",
        )
        Notify.booking(conn, NotificationKind.PAYMENT_REQUESTED, access.businessId, b.id)
        Audit.record(conn, access.businessId, actor, "booking.payment_link_sent", "booking", b.id, mapOf("to" to to))
        return PaymentLinkSent(url, to)
    }

    /**
     * Free times to move a booking to (`GET /availability?excludeBookingId=`): its own service, duration and group, with
     * the resource rules of [reschedule] ([serviceId], when given, must be the booking's).
     */
    fun rescheduleAvailability(
        conn: Connection, access: BusinessAccess, bookingId: UUID, serviceId: UUID?, range: DateRange, resourceIds: List<UUID>?,
        now: Instant,
    ): AvailabilityDto {
        val b = visibleBooking(conn, access, bookingId)
        if (serviceId != null && serviceId != b.serviceId) throw Errors.field("serviceId", "Must be the service of the booking being moved")
        access.staffScope.requireOwn(resourceIds, StaffScope.VIEW_OWN_ONLY)
        val forced = access.staffScope.forMove(resourceIds, b)
        return availability.forMove(conn, access.business, b, range, null, forced, AvailabilityMode.STAFF, now)
    }

    /**
     * Free times for a service in staff mode (no notice or advance limits); staff only on their own resources. Slots an
     * offer discounts carry it, since staff bookings get offers too (docs/architecture.md section 19).
     */
    fun availability(
        conn: Connection, access: BusinessAccess, serviceId: UUID, range: DateRange, resourceIds: List<UUID>?,
        optionId: UUID? = null, addonIds: List<UUID> = emptyList(), groupId: UUID? = null, includePrivate: Boolean = true, now: Instant,
    ): AvailabilityDto {
        range.requireValid(AvailabilityService.MAX_RANGE_DAYS)
        val service = engine.loadService(conn, access.businessId, serviceId)
        val forced = access.staffScope.forAvailability(resourceIds, service)
        if (!includePrivate && !service.isPublic) throw Errors.notFound("Service")
        val req = AvailabilityRequest(
            access.business, service, optionId, addonIds, groupId, null, forced, range.from, range.to,
            if (includePrivate) AvailabilityMode.STAFF else AvailabilityMode.PUBLIC,
        )
        return availability.forNewBooking(conn, req, now)
    }
}

private const val MAX_NOTES_LENGTH = 2000
