package ie.bookanything.booking

import ie.bookanything.audit.Actor
import ie.bookanything.auth.CurrentUser
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.availability.AvailabilityRequest
import ie.bookanything.business.BusinessRow
import ie.bookanything.payments.CancelActor
import ie.bookanything.payments.CheckoutRequest
import ie.bookanything.payments.RefundOverride
import ie.bookanything.services.ServiceDef
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// The requests the booking engine and lifecycle take.

enum class PaymentChoice { AUTO, ONLINE, AT_VENUE, NONE }

data class CustomerSpec(
    val existingId: UUID? = null,
    val name: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val notes: String? = null,
    val groupId: UUID? = null,
)

data class CreateCommand(
    val serviceId: UUID,
    val optionId: UUID?,
    val addonIds: List<UUID>,
    val groupId: UUID?,
    val selectedResourceId: UUID?,
    val forcedResourceIds: List<UUID>?,
    val start: Instant,
    val customer: CustomerSpec,
    val answers: Map<String, String>,
    val customerNotes: String?,
    val internalNotes: String?,
    val source: BookingSource,
    val mode: AvailabilityMode,
    val payment: PaymentChoice,
    val notifyCustomer: Boolean,
    val idempotencyKey: String?,
    val actor: Actor,
    val user: CurrentUser?,
    val returnUrl: String?,
    /**
     * [forcedResourceIds] is a staff member's whole calendar (they named no resources): the engine narrows it to the
     * resources the service can use ([StaffScope.usableFor]) and refuses only when none is left.
     */
    val forcedIsWholeCalendar: Boolean = false,
    /**
     * The total the customer was shown (the deal price when the time had one). When the booking would cost anything
     * else, it is refused with PRICE_CHANGED instead of being made at a price they didn't agree to.
     */
    val expectedPriceCents: Int? = null,
)

/**
 * A created (or replayed) booking. A new held booking comes with its [pending] checkout, which the provider creates once
 * the booking has committed ([BookingEngine.completeCheckout]); a replay [awaitingCheckout] is one whose first request
 * is still waiting for the provider.
 */
data class CreateOutcome(
    val booking: BookingRow,
    val replayed: Boolean,
    val checkoutUrl: String?,
    val next: String,
    val pending: PendingCheckout? = null,
    val awaitingCheckout: Boolean = false,
)

/** The checkout of a new held booking, created at the provider after the commit; [notifications] are sent once it exists. */
data class PendingCheckout(val request: CheckoutRequest, val notifications: List<String>)

/** Moving a booking to [start] under [mode]'s rules: the customer's choice of resource, or staff's chosen resources. */
data class Reschedule(
    val bookingId: UUID,
    val start: Instant,
    val mode: AvailabilityMode,
    val actor: Actor,
    val notifyCustomer: Boolean,
    val selectedResourceId: UUID? = null,
    val forcedResourceIds: List<UUID>? = null,
) {
    companion object {
        /** A customer moving their own booking (notice window, offer schedule); always emailed. */
        fun byCustomer(bookingId: UUID, start: Instant, resourceId: UUID?, actor: Actor) =
            Reschedule(bookingId, start, AvailabilityMode.PUBLIC, actor, notifyCustomer = true, selectedResourceId = resourceId)

        /** The business moving a booking, optionally onto [resourceIds]. */
        fun byStaff(bookingId: UUID, start: Instant, resourceIds: List<UUID>?, actor: Actor, notifyCustomer: Boolean) =
            Reschedule(bookingId, start, AvailabilityMode.STAFF, actor, notifyCustomer, forcedResourceIds = resourceIds)
    }
}

/**
 * A cancellation: whose side cancels ([by], which decides the refund policy), who is audited, why, the staff refund
 * choice and whether the customer is emailed.
 */
data class Cancellation(
    val by: CancelActor,
    val actor: Actor,
    val reason: String?,
    val refund: RefundOverride = RefundOverride.POLICY,
    val notifyCustomer: Boolean = true,
) {
    companion object {
        /** A customer cancelling their own booking: refund per policy, confirmation email. */
        fun byCustomer(actor: Actor, reason: String?) = Cancellation(CancelActor.CUSTOMER, actor, reason)

        /** The business (a member, or Bo for one) cancelling: [refund] as chosen, the reason trimmed like a customer's. */
        fun byBusiness(actor: Actor, reason: String?, refund: RefundOverride, notifyCustomer: Boolean) =
            Cancellation(CancelActor.BUSINESS, actor, trimReason(reason), refund, notifyCustomer)
    }
}

/** One exact start to check for a booking: what is booked, under which rules and on which resources ([BookingEngine.findSlot]). */
data class SlotCheck(
    val service: ServiceDef,
    val start: Instant,
    val mode: AvailabilityMode,
    val optionId: UUID? = null,
    val addonIds: List<UUID> = emptyList(),
    val groupId: UUID? = null,
    val selectedResourceId: UUID? = null,
    val forcedResourceIds: List<UUID>? = null,
    /** A booking moved by its customer keeps who it is with ([AvailabilityRequest.keptResourceId]). */
    val keptResourceId: UUID? = null,
    /** A booking being moved: its own allocations don't count as busy. */
    val excludeBookingId: UUID? = null,
    /** A booking being moved keeps its duration. */
    val fixedDurationMinutes: Int? = null,
) {
    /** The availability request for [start]'s day in the business timezone, evaluating only [start]. */
    fun toRequest(business: BusinessRow): AvailabilityRequest {
        val date = LocalDate.ofInstant(start, business.zone)
        return AvailabilityRequest(
            business = business, service = service, optionId = optionId, addonIds = addonIds, groupId = groupId,
            selectedResourceId = selectedResourceId, keptResourceId = keptResourceId, forcedResourceIds = forcedResourceIds, from = date,
            to = date, mode = mode, excludeBookingId = excludeBookingId, fixedDurationMinutes = fixedDurationMinutes, onlyStart = start,
        )
    }

    companion object {
        /**
         * Moving [booking] (of [service]) to [start]: its customer group and duration, its own allocations ignored; under
         * the customer rules ([AvailabilityMode.PUBLIC]) it stays with whoever the customer chose ([keptChoice]).
         */
        fun move(
            booking: BookingRow, service: ServiceDef, start: Instant, mode: AvailabilityMode, selectedResourceId: UUID? = null,
            forcedResourceIds: List<UUID>? = null,
        ) = SlotCheck(
            service, start, mode, groupId = booking.groupId, selectedResourceId = selectedResourceId,
            forcedResourceIds = forcedResourceIds, keptResourceId = keptChoice(booking, service, mode), excludeBookingId = booking.id,
            fixedDurationMinutes = booking.durationMinutes,
        )

        /**
         * What a customer moving [booking] keeps when they don't choose again: the resource it has for [service]'s
         * customer-selectable requirement ("With: Sam"). Null for staff moves, which choose resources themselves.
         */
        fun keptChoice(booking: BookingRow, service: ServiceDef, mode: AvailabilityMode): UUID? {
            if (mode != AvailabilityMode.PUBLIC) return null
            val selectable = service.selectableRequirement ?: return null
            return booking.resources.firstOrNull { it.requirementId == selectable.id.toString() }?.let { UUID.fromString(it.id) }
        }
    }
}
