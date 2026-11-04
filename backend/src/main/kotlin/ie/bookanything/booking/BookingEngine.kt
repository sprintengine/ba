package ie.bookanything.booking

import ie.bookanything.audit.Actor
import ie.bookanything.audit.ActorType
import ie.bookanything.audit.Audit
import ie.bookanything.auth.TokenService
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.availability.ComputedSlot
import ie.bookanything.business.BusinessRow
import ie.bookanything.config.AppUrls
import ie.bookanything.customers.CustomerGroupRepository
import ie.bookanything.customers.CustomerRepository
import ie.bookanything.db.Db
import ie.bookanything.db.PgState
import ie.bookanything.db.TstzRange
import ie.bookanything.db.afterCommit
import ie.bookanything.db.constraintName
import ie.bookanything.db.sqlState
import ie.bookanything.http.Errors
import ie.bookanything.notifications.NotificationKind
import ie.bookanything.notifications.Notify
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.observability.AppMetrics
import ie.bookanything.observability.Telemetry
import ie.bookanything.offers.OfferGuard
import ie.bookanything.offers.OfferPricing
import ie.bookanything.payments.ChargeRequest
import ie.bookanything.payments.CheckoutExpiry
import ie.bookanything.payments.CheckoutRequest
import ie.bookanything.payments.CheckoutSession
import ie.bookanything.payments.Money
import ie.bookanything.payments.PaymentRepository
import ie.bookanything.payments.PaymentService
import ie.bookanything.services.QuestionRepository
import ie.bookanything.services.ServiceDef
import ie.bookanything.services.ServiceRepository
import ie.bookanything.services.toDef
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.sql.Connection
import java.sql.SQLException
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Locale
import java.util.UUID

/**
 * Creating and rescheduling bookings (docs/architecture.md 5.2). Methods taking a [Connection] run inside the caller's
 * transaction; [createInTx] and [completeCheckout] own theirs, because they wait on the payment provider.
 */
class BookingEngine(
    private val db: Db,
    private val clock: Clock,
    private val tokens: TokenService,
    val payments: PaymentService,
    private val urls: AppUrls,
    private val inbox: Inbox,
) {
    /** How long a replayed request waits for the checkout its first request is still creating (tests shorten it). */
    internal var checkoutWait: Duration = CHECKOUT_WAIT

    fun loadService(conn: Connection, businessId: UUID, serviceId: UUID): ServiceDef =
        ServiceRepository.get(conn, businessId, serviceId)?.toDef() ?: throw Errors.notFound("Service")

    /**
     * Creates a booking in its own transaction (a concurrent request with the same Idempotency-Key becomes a replay).
     * A booking held for online payment commits first, with its pending charge, and its checkout is created at the
     * provider afterwards ([completeCheckout]): the hold protects the slot meanwhile, and the provider call holds no
     * locks. A replay of a request still waiting for the provider waits for its link ([awaitCheckout]).
     */
    suspend fun createInTx(business: BusinessRow, cmd: CreateCommand): CreateOutcome {
        val outcome = createCommitted(business, cmd)
        return when {
            outcome.pending != null -> withContext(Dispatchers.IO) { withCheckout(business, outcome, outcome.pending) }
            outcome.awaitingCheckout -> awaitCheckout(business, cmd)
            else -> outcome
        }
    }

    private suspend fun createCommitted(business: BusinessRow, cmd: CreateCommand): CreateOutcome = try {
        db.tx(business.id) { conn -> create(conn, business, cmd, clock.instant()) }
    } catch (e: SQLException) {
        if (cmd.idempotencyKey != null && e.sqlState() == PgState.UNIQUE_VIOLATION && e.constraintName()?.contains("idempotency") == true) {
            db.tx(business.id) { conn -> replay(conn, business, cmd) ?: throw e }
        } else {
            throw e
        }
    }

    /** [outcome] with its checkout link, or as the booking now stands if it stopped waiting for payment meanwhile. */
    private fun withCheckout(business: BusinessRow, outcome: CreateOutcome, pending: PendingCheckout): CreateOutcome {
        val url = completeCheckout(business, pending)
            ?: return db.txBlocking(business.id, readOnly = true) { conn ->
                val row = BookingRepository.get(conn, business.id, outcome.booking.id)!!
                CreateOutcome(row, false, null, NewBookingRules.nextStep(row.status))
            }
        return outcome.copy(checkoutUrl = url, pending = null)
    }

    /**
     * Creates the checkout of a held booking that has committed: calls the provider outside any transaction, then stores
     * the session and sends the booking's payment email in a short one. Returns the link, or null when the booking
     * stopped waiting for this payment meanwhile. When the provider fails, the hold is released as an abandoned
     * checkout's is ([releaseFailedCheckout]) and the failure is rethrown, so the caller answers as before.
     */
    fun completeCheckout(business: BusinessRow, pending: PendingCheckout): String? {
        val session = try {
            payments.provider.createCheckout(pending.request)
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Provider boundary: release the hold, then report the failure.
            db.txBlocking(business.id) { conn -> releaseFailedCheckout(conn, business, pending.request.bookingId, clock.instant()) }
            throw e
        }
        return db.txBlocking(business.id) { conn -> attachCheckout(conn, business, pending, session) }
    }

    private fun attachCheckout(conn: Connection, business: BusinessRow, pending: PendingCheckout, session: CheckoutSession): String? {
        val request = pending.request
        // Lock order: the booking, then its payment (as cancellations and payment events do).
        val booking = BookingRepository.get(conn, business.id, request.bookingId, forUpdate = true)
        val payment = PaymentRepository.get(conn, request.paymentId, forUpdate = true) ?: return null
        // Stored even when the booking was cancelled meanwhile, so the provider's events about the session still match.
        PaymentRepository.setCheckout(conn, payment.id, session.providerRef, session.url)
        if (booking?.status != BookingStatus.HELD || payment.status != "pending") {
            // The booking was cancelled while the session was being created: close it, as cancelling would have.
            if (payment.status == "cancelled") CheckoutExpiry.enqueue(conn, business.id, payment.id)
            return null
        }
        pending.notifications.forEach { Notify.booking(conn, it, business.id, booking.id) }
        return session.url
    }

    /**
     * A held booking whose checkout could not be created: expired and its slot released as when a checkout is abandoned
     * ([BookingLifecycle.paymentCancelled]), and its Idempotency-Key freed, so retrying the request books again (before,
     * the failed request rolled back and left no booking behind).
     */
    private fun releaseFailedCheckout(conn: Connection, business: BusinessRow, bookingId: UUID, now: Instant) {
        val b = BookingRepository.get(conn, business.id, bookingId, forUpdate = true) ?: return
        PaymentRepository.cancelPendingCharges(conn, business.id, b.id)
        if (b.status != BookingStatus.HELD) return
        BookingRepository.setStatus(conn, business.id, b.id, BookingStatus.EXPIRED, now, clearHold = true)
        BookingRepository.releaseIdempotencyKey(conn, business.id, b.id)
        AllocationRepository.release(conn, business.id, b.id)
        Audit.record(conn, business.id, Actor.SYSTEM, "booking.expired", "booking", b.id, mapOf("reason" to "checkout_failed"))
        conn.afterCommit { Telemetry.metrics.holds(AppMetrics.HoldOutcome.ABANDONED) }
    }

    /**
     * A replay whose first request is still creating its checkout: waits, outside any transaction, until that request
     * has stored the link (returned, as any replay's) or given up. When it gave up (the provider failed and the key was
     * freed), this request books afresh. If the first request never finishes (its process stopped), this one is told to
     * try again later; the hold then expires as any unpaid hold does.
     */
    private suspend fun awaitCheckout(business: BusinessRow, cmd: CreateCommand): CreateOutcome {
        val deadline = System.nanoTime() + checkoutWait.toNanos()
        while (System.nanoTime() < deadline) {
            delay(CHECKOUT_POLL.toMillis())
            val replay = db.read(business.id) { conn -> replay(conn, business, cmd) } ?: return createInTx(business, cmd)
            if (!replay.awaitingCheckout) return replay
        }
        throw Errors.conflict("This booking is still being set up. Please try again in a moment.")
    }

    private fun replay(conn: Connection, business: BusinessRow, cmd: CreateCommand): CreateOutcome? {
        val key = cmd.idempotencyKey ?: return null
        val existing = BookingRepository.byIdempotencyKey(conn, business.id, key) ?: return null
        // Public replays return the manage token, so the key alone (which MCP clients may make guessable) is not
        // enough: the request must also be for the same customer.
        val sameCustomer = cmd.mode != AvailabilityMode.PUBLIC ||
            (existing.customer.email != null && existing.customer.email.equals(cmd.customer.email, ignoreCase = true))
        if (existing.serviceId != cmd.serviceId || existing.start != cmd.start || !sameCustomer) {
            throw Errors.conflict("This Idempotency-Key was already used for a different booking request.")
        }
        val charge = if (existing.status == BookingStatus.HELD) PaymentRepository.pendingCharge(conn, business.id, existing.id) else null
        return CreateOutcome(
            existing, true, charge?.checkoutUrl, NewBookingRules.nextStep(existing.status),
            awaitingCheckout = charge != null && charge.checkoutUrl == null,
        )
    }

    fun create(conn: Connection, business: BusinessRow, cmd: CreateCommand, now: Instant): CreateOutcome {
        replay(conn, business, cmd)?.let { return it }

        val service = loadService(conn, business.id, cmd.serviceId)
        val public = cmd.mode == AvailabilityMode.PUBLIC
        checkBookable(service, cmd, public)
        val groupId = bookingGroup(conn, business, cmd, service)
        val quote = BookingQuote.forBooking(conn, business, service, cmd.optionId, cmd.addonIds, cmd.start, now)
        // The quote counted a capped deal's redemptions under its lock, so this is the price the booking would get.
        if (cmd.expectedPriceCents != null && cmd.expectedPriceCents != quote.priceCents) {
            throw Errors.priceChanged(Money.format(quote.priceCents, business.currency, Locale.forLanguageTag(business.locale)))
        }
        val onlineAmount = NewBookingRules.onlineAmount(cmd.payment, service.needsOnlinePayment, quote)
        if (onlineAmount != null && !payments.provider.chargesEnabled(business)) throw Errors.paymentsNotConfigured()

        val questions = QuestionRepository.forService(conn, business.id, service.id)
        val answers = BookingAnswers.validate(questions, cmd.answers, enforceRequired = public)
        // Lock the month's count and the candidate resources, release stale holds, then re-check the exact slot.
        val poolIds = service.requirements.flatMap { it.resourceIds }
        lockForBooking(conn, business, cmd, poolIds, now)?.let { return it }
        BookingSupport.expireStaleHolds(conn, now, business.id, poolIds)
        val forced = if (cmd.forcedIsWholeCalendar) {
            StaffScope.usableFor(cmd.forcedResourceIds.orEmpty(), service).ifEmpty { throw Errors.forbidden(StaffScope.BOOK_OWN_ONLY) }
        } else {
            cmd.forcedResourceIds
        }
        val check = SlotCheck(service, cmd.start, cmd.mode, cmd.optionId, cmd.addonIds, groupId, cmd.selectedResourceId, forced)
        val slot = findSlot(conn, business, check, now) ?: throw Errors.slotUnavailable()

        val customerId = resolveCustomer(conn, business, cmd, groupId, now)
        val status = NewBookingRules.initialStatus(onlineAmount != null, public, service.requiresApproval)
        // Stripe Checkout cannot expire sooner than 30 minutes, so the provider may lengthen the hold.
        val holdExpires = NewBookingRules.holdExpiry(status, now, maxOf(business.policies.holdMinutes, payments.provider.minHoldMinutes))
        val bookingId = UUID.randomUUID()
        val booking = NewBooking(
            id = bookingId, businessId = business.id, reference = BookingSupport.newReference(conn, business.id),
            customerId = customerId, serviceId = service.id, optionId = cmd.optionId, optionName = quote.pricing.optionName,
            addons = cmd.addonIds.distinct().map { id -> service.addons.first { it.id == id } }
                .map { AddonSnapshot(it.id.toString(), it.name, it.extraMinutes, it.priceCents) },
            groupId = groupId, start = slot.start, end = slot.end, status = status, holdExpiresAt = holdExpires,
            priceCents = quote.priceCents,
            depositCents = NewBookingRules.depositCents(quote, onlineAmount), currency = business.currency,
            paymentStatus = NewBookingRules.paymentStatus(cmd.payment, onlineAmount, quote), answers = answers,
            customerNotes = cmd.customerNotes, internalNotes = cmd.internalNotes, source = cmd.source,
            manageTokenHash = TokenService.hash(tokens.manageToken(bookingId)), idempotencyKey = cmd.idempotencyKey,
            createdByUserId = cmd.user?.id, createdAt = now, offerId = quote.offer?.offer?.id,
            originalPriceCents = quote.offer?.originalCents,
            offer = quote.offer?.let { OfferPricing.snapshot(it, business.currency) },
            reminderSentAt = NewBookingRules.reminderSentAt(slot.start, now, cmd.notifyCustomer),
        )
        BookingRepository.insert(conn, booking)
        insertAllocations(conn, business.id, bookingId, service, slot)
        conn.afterCommit { Telemetry.metrics.bookingCreated(status.wire) }

        val checkout = onlineAmount?.let { prepareCheckout(conn, business, service.name, cmd, booking, it) }
        val notifications = NewBookingRules.notifications(status, public, cmd.notifyCustomer)
        // A held booking's payment email carries the checkout link, so it is sent once the checkout exists.
        if (checkout == null) notifications.forEach { Notify.booking(conn, it, business.id, bookingId) }
        Audit.record(
            conn, business.id, cmd.actor, "booking.created", "booking", bookingId,
            mapOf("reference" to booking.reference, "status" to status.wire, "source" to cmd.source.wire, "service" to service.name) +
                (quote.offer?.let { mapOf("offer" to it.offer.name, "discountCents" to it.discountCents) }.orEmpty()),
        )
        val row = BookingRepository.get(conn, business.id, bookingId)!!
        return CreateOutcome(
            row, false, null, NewBookingRules.nextStep(status), pending = checkout?.let { PendingCheckout(it, notifications) },
        )
    }

    /**
     * Takes what serialises this booking with others: the business's monthly count when its plan limits bookings (then
     * counts the month), and the candidate resources. Returns the answer of a request with the same Idempotency-Key that
     * committed while this one waited for either (not a booking to count or make again), or null to go on.
     */
    private fun lockForBooking(
        conn: Connection, business: BusinessRow, cmd: CreateCommand, poolIds: List<UUID>, now: Instant,
    ): CreateOutcome? {
        if (BookingSupport.lockBookingLimit(conn, business)) replay(conn, business, cmd)?.let { return it }
        BookingSupport.checkBookingLimit(conn, business, now)
        AllocationRepository.lockResources(conn, business.id, poolIds)
        return replay(conn, business, cmd)
    }

    /** Active (and public, for the customer's own booking), and paid at the venue only if the service lets the customer choose it. */
    private fun checkBookable(service: ServiceDef, cmd: CreateCommand, public: Boolean) {
        if (!service.isActive || (public && !service.isPublic)) throw Errors.notFound("Service")
        if (public && cmd.payment == PaymentChoice.AT_VENUE && !service.offersPayAtVenue) {
            throw Errors.field("payment", "This service is paid online when you book.")
        }
    }

    /** The customer group the booking is for (the request's, the new customer's or the existing customer's); it must be allowed. */
    private fun bookingGroup(conn: Connection, business: BusinessRow, cmd: CreateCommand, service: ServiceDef): UUID? {
        val existingGroup = cmd.customer.existingId?.let { CustomerRepository.get(conn, business.id, it)?.groupId }
        val groupId = cmd.groupId ?: cmd.customer.groupId ?: existingGroup
        if (groupId != null && !CustomerGroupRepository.activeExists(conn, business.id, groupId)) {
            throw Errors.field("groupId", "Unknown customer group")
        }
        if (!AvailabilityService.groupMayBook(service, groupId)) {
            throw Errors.policy("This service is only available to specific customer groups.")
        }
        return groupId
    }

    /** Records the online charge of a held booking; returns the checkout to create for it, which comes back to the manage page. */
    private fun prepareCheckout(
        conn: Connection, business: BusinessRow, serviceName: String, cmd: CreateCommand, booking: NewBooking, amountCents: Int,
    ): CheckoutRequest {
        val manage = urls.manage(tokens.manageToken(booking.id), origin = urls.returnOrigin(cmd.returnUrl))
        return payments.prepareCharge(
            conn, business,
            ChargeRequest(
                booking.id, amountCents, "$serviceName · ${business.name}", cmd.customer.email, booking.holdExpiresAt!!,
                cmd.returnUrl?.let { urls.returnOrigin(it) }, "$manage?payment=succeeded", "$manage?payment=cancelled",
            ),
        )
    }

    private fun resolveCustomer(conn: Connection, business: BusinessRow, cmd: CreateCommand, groupId: UUID?, now: Instant): UUID {
        val c = cmd.customer
        if (c.existingId != null) {
            val existing = CustomerRepository.get(conn, business.id, c.existingId) ?: throw Errors.field("customerId", "Unknown customer")
            if (existing.erasedAt != null) throw Errors.field("customerId", "This customer record has been erased")
            return existing.id
        }
        val name = c.name ?: throw Errors.field("customer.name", "Required")
        if (cmd.mode == AvailabilityMode.PUBLIC) {
            return CustomerRepository.resolveForPublicBooking(conn, business.id, cmd.user, name, c.email!!, c.phone, groupId, now)
        }
        // Staff: reuse by email when given, else create.
        val group = c.groupId ?: groupId
        if (c.email == null) return CustomerRepository.insert(conn, business.id, name, null, c.phone, c.notes, group, null, now)
        CustomerRepository.findByEmail(conn, business.id, c.email.lowercase())?.let { return it.id }
        return CustomerRepository.insertOrFindByEmail(conn, business.id, name, c.email, c.phone, c.notes, group, null, now)
    }

    /** The slot at exactly [SlotCheck.start] if it is free (with the resources it would use), else null. */
    fun findSlot(conn: Connection, business: BusinessRow, check: SlotCheck, now: Instant): ComputedSlot? {
        val req = check.toRequest(business)
        return AvailabilityService.compute(conn, req, now)[req.from]?.firstOrNull { it.start == check.start }
    }

    /** The checkout link of a booking that is still held for payment; POLICY_VIOLATION otherwise. */
    fun pendingCheckoutUrl(conn: Connection, business: BusinessRow, booking: BookingRow, now: Instant): String {
        if (booking.status != BookingStatus.HELD || booking.holdExpiresAt?.isAfter(now) != true) {
            throw Errors.policy("This booking is not waiting for payment.")
        }
        return PaymentRepository.pendingCharge(conn, business.id, booking.id)?.checkoutUrl
            ?: throw Errors.policy("This booking is not waiting for payment.")
    }

    fun insertAllocations(conn: Connection, businessId: UUID, bookingId: UUID, service: ServiceDef, slot: ComputedSlot) {
        val range = TstzRange(
            slot.start.minus(Duration.ofMinutes(service.bufferBeforeMinutes.toLong())),
            slot.end.plus(Duration.ofMinutes(service.bufferAfterMinutes.toLong())),
        )
        AllocationRepository.insert(conn, businessId, bookingId, slot.assignments, range, exclusive = service.capacity == 1)
    }

    /**
     * Moves a booking to a new start. The booking keeps its duration; its own allocations are
     * excluded from the busy set, then replaced atomically.
     */
    fun reschedule(conn: Connection, business: BusinessRow, move: Reschedule, now: Instant): BookingRow {
        val booking = BookingRepository.get(conn, business.id, move.bookingId, forUpdate = true) ?: throw Errors.notFound("Booking")
        BookingSupport.requireBlockingStatus(booking, BookingStatus.MOVABLE, "rescheduled")
        val service = loadService(conn, business.id, booking.serviceId)
        if (!service.isActive) throw Errors.policy("This service is no longer offered, so the booking can't be moved.")
        if (move.mode == AvailabilityMode.PUBLIC) OfferGuard.requireCovers(conn, business, booking, move.start, now)
        val poolIds = service.requirements.flatMap { it.resourceIds }
        AllocationRepository.lockResources(conn, business.id, poolIds + booking.resourceIds)
        BookingSupport.expireStaleHolds(conn, now, business.id, poolIds)
        val check = SlotCheck.move(booking, service, move.start, move.mode, move.selectedResourceId, move.forcedResourceIds)
        val slot = findSlot(conn, business, check, now) ?: throw Errors.slotUnavailable()
        AllocationRepository.delete(conn, business.id, booking.id)
        insertAllocations(conn, business.id, booking.id, service, slot)
        val reminderSentAt = NewBookingRules.reminderSentAt(slot.start, now, move.notifyCustomer)
        BookingRepository.moveTo(conn, business.id, booking.id, slot.start, slot.end, reminderSentAt, now)
        if (move.notifyCustomer) {
            Notify.booking(
                conn, NotificationKind.BOOKING_RESCHEDULED, business.id, booking.id, mapOf("previousStart" to booking.start.toString()),
            )
        }
        val moved = BookingRepository.get(conn, business.id, booking.id)!!
        if (move.actor.type in CUSTOMER_SIDE) inbox.team(conn, business, moved, Inbox.TeamEvent.MOVED, movedFrom = booking)
        Audit.record(
            conn, business.id, move.actor, "booking.rescheduled", "booking", booking.id,
            mapOf(
                "from" to booking.start.toString(), "to" to slot.start.toString(),
                "resources" to slot.assignments.map { it.resourceId.toString() },
            ),
        )
        return moved
    }
}

/** Who acts as (or for) the customer: their moves are news to the business's team. */
private val CUSTOMER_SIDE = setOf(ActorType.CUSTOMER, ActorType.GUEST, ActorType.API)

/** Longer than the slowest provider call allowed (two attempts at the Stripe client's timeouts, `SdkStripeGateway`). */
private val CHECKOUT_WAIT: Duration = Duration.ofSeconds(60)

/** How often a waiting replay looks for its checkout. */
private val CHECKOUT_POLL: Duration = Duration.ofMillis(250)
