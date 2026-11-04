package ie.bookanything.assistant.tools

import ie.bookanything.ai.JsonSchema.array
import ie.bookanything.ai.JsonSchema.boolean
import ie.bookanything.ai.JsonSchema.enum
import ie.bookanything.ai.JsonSchema.nullable
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.audit.Actor
import ie.bookanything.auth.Role
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.booking.BookingQuote
import ie.bookanything.booking.BookingSource
import ie.bookanything.booking.BookingStatus
import ie.bookanything.booking.BookingSupport
import ie.bookanything.booking.Cancellation
import ie.bookanything.booking.CreateStaffBooking
import ie.bookanything.booking.NewBookingRules
import ie.bookanything.booking.SlotCheck
import ie.bookanything.booking.StaffCustomerInput
import ie.bookanything.booking.StaffScope
import ie.bookanything.booking.staffScope
import ie.bookanything.business.AgentChangeKind
import ie.bookanything.customers.visibleCustomer
import ie.bookanything.db.afterCommit
import ie.bookanything.http.Errors
import ie.bookanything.http.parseInstant
import ie.bookanything.http.parseUuid
import ie.bookanything.payments.CancelActor
import ie.bookanything.payments.PaymentRepository
import ie.bookanything.payments.RefundOverride
import ie.bookanything.payments.RefundPolicy
import ie.bookanything.resources.ResourceRepository
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer
import java.time.LocalDate

/** How a booking the assistant makes is paid (the staff booking payment modes). */
@Serializable
enum class BookingPayment(val key: String, val label: String) {
    @SerialName("at_venue") AT_VENUE("at_venue", "pay at the venue"),
    @SerialName("collect_online") COLLECT_ONLINE("collect_online", "pay online (a payment link is emailed)"),
    @SerialName("none") NONE("none", "no payment"),
}

/** How much of any payment a cancellation refunds. */
@Serializable
enum class RefundChoice(val override: RefundOverride) {
    @SerialName("policy") POLICY(RefundOverride.POLICY),
    @SerialName("full") FULL(RefundOverride.FULL),
    @SerialName("none") NONE(RefundOverride.NONE),
}

@Serializable
data class NewCustomerInput(val name: String, val email: String?, val phone: String?)

@Serializable
data class CreateBookingInput(
    val serviceId: String,
    val optionId: String?,
    val start: String,
    val resourceIds: List<String>?,
    val customerId: String?,
    val newCustomer: NewCustomerInput?,
    val paymentMode: BookingPayment,
    val notifyCustomer: Boolean,
    val internalNotes: String?,
) {
    fun toStaffBooking() = CreateStaffBooking(
        serviceId = serviceId, optionId = optionId, addonIds = emptyList(), groupId = null, resourceIds = resourceIds, start = start,
        customerId = customerId, customer = newCustomer?.let { StaffCustomerInput(it.name, it.email, it.phone) },
        answers = emptyMap(), internalNotes = internalNotes, paymentMode = paymentMode.key, notifyCustomer = notifyCustomer,
    )
}

object CreateBooking : WriteTool<CreateBookingInput> {
    override val name = "create_booking"
    override val label = "Preparing a booking"
    override val minRole = Role.STAFF
    override val input = serializer<CreateBookingInput>()
    override val changeKind = AgentChangeKind.BOOKINGS
    override val description =
        "Proposes a new booking; nothing is booked until the user confirms the card in the app. Check the time with " +
            "check_availability first and use one of its start values. Use an existing customer's id when find_customers finds them, " +
            "otherwise " +
            "give newCustomer. paymentMode: at_venue unless the user wants a payment link (collect_online) or it is free (none)."
    override val schema = obj(
        "serviceId" to string("Service id from list_services"),
        "optionId" to nullable(string("Option id when the service has options, else null")),
        "start" to string("Start time: a start value from check_availability (ISO-8601 with offset)"),
        "resourceIds" to nullable(array(string("Resource id"), "Specific resources to book, or null to pick suitable ones")),
        "customerId" to nullable(string("Existing customer id from find_customers, or null with newCustomer")),
        "newCustomer" to nullable(
            obj(
                "name" to string("Full name"),
                "email" to nullable(string("Email address, or null")),
                "phone" to nullable(string("Phone number, or null")),
            ),
        ),
        "paymentMode" to enum(BookingPayment.entries.map { it.key }, "How the booking is paid"),
        "notifyCustomer" to boolean("Email the customer a confirmation (true unless the user says otherwise)"),
        "internalNotes" to nullable(string("A note for the team, or null")),
    )

    override fun propose(ctx: ToolContext, input: CreateBookingInput): Proposal {
        val cmd = ctx.staff.createCommand(ctx.access, input.toStaffBooking(), BookingSource.AI, Actor.ai(ctx.access.user.id), null)
        val zone = ctx.business.zone
        return ctx.read { conn ->
            val service = ctx.engine.loadService(conn, ctx.access.businessId, cmd.serviceId)
            if (!service.isActive) throw Errors.notFound("Service")
            ctx.staff.checkCustomer(conn, ctx.access, cmd) // the staff booking route's customer rule, applied the same way
            val existing = cmd.customer.existingId?.let { visibleCustomer(conn, ctx.access, it) }
            // The booking engine applies the best offer when the booking is made; preview the same quote here.
            val quote = BookingQuote.preview(conn, ctx.business, service, cmd.optionId, emptyList(), cmd.start, ctx.now)
            val pricing = quote.pricing
            val check = SlotCheck(
                service, cmd.start, AvailabilityMode.STAFF, cmd.optionId, groupId = existing?.groupId,
                forcedResourceIds = cmd.forcedResourceIds,
            )
            val slot = ctx.engine.findSlot(conn, ctx.business, check, ctx.now)
                ?: throw Errors.slotUnavailable("That time isn't free for this service. Check availability and pick one of the free times.")
            val names = ResourceRepository.list(conn, ctx.access.businessId).associate { it.id to it.name }
            val with = slot.assignments.mapNotNull { names[it.resourceId.toString()] }.joinToString(", ")
            val who = existing?.name ?: cmd.customer.name!!
            val whenText = ToolViews.whenText(slot.start, slot.end, zone)
            val serviceName = service.name + pricing.optionName?.let { " ($it)" }.orEmpty()
            Proposal(
                title = "New ${ctx.business.vocabulary.booking.lowercase()}",
                summary = "$serviceName for $who, $whenText${if (with.isNotEmpty()) " with $with" else ""}",
                changes = listOfNotNull(
                    ProposalChange("Service", null, "$serviceName · ${pricing.durationMinutes} min"),
                    ProposalChange("When", null, whenText),
                    with.takeIf { it.isNotEmpty() }?.let { ProposalChange("With", null, it) },
                    ProposalChange(ctx.customerLabel, null, if (existing != null) who else "$who (new)"),
                    // A new customer is created with these details: the card shows everything that will be stored.
                    cmd.customer.email?.takeIf { existing == null }?.let { ProposalChange("Email", null, it) },
                    cmd.customer.phone?.takeIf { existing == null }?.let { ProposalChange("Phone", null, it) },
                    ProposalChange(
                        "Price", null,
                        "${ToolViews.price(pricing.priceCents, quote.offer, ctx.business.currency)} · ${input.paymentMode.label}",
                    ),
                    ProposalChange("Confirmation email", null, if (input.notifyCustomer) "Yes" else "No"),
                    cmd.internalNotes?.let { ProposalChange("Team note", null, ToolViews.clip(it, NOTE_PREVIEW)) },
                ),
                warnings = listOfNotNull(
                    "A new customer record will be created for $who.".takeIf { existing == null },
                    "The booking is held until the customer pays online.".takeIf {
                        NewBookingRules.onlineAmount(cmd.payment, service.needsOnlinePayment, quote) != null
                    },
                ),
                confirmLabel = "Book it",
            )
        }
    }

    override fun execute(ctx: ToolContext, run: Execution, input: CreateBookingInput): ActionResult {
        val cmd = ctx.staff.createCommand(ctx.access, input.toStaffBooking(), BookingSource.AI, run.actor, "assistant-${run.actionId}")
        // Checked again on confirming: the customer's bookings (and so who may see them) can change after the proposal.
        ctx.staff.checkCustomer(run.conn, ctx.access, cmd)
        val outcome = ctx.engine.create(run.conn, ctx.business, cmd, ctx.now)
        ctx.staff.checkCreated(ctx.access, outcome.booking)
        // A booking held for online payment gets its checkout, and its payment email, once the confirmation has committed
        // (a provider failure then releases the hold; see BookingEngine.completeCheckout).
        outcome.pending?.let { pending -> run.conn.afterCommit { ctx.engine.completeCheckout(ctx.business, pending) } }
        val b = outcome.booking
        val date = LocalDate.ofInstant(b.start, ctx.business.zone)
        return ActionResult(
            "Booked ${b.serviceName} for ${b.customer.name}, ${ToolViews.whenText(b.start, b.end, ctx.business.zone)} (${b.reference}).",
            listOf(ActionLink("Open calendar", "calendar?date=$date"), ActionLink("View booking", "bookings?q=${b.reference}")),
        )
    }

    /** How much of the team note the card shows. */
    private const val NOTE_PREVIEW = 200
}

@Serializable
data class RescheduleInput(val bookingId: String, val start: String, val resourceIds: List<String>?, val notifyCustomer: Boolean)

object RescheduleBooking : WriteTool<RescheduleInput> {
    override val name = "reschedule_booking"
    override val label = "Preparing a reschedule"
    override val minRole = Role.STAFF
    override val input = serializer<RescheduleInput>()
    override val changeKind = AgentChangeKind.BOOKINGS
    override val description = "Proposes moving a booking to a new start time (same service and length); nothing moves until the user " +
        "confirms. Find the booking with find_bookings or get_schedule and check free times first."
    override val schema = obj(
        "bookingId" to string("Booking id (not the reference)"),
        "start" to string("New start time, ISO-8601 with offset"),
        "resourceIds" to nullable(array(string("Resource id"), "Move to these resources, or null to keep or re-pick suitable ones")),
        "notifyCustomer" to boolean("Email the customer about the change"),
    )

    override fun propose(ctx: ToolContext, input: RescheduleInput): Proposal {
        val zone = ctx.business.zone
        val start = parseInstant(input.start, "start", zone)
        val resourceIds = input.resourceIds?.map { parseUuid(it, "resourceIds") }
        ctx.access.staffScope.requireOwn(resourceIds, StaffScope.BOOK_OWN_ONLY)
        return ctx.read { conn ->
            val b = visibleBooking(ctx, conn, input.bookingId)
            BookingSupport.requireBlockingStatus(b, BookingStatus.MOVABLE, "rescheduled")
            val service = ctx.engine.loadService(conn, ctx.access.businessId, b.serviceId)
            val forced = ctx.access.staffScope.forMove(resourceIds, b)
            val check = SlotCheck.move(b, service, start, AvailabilityMode.STAFF, forcedResourceIds = forced)
            val slot = ctx.engine.findSlot(conn, ctx.business, check, ctx.now)
                ?: throw Errors.slotUnavailable("That time isn't free for this booking. Check availability and pick one of the free times.")
            val names = ResourceRepository.list(conn, ctx.access.businessId).associate { it.id to it.name }
            val newWith = slot.assignments.mapNotNull { names[it.resourceId.toString()] }.joinToString(", ")
            val oldWith = b.resources.joinToString(", ") { it.name }
            Proposal(
                title = "Move ${ctx.business.vocabulary.booking.lowercase()}",
                summary = "${b.reference} · ${b.serviceName} for ${b.customer.name} to ${ToolViews.whenText(slot.start, slot.end, zone)}",
                changes = listOfNotNull(
                    ProposalChange("When", ToolViews.whenText(b.start, b.end, zone), ToolViews.whenText(slot.start, slot.end, zone)),
                    ProposalChange("With", oldWith, newWith).takeIf { oldWith != newWith },
                    ProposalChange("${ctx.customerLabel} email", null, if (input.notifyCustomer) "Yes" else "No"),
                ),
                confirmLabel = "Move it",
            )
        }
    }

    override fun execute(ctx: ToolContext, run: Execution, input: RescheduleInput): ActionResult {
        val zone = ctx.business.zone
        val b = ctx.staff.reschedule(
            run.conn, ctx.access, parseUuid(input.bookingId, "bookingId"),
            parseInstant(input.start, "start", zone),
            input.resourceIds?.map { parseUuid(it, "resourceIds") }, input.notifyCustomer, run.actor, ctx.now,
        )
        return ActionResult(
            "Moved ${b.reference} to ${ToolViews.whenText(b.start, b.end, zone)}.",
            listOf(ActionLink("Open calendar", "calendar?date=${LocalDate.ofInstant(b.start, zone)}")),
        )
    }
}

@Serializable
data class CancelInput(val bookingIds: List<String>, val reason: String?, val refund: RefundChoice, val notifyCustomer: Boolean)

object CancelBookings : WriteTool<CancelInput> {
    override val name = "cancel_bookings"
    override val label = "Preparing a cancellation"
    override val minRole = Role.STAFF
    override val input = serializer<CancelInput>()
    override val changeKind = AgentChangeKind.CANCELLATIONS

    override fun count(input: CancelInput) = input.bookingIds.distinct().size
    override val description = "Proposes cancelling one or more bookings (up to 20), showing each booking and the refund it would get; " +
        "nothing is cancelled until the user confirms. refund: policy (the business's rules: a business cancellation refunds in full), " +
        "full or none."
    override val schema = obj(
        "bookingIds" to array(string("Booking id"), "The bookings to cancel (1 to 20)"),
        "reason" to nullable(string("Reason shown to the customer, or null")),
        "refund" to enum(listOf("policy", "full", "none"), "How much of any payment to refund"),
        "notifyCustomer" to boolean("Email each customer about the cancellation"),
    )

    override fun propose(ctx: ToolContext, input: CancelInput): Proposal {
        val ids = input.bookingIds.distinct()
        if (ids.isEmpty() || ids.size > 20) throw Errors.field("bookingIds", "Give between 1 and 20 bookings")
        val refund = input.refund.override
        val p = ctx.business.policies
        return ctx.read { conn ->
            val bookings = ids.map { visibleBooking(ctx, conn, it) }
            bookings.forEach { BookingSupport.requireBlockingStatus(it, BookingStatus.BLOCKING, "cancelled") }
            val items = bookings.map { b ->
                val decision = RefundPolicy.decide(
                    CancelActor.BUSINESS, ctx.now, b.start, p.cancellationNoticeHours,
                    p.lateCancellationRefundPercent,
                    b.amountPaidOnlineCents, b.amountRefundedCents, refund,
                )
                ProposalItem(
                    bookingLine(b, ctx),
                    if (decision.amountCents >
                        0
                    ) {
                        "Refund ${ToolViews.money(decision.amountCents, b.currency)} (${decision.reason})"
                    } else {
                        "Nothing to refund"
                    },
                )
            }
            val n = ctx.bookings(bookings.size)
            Proposal(
                title = "Cancel $n",
                summary = if (bookings.size == 1) "Cancel ${bookingLine(bookings.single(), ctx)}" else "Cancel $n",
                items = items,
                changes = listOfNotNull(
                    input.reason?.takeIf { it.isNotBlank() }?.let { ProposalChange("Reason", null, it.trim().take(500)) },
                    ProposalChange("${ctx.customerLabel} email", null, if (input.notifyCustomer) "Yes" else "No"),
                ),
                warnings = listOf("Cancelled bookings can't be restored; the customers would need to book again."),
                confirmLabel = "Cancel $n",
                destructive = true,
            )
        }
    }

    override fun execute(ctx: ToolContext, run: Execution, input: CancelInput): ActionResult {
        val refund = input.refund.override
        val ids = input.bookingIds.distinct().map { parseUuid(it, "bookingIds") }
        // Lock and check every booking before cancelling any, so one that can't be cancelled fails the action up front.
        // Refunds reach the provider only once the confirmation commits (a failed action, rolled back, refunds nobody).
        // Locked in id order, so two bulk cancellations of overlapping bookings can't deadlock.
        ids.sorted().forEach { id ->
            val b = ctx.staff.visibleBooking(run.conn, ctx.access, id, forUpdate = true)
            BookingSupport.requireBlockingStatus(b, BookingStatus.BLOCKING, "cancelled")
        }
        val cancelled = ids.map { id ->
            val cancellation = Cancellation.byBusiness(run.actor, input.reason, refund, input.notifyCustomer)
            ctx.staff.cancel(run.conn, ctx.access, id, cancellation, ctx.now)
        }
        // The refunds are recorded now and made at the provider after the commit.
        val refunding = cancelled.any { b ->
            PaymentRepository.forBooking(run.conn, ctx.access.businessId, b.id).any { it.kind == "refund" && it.status == "pending" }
        }
        val note = if (refunding) " Refunds are on their way." else ""
        return ActionResult(
            "Cancelled ${cancelled.joinToString(", ") { it.reference }}.$note",
            listOf(ActionLink("Open calendar", "calendar?date=${LocalDate.ofInstant(cancelled.first().start, ctx.business.zone)}")),
        )
    }
}

@Serializable
data class PaymentLinkInput(val bookingId: String)

object SendPaymentLink : WriteTool<PaymentLinkInput> {
    override val name = "send_payment_link"
    override val label = "Preparing a payment link"
    override val minRole = Role.STAFF
    override val input = serializer<PaymentLinkInput>()
    override val changeKind = AgentChangeKind.BOOKINGS
    override val description = "Proposes emailing the customer the link to pay for a booking that is waiting for payment (status held); " +
        "nothing is sent until the user confirms."
    override val schema = obj("bookingId" to string("Booking id"))

    override fun propose(ctx: ToolContext, input: PaymentLinkInput): Proposal = ctx.read { conn ->
        val b = visibleBooking(ctx, conn, input.bookingId)
        ctx.engine.pendingCheckoutUrl(conn, ctx.business, b, ctx.now)
        val email = b.customer.email
            ?: throw Errors.policy("This ${ctx.business.vocabulary.customer.lowercase()} has no email address, so a link can't be emailed.")
        val amount = b.onlineAmountCents
        Proposal(
            title = "Send payment link",
            summary = "Email ${b.customer.name} a link to pay ${ToolViews.money(amount, b.currency)} for ${b.reference}",
            changes = listOf(ProposalChange("To", null, email), ProposalChange("Amount", null, ToolViews.money(amount, b.currency))),
            items = listOf(ProposalItem(bookingLine(b, ctx), null)),
            confirmLabel = "Send link",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: PaymentLinkInput): ActionResult {
        val sent = ctx.staff.sendPaymentLink(run.conn, ctx.access, parseUuid(input.bookingId, "bookingId"), run.actor, ctx.now)
        return ActionResult("Sent the payment link to ${sent.sentTo}.")
    }
}
