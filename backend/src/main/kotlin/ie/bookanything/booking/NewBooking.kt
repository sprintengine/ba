package ie.bookanything.booking

import ie.bookanything.offers.BookingOfferDto
import ie.bookanything.payments.PaymentStatus
import java.time.Instant
import java.util.UUID

/** A booking about to be inserted: everything [BookingEngine.create] decided, as stored. */
data class NewBooking(
    val id: UUID,
    val businessId: UUID,
    val reference: String,
    val customerId: UUID,
    val serviceId: UUID,
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
    val paymentStatus: PaymentStatus,
    val answers: List<AnswerDto>,
    val customerNotes: String?,
    val internalNotes: String?,
    val source: BookingSource,
    val manageTokenHash: String,
    val idempotencyKey: String?,
    val createdByUserId: UUID?,
    val createdAt: Instant,
    /** The applied offer: its id, the price before it and the snapshot shown on the booking. */
    val offerId: UUID?,
    val originalPriceCents: Int?,
    val offer: BookingOfferDto?,
    /** Set when no reminder should follow ([NewBookingRules.reminderSentAt]). */
    val reminderSentAt: Instant? = null,
)
