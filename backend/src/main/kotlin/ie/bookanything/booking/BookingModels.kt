package ie.bookanything.booking

import ie.bookanything.audit.ActorType
import ie.bookanything.business.Address
import ie.bookanything.business.Branding
import ie.bookanything.offers.BookingOfferDto
import ie.bookanything.payments.CancelActor
import ie.bookanything.payments.PaymentDto
import ie.bookanything.payments.PaymentStatus
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.util.UUID

// ---------- Requests ----------

@Serializable
data class PublicCustomerInput(val name: String, val email: String, val phone: String? = null)

@Serializable
data class CreatePublicBooking(
    val serviceId: String,
    val optionId: String? = null,
    val addonIds: List<String> = emptyList(),
    val groupId: String? = null,
    val resourceId: String? = null,
    val start: String,
    val customer: PublicCustomerInput,
    val answers: Map<String, String> = emptyMap(),
    val customerNotes: String? = null,
    val returnUrl: String? = null,
    /** `online` (the default: as the service says) or `at_venue`, for a service that lets the customer pay at the venue. */
    val payment: String? = null,
    /**
     * The total the customer was shown, in minor units (with the time's deal, if it had one). When given and the booking
     * would cost something else now (a capped deal ran out, the price was changed), it is refused with 409
     * PRICE_CHANGED and nothing is booked.
     */
    val expectedTotalCents: Int? = null,
)

@Serializable
data class StaffCustomerInput(
    val name: String,
    val email: String? = null,
    val phone: String? = null,
    val notes: String? = null,
    val groupId: String? = null,
)

@Serializable
data class CreateStaffBooking(
    val serviceId: String,
    val optionId: String? = null,
    val addonIds: List<String> = emptyList(),
    val groupId: String? = null,
    val resourceIds: List<String>? = null,
    val start: String,
    val customerId: String? = null,
    val customer: StaffCustomerInput? = null,
    val answers: Map<String, String> = emptyMap(),
    val internalNotes: String? = null,
    val paymentMode: String = "at_venue",
    val notifyCustomer: Boolean = true,
)

@Serializable
data class ReasonInput(val reason: String? = null)

@Serializable
data class CheckoutUrlResponse(val checkoutUrl: String)

@Serializable
data class PaymentLinkSent(val checkoutUrl: String, val sentTo: String)

@Serializable
data class CustomerRescheduleInput(val start: String, val resourceId: String? = null)

@Serializable
data class StaffCancelInput(val reason: String? = null, val refund: String = "policy", val notifyCustomer: Boolean = true)

@Serializable
data class StaffRescheduleInput(val start: String, val resourceIds: List<String>? = null, val notifyCustomer: Boolean = true)

@Serializable
data class StatusInput(val status: String)

// ---------- Responses ----------

@Serializable
data class IdName(val id: String, val name: String)

@Serializable
data class ResourceRef(val id: String, val name: String, val kind: String)

@Serializable
data class RefundPreview(val amountCents: Int, val reason: String)

@Serializable
data class BookingBusinessRef(
    val id: String,
    val slug: String,
    val name: String,
    val branding: Branding,
    val contactEmail: String?,
    val contactPhone: String?,
    val address: Address,
)

@Serializable
data class CustomerBookingDto(
    val id: String,
    val reference: String,
    val status: BookingStatus,
    val paymentStatus: PaymentStatus,
    val start: String,
    val end: String,
    val timezone: String,
    val business: BookingBusinessRef,
    val service: IdName,
    val option: IdName?,
    val addons: List<IdName>,
    val resources: List<ResourceRef>,
    val priceCents: Int,
    val depositCents: Int?,
    val amountPaidCents: Int,
    /** The part of [amountPaidCents] taken in person, which an online refund can't return. */
    val amountPaidInPersonCents: Int,
    val amountRefundedCents: Int,
    val currency: String,
    val holdExpiresAt: String?,
    val canCancel: Boolean,
    val canReschedule: Boolean,
    val refundPreview: RefundPreview?,
    /** Price before the applied offer (null when none applied); `priceCents` is what the customer owes. */
    val originalPriceCents: Int? = null,
    val offer: BookingOfferDto? = null,
)

/** Who a managed booking is for; [name] and [phone] are null when the manage link's holder may not see them. */
@Serializable
data class ContactRef(val name: String?, val email: String?, val phone: String?)

@Serializable
data class ManagedBookingDto(
    val id: String,
    val reference: String,
    val status: BookingStatus,
    val paymentStatus: PaymentStatus,
    val start: String,
    val end: String,
    val timezone: String,
    val business: BookingBusinessRef,
    val service: IdName,
    val option: IdName?,
    val addons: List<IdName>,
    val resources: List<ResourceRef>,
    val priceCents: Int,
    val depositCents: Int?,
    val amountPaidCents: Int,
    val amountPaidInPersonCents: Int,
    val amountRefundedCents: Int,
    val currency: String,
    val holdExpiresAt: String?,
    val canCancel: Boolean,
    val canReschedule: Boolean,
    val refundPreview: RefundPreview?,
    val customer: ContactRef,
    val originalPriceCents: Int? = null,
    val offer: BookingOfferDto? = null,
)

@Serializable
data class NextStep(val type: String, val checkoutUrl: String?)

@Serializable
data class BookingResult(val booking: CustomerBookingDto, val manageToken: String, val next: NextStep)

@Serializable
data class BookingCustomerRef(val id: String, val name: String, val email: String?, val phone: String?, val groupId: String?)

@Serializable
data class ServiceRef(val id: String, val name: String, val color: String)

@Serializable
data class AddonRef(val id: String, val name: String, val extraMinutes: Int, val priceCents: Int)

@Serializable
data class AllocatedResourceRef(val id: String, val name: String, val kind: String, val requirementId: String?)

@Serializable
data class AnswerDto(val questionId: String, val label: String, val value: String, val sensitive: Boolean)

@Serializable
data class BookingDto(
    val id: String,
    val reference: String,
    val status: BookingStatus,
    val paymentStatus: PaymentStatus,
    val source: String,
    val start: String,
    val end: String,
    val bufferBeforeMinutes: Int,
    val bufferAfterMinutes: Int,
    val customer: BookingCustomerRef,
    val service: ServiceRef,
    val option: IdName?,
    val addons: List<AddonRef>,
    val resources: List<AllocatedResourceRef>,
    val groupId: String?,
    val answers: List<AnswerDto>,
    val customerNotes: String?,
    val internalNotes: String?,
    val priceCents: Int,
    val depositCents: Int?,
    val amountPaidCents: Int,
    /** The part of [amountPaidCents] taken in person, which an online refund can't return. */
    val amountPaidInPersonCents: Int,
    val amountRefundedCents: Int,
    val currency: String,
    val holdExpiresAt: String?,
    val cancelledAt: String?,
    val cancelledBy: CancelActor?,
    val cancellationReason: String?,
    val createdAt: String,
    val updatedAt: String,
    val originalPriceCents: Int? = null,
    val offer: BookingOfferDto? = null,
)

@Serializable
data class AuditEventDto(
    val id: String,
    val actorType: ActorType,
    val actorName: String?,
    val action: String,
    val entityType: String,
    val entityId: String,
    val summary: JsonObject,
    val occurredAt: String,
)

@Serializable
data class BookingDetailDto(
    val id: String,
    val reference: String,
    val status: BookingStatus,
    val paymentStatus: PaymentStatus,
    val source: String,
    val start: String,
    val end: String,
    val bufferBeforeMinutes: Int,
    val bufferAfterMinutes: Int,
    val customer: BookingCustomerRef,
    val service: ServiceRef,
    val option: IdName?,
    val addons: List<AddonRef>,
    val resources: List<AllocatedResourceRef>,
    val groupId: String?,
    val answers: List<AnswerDto>,
    val customerNotes: String?,
    val internalNotes: String?,
    val priceCents: Int,
    val depositCents: Int?,
    val amountPaidCents: Int,
    val amountPaidInPersonCents: Int,
    val amountRefundedCents: Int,
    val currency: String,
    val holdExpiresAt: String?,
    val cancelledAt: String?,
    val cancelledBy: CancelActor?,
    val cancellationReason: String?,
    val createdAt: String,
    val updatedAt: String,
    val payments: List<PaymentDto>,
    val history: List<AuditEventDto>,
    /** Checkout link while the booking is held for online payment (hold not yet expired), else null. */
    val checkoutUrl: String?,
    val originalPriceCents: Int? = null,
    val offer: BookingOfferDto? = null,
)

// ---------- Internal row ----------

@Serializable
data class AddonSnapshot(val id: String, val name: String, val extraMinutes: Int, val priceCents: Int)

data class BookingCustomer(val id: UUID, val name: String, val email: String?, val phone: String?, val groupId: UUID?, val userId: UUID?)

data class BookingRow(
    val id: UUID,
    val businessId: UUID,
    val reference: String,
    val customer: BookingCustomer,
    val serviceId: UUID,
    val serviceName: String,
    val serviceColor: String,
    val serviceActive: Boolean,
    val bufferBeforeMinutes: Int,
    val bufferAfterMinutes: Int,
    val optionId: UUID?,
    val optionName: String?,
    val addons: List<AddonSnapshot>,
    val groupId: UUID?,
    val start: Instant,
    val end: Instant,
    val status: BookingStatus,
    val holdExpiresAt: Instant?,
    val priceCents: Int,
    val depositCents: Int?,
    val currency: String,
    val amountPaidCents: Int,
    val amountRefundedCents: Int,
    val paymentStatus: PaymentStatus,
    val answers: List<AnswerDto>,
    val customerNotes: String?,
    val internalNotes: String?,
    val source: BookingSource,
    val idempotencyKey: String?,
    val cancelledAt: Instant?,
    val cancelledBy: CancelActor?,
    val cancellationReason: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val resources: List<AllocatedResourceRef>,
    /** The applied offer (price snapshot); [offerId] becomes null if the offer is deleted later, the snapshot stays. */
    val offerId: UUID? = null,
    val originalPriceCents: Int? = null,
    val offer: BookingOfferDto? = null,
    /** The part of [amountPaidCents] paid in person (recorded by staff), which online refunds can't return. */
    val amountPaidInPersonCents: Int = 0,
    /** The signed-in user who made the booking (a member, or a customer), if any. */
    val createdByUserId: UUID? = null,
) {
    /** What was charged online: all an online refund can return. */
    val amountPaidOnlineCents: Int get() = amountPaidCents - amountPaidInPersonCents
    val durationMinutes: Int get() = java.time.Duration.between(start, end).toMinutes().toInt()
    val resourceIds: List<UUID> get() = resources.map { UUID.fromString(it.id) }

    /** What online payment takes for this booking: its deposit, else its price ([BookingQuote.dueOnline] when it was made). */
    val onlineAmountCents: Int get() = depositCents ?: priceCents
    val isBlocking: Boolean get() = status.isBlocking

    /** The option as booked: its id while it exists, else just the name kept on the booking. */
    val optionRef: IdName? get() = when {
        optionId != null -> IdName(optionId.toString(), optionName.orEmpty())
        optionName != null -> IdName("", optionName)
        else -> null
    }
}
