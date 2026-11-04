package ie.bookanything.booking

import ie.bookanything.business.BusinessRow
import ie.bookanything.http.formatInstant
import ie.bookanything.http.formatInstantOrNull
import ie.bookanything.payments.CancelActor
import ie.bookanything.payments.RefundPolicy
import java.time.Duration
import java.time.Instant

/** Customer-facing projections of a booking and the self-service policy checks. */
object BookingViews {

    fun canCancel(b: BookingRow, business: BusinessRow, now: Instant): Boolean =
        business.policies.allowCustomerCancel && b.status.isBlocking && b.start.isAfter(now)

    /** Customers may move a booking until the cancellation notice window starts (not once the business is suspended). */
    fun canReschedule(b: BookingRow, business: BusinessRow, now: Instant): Boolean =
        business.policies.allowCustomerReschedule && !business.isSuspended && b.serviceActive && b.status in BookingStatus.MOVABLE &&
            !now.plus(Duration.ofHours(business.policies.cancellationNoticeHours.toLong())).isAfter(b.start)

    fun refundPreview(b: BookingRow, business: BusinessRow, now: Instant): RefundPreview? {
        if (b.amountPaidOnlineCents - b.amountRefundedCents <= 0 || !canCancel(b, business, now)) return null
        val d = RefundPolicy.decide(
            CancelActor.CUSTOMER, now, b.start, business.policies.cancellationNoticeHours,
            business.policies.lateCancellationRefundPercent, b.amountPaidOnlineCents, b.amountRefundedCents,
        )
        return RefundPreview(d.amountCents, d.reason)
    }

    fun businessRef(business: BusinessRow) = BookingBusinessRef(
        business.id.toString(), business.slug, business.name, business.branding, business.contactEmail, business.contactPhone,
        business.address,
    )

    fun customerView(b: BookingRow, business: BusinessRow, now: Instant): CustomerBookingDto {
        val zone = business.zone
        return CustomerBookingDto(
            id = b.id.toString(), reference = b.reference, status = b.status, paymentStatus = b.paymentStatus,
            start = formatInstant(b.start, zone), end = formatInstant(b.end, zone), timezone = zone.id,
            business = businessRef(business), service = IdName(b.serviceId.toString(), b.serviceName),
            option = b.optionRef, addons = b.addons.map { IdName(it.id, it.name) },
            resources = b.resources.map { ResourceRef(it.id, it.name, it.kind) },
            priceCents = b.priceCents, depositCents = b.depositCents, amountPaidCents = b.amountPaidCents,
            amountPaidInPersonCents = b.amountPaidInPersonCents, amountRefundedCents = b.amountRefundedCents, currency = b.currency,
            holdExpiresAt = formatInstantOrNull(if (b.status == BookingStatus.HELD) b.holdExpiresAt else null, zone),
            canCancel = canCancel(b, business, now), canReschedule = canReschedule(b, business, now),
            refundPreview = refundPreview(b, business, now),
            originalPriceCents = b.originalPriceCents, offer = b.offer,
        )
    }

    /**
     * The customer as the manage link shows them. Anyone can book with someone else's email, which attaches the booking
     * to that customer's record (keeping their name and phone), and the booker gets the manage link: so a booking the
     * customer made (page or MCP) shows the stored name and phone only when made by the account linked to the record.
     * Bookings the business made were sent to the customer's own address.
     */
    fun contact(b: BookingRow): ContactRef {
        val c = b.customer
        val bookerIsCustomer = !b.source.byCustomer || (b.createdByUserId != null && b.createdByUserId == c.userId)
        return if (bookerIsCustomer) ContactRef(c.name, c.email, c.phone) else ContactRef(null, c.email, null)
    }

    fun managedView(b: BookingRow, business: BusinessRow, now: Instant): ManagedBookingDto {
        val c = customerView(b, business, now)
        return ManagedBookingDto(
            c.id, c.reference, c.status, c.paymentStatus, c.start, c.end, c.timezone, c.business, c.service, c.option, c.addons,
            c.resources, c.priceCents, c.depositCents, c.amountPaidCents, c.amountPaidInPersonCents, c.amountRefundedCents, c.currency,
            c.holdExpiresAt, c.canCancel, c.canReschedule, c.refundPreview, contact(b),
            c.originalPriceCents, c.offer,
        )
    }
}
