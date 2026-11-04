package ie.bookanything.assistant.tools

import ie.bookanything.ai.JsonSchema.array
import ie.bookanything.ai.JsonSchema.enum
import ie.bookanything.ai.JsonSchema.nullable
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.auth.Role
import ie.bookanything.booking.BookingRow
import ie.bookanything.booking.BookingStatus
import ie.bookanything.booking.BookingSupport
import ie.bookanything.business.AgentChangeKind
import ie.bookanything.http.Errors
import ie.bookanything.http.Patch
import ie.bookanything.http.parseUuid
import ie.bookanything.payments.PaymentStatus
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.serializer
import java.sql.Connection
import java.time.LocalDate

// The day-to-day booking actions of the dashboard's booking drawer: look a booking up in full, approve or decline
// requests, record how it went, take payment at the venue and keep notes. Each calls the same command as the drawer.

@Serializable
data class BookingIdInput(val bookingId: String)

@Serializable
data class BookingDetail(
    val booking: BookingView,
    val payments: List<String>,
    val history: List<String>,
)

object GetBooking : ReadTool<BookingIdInput> {
    override val name = "get_booking"
    override val label = "Opening the booking"
    override val minRole = Role.STAFF
    override val input = serializer<BookingIdInput>()
    override val description = "One booking in full: its details, payments (charges, refunds, paid at the venue) and history (who " +
        "made, moved, approved or cancelled it, and when). Find the id with find_bookings or get_schedule."
    override val schema = obj("bookingId" to string("Booking id (not the reference)"))

    override fun run(ctx: ToolContext, input: BookingIdInput): ToolOutput = ctx.read { conn ->
        val b = visibleBooking(ctx, conn, input.bookingId)
        val detail = ctx.staff.detail(conn, ctx.access, b.id, ctx.now)
        val payments = detail.payments.map {
            val amount = ToolViews.money(it.amountCents, it.currency)
            "${it.createdAt.take(16).replace('T', ' ')} · ${it.kind.replace('_', ' ')} · $amount · ${it.status}"
        }
        val history = detail.history.map { e ->
            "${e.occurredAt.take(16).replace('T', ' ')} · ${e.action} · ${e.actorName ?: e.actorType.name.lowercase()}"
        }
        ToolViews.output(
            serializer(), BookingDetail(ToolViews.booking(b, ctx.business), payments, history), "Opened ${b.reference}", untrusted = true,
        )
    }
}

@Serializable
data class BookingIdsInput(val bookingIds: List<String>)

/** 1 to 20 distinct bookings the member may see, read for a preview. */
private fun ToolContext.bookingsFor(conn: Connection, ids: List<String>): List<BookingRow> {
    val distinct = ids.distinct()
    if (distinct.isEmpty() || distinct.size > MAX_BULK) throw Errors.field("bookingIds", "Give between 1 and $MAX_BULK bookings")
    return distinct.map { visibleBooking(this, conn, it) }
}

private const val MAX_BULK = 20

private fun ToolContext.calendarLink(b: BookingRow) =
    ActionLink("Open calendar", "calendar?date=${LocalDate.ofInstant(b.start, business.zone)}")

object ApproveBookings : WriteTool<BookingIdsInput> {
    override val name = "approve_bookings"
    override val label = "Preparing approvals"
    override val minRole = Role.STAFF
    override val input = serializer<BookingIdsInput>()
    override val changeKind = AgentChangeKind.BOOKINGS

    override fun count(input: BookingIdsInput) = input.bookingIds.distinct().size
    override val description = "Proposes approving booking requests (status pending_approval; up to 20): each customer is emailed " +
        "that they're booked. Nothing is approved until the user confirms. find_bookings with status pending_approval lists them."
    override val schema = obj("bookingIds" to array(string("Booking id"), "The requests to approve (1 to 20)"))

    override fun propose(ctx: ToolContext, input: BookingIdsInput): Proposal = ctx.read { conn ->
        val bookings = ctx.bookingsFor(conn, input.bookingIds)
        bookings.forEach { b ->
            BookingSupport.requireBlockingStatus(b, setOf(BookingStatus.PENDING_APPROVAL), "approved")
            if (!b.start.isAfter(ctx.now)) throw Errors.policy("${b.reference}'s time has passed, so it can't be approved. Decline it.")
        }
        val n = ctx.bookings(bookings.size)
        Proposal(
            title = "Approve $n",
            summary = if (bookings.size == 1) "Approve ${bookingLine(bookings.single(), ctx)}" else "Approve $n",
            items = bookings.map { ProposalItem(bookingLine(it, ctx), null) },
            changes = listOf(ProposalChange("${ctx.customerLabel} email", null, "Yes: they're told they're booked")),
            confirmLabel = "Approve",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: BookingIdsInput): ActionResult {
        // In id order, so two approvals of overlapping requests can't deadlock.
        val approved = input.bookingIds.distinct().map { parseUuid(it, "bookingIds") }.sorted()
            .map { ctx.staff.approve(run.conn, ctx.access, it, run.actor, ctx.now) }
        return ActionResult("Approved ${approved.joinToString(", ") { it.reference }}.", listOf(ctx.calendarLink(approved.first())))
    }
}

@Serializable
data class DeclineInput(val bookingId: String, val reason: String?)

object DeclineBooking : WriteTool<DeclineInput> {
    override val name = "decline_booking"
    override val label = "Preparing a decline"
    override val minRole = Role.STAFF
    override val input = serializer<DeclineInput>()
    override val changeKind = AgentChangeKind.CANCELLATIONS
    override val description = "Proposes declining a booking request (status pending_approval): the customer is emailed, with the " +
        "reason if given, and anything paid is refunded in full. Nothing happens until the user confirms."
    override val schema = obj(
        "bookingId" to string("Booking id"),
        "reason" to nullable(string("Reason shown to the customer, or null")),
    )

    override fun propose(ctx: ToolContext, input: DeclineInput): Proposal = ctx.read { conn ->
        val b = visibleBooking(ctx, conn, input.bookingId)
        BookingSupport.requireBlockingStatus(b, setOf(BookingStatus.PENDING_APPROVAL), "declined")
        val paid = b.amountPaidOnlineCents - b.amountRefundedCents
        Proposal(
            title = "Decline request",
            summary = "Decline ${bookingLine(b, ctx)}",
            items = listOf(ProposalItem(bookingLine(b, ctx), if (paid > 0) "Refund ${ToolViews.money(paid, b.currency)}" else null)),
            changes = listOfNotNull(input.reason?.takeIf { it.isNotBlank() }?.let { ProposalChange("Reason", null, it.trim().take(500)) }),
            warnings = listOf("The customer is told the request was declined; they would need to book again."),
            confirmLabel = "Decline",
            destructive = true,
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: DeclineInput): ActionResult {
        val b = ctx.staff.decline(run.conn, ctx.access, parseUuid(input.bookingId, "bookingId"), input.reason, run.actor, ctx.now)
        return ActionResult("Declined ${b.reference}.")
    }
}

@Serializable
enum class Outcome(val status: BookingStatus) {
    @SerialName("completed") COMPLETED(BookingStatus.COMPLETED),
    @SerialName("no_show") NO_SHOW(BookingStatus.NO_SHOW),
}

@Serializable
data class OutcomeInput(val bookingIds: List<String>, val outcome: Outcome)

object SetBookingOutcome : WriteTool<OutcomeInput> {
    override val name = "set_booking_outcome"
    override val label = "Preparing an outcome"
    override val minRole = Role.STAFF
    override val input = serializer<OutcomeInput>()
    override val changeKind = AgentChangeKind.BOOKINGS

    override fun count(input: OutcomeInput) = input.bookingIds.distinct().size
    override val description = "Proposes recording how bookings that have started went (up to 20): completed or no_show. " +
        "Nothing changes until the user confirms."
    override val schema = obj(
        "bookingIds" to array(string("Booking id"), "Bookings that have started (1 to 20)"),
        "outcome" to enum(listOf("completed", "no_show"), "What happened"),
    )

    override fun propose(ctx: ToolContext, input: OutcomeInput): Proposal = ctx.read { conn ->
        val status = input.outcome.status
        val bookings = ctx.bookingsFor(conn, input.bookingIds)
        bookings.forEach { b ->
            BookingSupport.requireBlockingStatus(
                b, setOf(BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW), "marked ${status.wire}",
            )
            if (b.start.isAfter(ctx.now)) throw Errors.policy("${b.reference} hasn't started yet, so it can't be marked ${status.label}.")
        }
        val n = ctx.bookings(bookings.size)
        Proposal(
            title = "Mark $n ${status.label}",
            summary = if (bookings.size == 1) "Mark ${bookingLine(bookings.single(), ctx)} ${status.label}" else "Mark $n ${status.label}",
            items = bookings.map { ProposalItem(bookingLine(it, ctx), "Now: ${it.status.label}") },
            confirmLabel = "Mark ${status.label}",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: OutcomeInput): ActionResult {
        val status = input.outcome.status
        val marked = input.bookingIds.distinct().map { parseUuid(it, "bookingIds") }.sorted()
            .map { ctx.staff.setOutcome(run.conn, ctx.access, it, status, run.actor, ctx.now) }
        return ActionResult("Marked ${marked.joinToString(", ") { it.reference }} ${status.label}.")
    }
}

object MarkPaidInPerson : WriteTool<BookingIdInput> {
    override val name = "mark_paid_in_person"
    override val label = "Preparing a payment record"
    override val minRole = Role.STAFF
    override val input = serializer<BookingIdInput>()
    override val changeKind = AgentChangeKind.BOOKINGS
    override val description = "Proposes recording that what's still due on a booking was paid at the venue (cash or card " +
        "terminal). Nothing is recorded until the user confirms."
    override val schema = obj("bookingId" to string("Booking id"))

    override fun propose(ctx: ToolContext, input: BookingIdInput): Proposal = ctx.read { conn ->
        val b = visibleBooking(ctx, conn, input.bookingId)
        BookingSupport.requireBlockingStatus(b, setOf(BookingStatus.CONFIRMED, BookingStatus.COMPLETED), "marked as paid")
        val due = b.priceCents - b.amountPaidCents
        if (b.paymentStatus !in PAYABLE_IN_PERSON || due <= 0) throw Errors.policy("Nothing is due at the venue for ${b.reference}.")
        Proposal(
            title = "Record payment at the venue",
            summary = "${ToolViews.money(due, b.currency)} paid in person for ${b.reference}",
            items = listOf(ProposalItem(bookingLine(b, ctx), null)),
            changes = listOf(ProposalChange("Paid at the venue", null, ToolViews.money(due, b.currency))),
            confirmLabel = "Record payment",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: BookingIdInput): ActionResult {
        val b = ctx.staff.markPaidInPerson(run.conn, ctx.access, parseUuid(input.bookingId, "bookingId"), run.actor, ctx.now)
        return ActionResult("Recorded payment at the venue for ${b.reference}.")
    }
}

@Serializable
data class NotesInput(val bookingId: String, val internalNotes: String?)

object UpdateBookingNotes : WriteTool<NotesInput> {
    override val name = "update_booking_notes"
    override val label = "Preparing a note"
    override val minRole = Role.STAFF
    override val input = serializer<NotesInput>()
    override val changeKind = AgentChangeKind.RECORDS
    override val description = "Proposes replacing a booking's internal notes (seen by the team only, never the customer); null " +
        "clears them. To add to the notes, include the existing text (get_booking shows it). Nothing changes until the user confirms."
    override val schema = obj(
        "bookingId" to string("Booking id"),
        "internalNotes" to nullable(string("The new internal notes (up to 2000 characters), or null to clear them")),
    )

    override fun propose(ctx: ToolContext, input: NotesInput): Proposal = ctx.read { conn ->
        val b = visibleBooking(ctx, conn, input.bookingId)
        val notes = input.internalNotes?.trim()?.ifEmpty { null }
        if ((notes?.length ?: 0) > MAX_NOTES) throw Errors.field("internalNotes", "Keep it under $MAX_NOTES characters")
        Proposal(
            title = "Update notes",
            summary = "Internal notes on ${b.reference}",
            items = listOf(ProposalItem(bookingLine(b, ctx), null)),
            changes = listOf(ProposalChange("Internal notes", ToolViews.clip(b.internalNotes), ToolViews.clip(notes))),
            confirmLabel = "Save notes",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: NotesInput): ActionResult {
        val patch = Patch(JsonObject(mapOf("internalNotes" to JsonPrimitive(input.internalNotes?.trim()?.ifEmpty { null }))))
        val b = ctx.staff.update(run.conn, ctx.access, parseUuid(input.bookingId, "bookingId"), patch, run.actor, ctx.now)
        return ActionResult("Updated the notes on ${b.reference}.")
    }
}

private const val MAX_NOTES = 2000

/** As `BookingLifecycle.markPaidInPerson`: what can still be paid at the venue. */
private val PAYABLE_IN_PERSON = setOf(PaymentStatus.PAY_AT_VENUE, PaymentStatus.PAID)
