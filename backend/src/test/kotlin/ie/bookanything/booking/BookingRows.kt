package ie.bookanything.booking

import ie.bookanything.payments.PaymentStatus
import java.time.Instant
import java.util.UUID

/** A booking row for pure rule tests: only what a test overrides matters. */
internal fun bookingRow(
    resourceIds: List<UUID> = emptyList(),
    status: BookingStatus = BookingStatus.CONFIRMED,
    priceCents: Int = 5000,
    depositCents: Int? = null,
    amountPaidCents: Int = 0,
    start: Instant = Instant.parse("2026-10-10T10:00:00Z"),
): BookingRow = BookingRow(
    id = UUID.randomUUID(), businessId = UUID.randomUUID(), reference = "BA-TEST01",
    customer = BookingCustomer(UUID.randomUUID(), "Jordan Casey", "jordan@example.test", null, null, null),
    serviceId = UUID.randomUUID(), serviceName = "Consult", serviceColor = "#000000", serviceActive = true,
    bufferBeforeMinutes = 0, bufferAfterMinutes = 0, optionId = null, optionName = null, addons = emptyList(), groupId = null,
    start = start, end = start.plusSeconds(3600), status = status, holdExpiresAt = null, priceCents = priceCents,
    depositCents = depositCents, currency = "EUR", amountPaidCents = amountPaidCents, amountRefundedCents = 0,
    paymentStatus = PaymentStatus.NOT_REQUIRED, answers = emptyList(), customerNotes = null, internalNotes = null,
    source = BookingSource.DASHBOARD, idempotencyKey = null, cancelledAt = null, cancelledBy = null, cancellationReason = null,
    createdAt = start, updatedAt = start, resources = resourceIds.map { AllocatedResourceRef(it.toString(), "Resource", "staff", null) },
)
