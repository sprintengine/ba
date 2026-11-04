package ie.bookanything.mcp.customer

import ie.bookanything.assistant.tools.ProposalChange
import ie.bookanything.booking.BookingStatus
import ie.bookanything.booking.CustomerBookingDto
import ie.bookanything.booking.RefundPreview
import ie.bookanything.mcp.business.OutcomeLink
import ie.bookanything.offers.BookingOfferDto
import ie.bookanything.payments.PaymentStatus
import kotlinx.serialization.Serializable

// ---------- Arguments (decoded strictly) ----------

@Serializable
data class BookArgs(
    val slug: String,
    val serviceId: String,
    val start: String,
    val optionId: String? = null,
    val addonIds: List<String> = emptyList(),
    val resourceId: String? = null,
    val answers: Map<String, String> = emptyMap(),
    val notes: String? = null,
    val phone: String? = null,
    /** `online` (the default: as the service says) or `at_venue`, for a service with `allowPayAtVenue`. */
    val payment: String? = null,
)

@Serializable
data class ListMyBookingsArgs(val status: String = "upcoming", val limit: Int = 10)

@Serializable
data class RescheduleArgs(val bookingId: String, val start: String, val resourceId: String? = null)

@Serializable
data class CancelArgs(val bookingId: String, val reason: String? = null)

@Serializable
data class BookingIdArgs(val bookingId: String)

@Serializable
data class MoveTimesArgs(
    val bookingId: String,
    val from: String,
    val to: String? = null,
    val resourceId: String? = null,
    val after: String? = null,
)

@Serializable
data class PaymentLinkResult(val booking: McpBooking, val paymentUrl: String, val message: String)

@Serializable
class NoArgs

// ---------- Results ----------

@Serializable
data class NamedRef(val name: String, val slug: String)

/** A booking as the assistant sees it: concise, times in the business timezone, money in cents. */
@Serializable
data class McpBooking(
    val id: String,
    val reference: String,
    val status: BookingStatus,
    val paymentStatus: PaymentStatus,
    val business: NamedRef,
    val service: String,
    val option: String?,
    val start: String,
    val end: String,
    val timezone: String,
    val priceCents: Int,
    val originalPriceCents: Int?,
    val offer: BookingOfferDto?,
    val currency: String,
    val amountPaidCents: Int,
    val canCancel: Boolean,
    val canReschedule: Boolean,
    /** What cancelling now would refund (null when nothing was paid). */
    val refundIfCancelledNow: RefundPreview?,
) {
    companion object {
        fun of(b: CustomerBookingDto) = McpBooking(
            b.id, b.reference, b.status, b.paymentStatus, NamedRef(b.business.name, b.business.slug), b.service.name, b.option?.name,
            b.start, b.end, b.timezone, b.priceCents, b.originalPriceCents, b.offer, b.currency, b.amountPaidCents, b.canCancel,
            b.canReschedule, b.refundPreview,
        )
    }
}

@Serializable
data class BookResult(
    val booking: McpBooking,
    /** confirmed | pending_approval | payment_required; expired | cancelled when retrying a request whose booking is over */
    val next: String,
    /** For paid services: the page where the customer pays (never pay on their behalf). */
    val paymentUrl: String?,
    val holdExpiresAt: String?,
    val myBookingsUrl: String,
    val message: String,
)

@Serializable
data class BookingListResult(val bookings: List<McpBooking>, val myBookingsUrl: String)

@Serializable
data class NextAppointmentResult(val booking: McpBooking?, val message: String)

@Serializable
data class CancelPreviewResult(
    val booking: McpBooking,
    val cancelled: Boolean,
    val refundCents: Int?,
    val refundReason: String?,
    val message: String,
)

@Serializable
data class ProposalIdArgs(val proposalId: String)

/** What book, reschedule_booking and cancel_booking return: a request, not yet carried out. */
@Serializable
data class CustomerProposalResult(
    val proposalId: String,
    /** awaiting_approval (the user approves it on bookanything at [approvalUrl]) | awaiting_confirmation (confirm_action) */
    val status: String,
    val title: String,
    val summary: String,
    val changes: List<ProposalChange>,
    val warnings: List<String>,
    /** Cancels (and refunds per policy). */
    val destructive: Boolean,
    val expiresAt: String,
    val approvalUrl: String?,
    val next: String,
)

/** Where a request stands: and once carried out, what happened and the booking as it is now. */
@Serializable
data class CustomerProposalOutcome(
    val proposalId: String,
    /** confirmed | failed | rejected | expired | awaiting_approval | awaiting_confirmation */
    val status: String,
    val title: String,
    val message: String?,
    val approvalUrl: String?,
    /** e.g. the payment page of a booking that is held until paid. */
    val links: List<OutcomeLink>,
    val booking: McpBooking?,
)
