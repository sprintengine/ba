package ie.bookanything.booking

import ie.bookanything.audit.Actor
import ie.bookanything.auth.CurrentUser
import ie.bookanything.auth.TokenService
import ie.bookanything.availability.AvailabilityDto
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.availability.AvailabilityRequest
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.availability.ShownSlots
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.Db
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.http.parseInstant
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.resources.ResourceRepository
import ie.bookanything.services.QuestionRepository
import ie.bookanything.services.ServiceRepository
import ie.bookanything.services.toDef
import ie.bookanything.services.toPublic
import java.time.Clock

/** Public booking operations shared by the REST routes and the MCP tools, so both enforce identical rules. */
class PublicBookingService(
    private val db: Db,
    private val clock: Clock,
    private val tokens: TokenService,
    private val provider: PaymentProvider,
    private val engine: BookingEngine,
    private val availability: BookingAvailability,
) {
    /** Active, public services; services needing online payment are hidden while the business can't take payments. */
    suspend fun services(business: BusinessRow): List<PublicServiceDto> {
        val paymentsEnabled = provider.chargesEnabled(business)
        return db.read(business.id) { conn ->
            val services = ServiceRepository.list(conn, business.id).filter { it.isActive && it.isPublic }
                // Services that need online payment are not published until payments are enabled.
                .filter { paymentsEnabled || !it.toDef().needsOnlinePayment }
            val questions = QuestionRepository.list(conn, business.id).filter { it.isActive }
            val resourceIds = services.flatMap { s ->
                s.requirements.filter { it.customerSelectable }.flatMap { it.resourceIds }
            }.toSet()
            val resources = if (resourceIds.isEmpty()) {
                emptyMap()
            } else {
                ResourceRepository.list(conn, business.id).filter { it.isActive && it.id in resourceIds }
                    .associate { it.id to SelectableResource(it.id, it.name, it.description, it.kind) }
            }
            services.map { s ->
                val sel = s.requirements.firstOrNull { it.customerSelectable }
                PublicServiceDto(
                    s.id, s.name, s.description, s.category, s.color, s.durationMinutes, s.bufferBeforeMinutes, s.bufferAfterMinutes,
                    s.slotIntervalMinutes, s.minNoticeMinutes, s.maxAdvanceDays, s.capacity, s.priceCents, s.paymentMode, s.depositCents,
                    s.toDef().offersPayAtVenue, s.requiresApproval, s.locationType, s.sortOrder, s.options, s.addons, s.allowedGroupIds,
                    sel?.let { r -> SelectableRequirement(r.id, r.label, r.resourceIds.mapNotNull { resources[it] }) },
                    questions.filter { it.serviceId == null || it.serviceId == s.id }.map { it.toPublic() },
                )
            }
        }
    }

    /**
     * Free times for a new public booking of [q]'s service (active and public only), flagged with their offers: those
     * after `q.after`, and only the next one when the business offers the next available time only.
     */
    suspend fun availability(business: BusinessRow, q: AvailabilityQuery): AvailabilityDto {
        val (from, to) = q.range.requireValid(AvailabilityService.MAX_RANGE_DAYS)
        return db.read(business.id) { conn ->
            val service = ServiceRepository.get(conn, business.id, q.serviceId)?.toDef()?.takeIf { it.isActive && it.isPublic }
                ?: throw Errors.notFound("Service")
            val req = AvailabilityRequest(
                business, service, q.optionId, q.addonIds, q.groupId, q.resourceId, null, from, to, AvailabilityMode.PUBLIC,
                shown = ShownSlots.forCustomer(business.policies, q.after),
            )
            availability.forNewBooking(conn, req, clock.instant())
        }
    }

    /** Validates and creates a public booking. Returns the result and whether it was an idempotent replay. */
    suspend fun create(
        business: BusinessRow, input: CreatePublicBooking, user: CurrentUser?, idempotencyKey: String?, source: BookingSource,
        actor: Actor,
    ): Pair<BookingResult, Boolean> {
        val v = Validator()
        val serviceId = v.uuid(input.serviceId, "serviceId")
        val optionId = v.uuid(input.optionId, "optionId")
        val addonIds = v.uuids(input.addonIds, "addonIds")
        val groupId = v.uuid(input.groupId, "groupId")
        val resourceId = v.uuid(input.resourceId, "resourceId")
        val name = v.requireText(input.customer.name, "customer.name", 120)
        val email = v.email(input.customer.email, "customer.email", required = true)
        val phone = v.phone(input.customer.phone, "customer.phone", required = business.policies.requireCustomerPhone)
        val notes = v.requireText(input.customerNotes, "customerNotes", 2000, required = false)
        if (input.answers.size > 100) v.error("answers", "Too many answers")
        if (input.expectedTotalCents != null && input.expectedTotalCents < 0) v.error("expectedTotalCents", "Must not be negative")
        val payment = v.oneOf(input.payment, "payment", PUBLIC_PAYMENT_CHOICES.keys, required = false) {
            PUBLIC_PAYMENT_CHOICES.getValue(it)
        }
        v.throwIfInvalid()
        val start = parseInstant(input.start, "start", business.zone)
        val outcome = engine.createInTx(
            business,
            CreateCommand(
                serviceId = serviceId!!, optionId = optionId, addonIds = addonIds, groupId = groupId, selectedResourceId = resourceId,
                forcedResourceIds = null, start = start,
                customer = CustomerSpec(name = name, email = email, phone = phone, groupId = groupId),
                answers = input.answers, customerNotes = notes, internalNotes = null, source = source, mode = AvailabilityMode.PUBLIC,
                payment = payment ?: PaymentChoice.AUTO, notifyCustomer = true, idempotencyKey = idempotencyKey,
                actor = actor, user = user, returnUrl = input.returnUrl, expectedPriceCents = input.expectedTotalCents,
            ),
        )
        val result = BookingResult(
            booking = BookingViews.customerView(outcome.booking, business, clock.instant()),
            manageToken = tokens.manageToken(outcome.booking.id),
            next = NextStep(outcome.next, outcome.checkoutUrl),
        )
        return result to outcome.replayed
    }
}

/** The customer's payment choice: as the service says (online), or at the venue when the service allows it. */
private val PUBLIC_PAYMENT_CHOICES = mapOf("online" to PaymentChoice.AUTO, "at_venue" to PaymentChoice.AT_VENUE)
