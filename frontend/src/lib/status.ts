/**
 * Human labels and colour tones for booking and payment statuses. Use
 * <BookingStatusBadge>/<PaymentStatusBadge> in UI; use these maps for filters,
 * selects and copy.
 */
import type { BookingStatus, PaymentStatus } from "@/lib/api/types";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

type StatusMeta = { label: string; tone: Tone; description: string };

export const BOOKING_STATUS: Record<BookingStatus, StatusMeta> = {
  held: { label: "Awaiting payment", tone: "warning", description: "Slot is held while the customer pays." },
  pending_approval: {
    label: "Needs approval",
    tone: "info",
    description: "Waiting for the business to approve.",
  },
  confirmed: { label: "Confirmed", tone: "success", description: "Booked and confirmed." },
  completed: { label: "Completed", tone: "neutral", description: "The appointment took place." },
  cancelled: { label: "Cancelled", tone: "danger", description: "Cancelled; the slot was released." },
  no_show: { label: "No-show", tone: "danger", description: "The customer did not attend." },
  expired: { label: "Expired", tone: "neutral", description: "Payment was not completed in time." },
};

export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  not_required: { label: "No payment", tone: "neutral", description: "Nothing to pay." },
  pending: { label: "Payment pending", tone: "warning", description: "Waiting for the customer to pay." },
  paid: { label: "Paid", tone: "success", description: "Paid in full." },
  partially_refunded: {
    label: "Partly refunded",
    tone: "info",
    description: "Part of the payment was refunded.",
  },
  refunded: { label: "Refunded", tone: "neutral", description: "The payment was refunded." },
  failed: { label: "Payment failed", tone: "danger", description: "The payment did not go through." },
  pay_at_venue: {
    label: "Pay at venue",
    tone: "neutral",
    description: "To be paid in person at the appointment.",
  },
};

/** Statuses that occupy the calendar (allocations active): the booking is still to happen or be decided. */
export const BLOCKING_STATUSES: readonly BookingStatus[] = ["held", "pending_approval", "confirmed"];

/** Held for payment, awaiting approval or confirmed: the time is taken for this booking. */
export function isBlockingStatus(status: BookingStatus): boolean {
  return BLOCKING_STATUSES.includes(status);
}

/** Cancelled or expired: the time was released without the appointment taking place. */
export function isReleasedStatus(status: BookingStatus): boolean {
  return status === "cancelled" || status === "expired";
}

export const BOOKING_STATUS_OPTIONS = (Object.keys(BOOKING_STATUS) as BookingStatus[]).map((value) => ({
  value,
  label: BOOKING_STATUS[value].label,
}));
