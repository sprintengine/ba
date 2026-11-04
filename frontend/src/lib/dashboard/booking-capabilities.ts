/** What staff can do with a booking right now, and how the drawer's action bar lays those actions out. Pure. */
import type { Booking, TerminalBookingStatus } from "@/lib/api/types";
import { isBlockingStatus, isReleasedStatus } from "@/lib/status";

export type BookingCapabilities = {
  /** Pending approval: approve or decline. */
  approve: boolean;
  /** Pending approval or confirmed. */
  reschedule: boolean;
  /** Held, pending approval or confirmed (the time is still taken). */
  cancel: boolean;
  /** Confirmed, completed or no-show, once it has started: record how it went (or correct it). */
  mark: boolean;
};

export function bookingCapabilities(
  booking: Pick<Booking, "status" | "start">,
  now: Date,
): BookingCapabilities {
  const { status } = booking;
  const started = new Date(booking.start).getTime() <= now.getTime();
  return {
    approve: status === "pending_approval",
    reschedule: status === "pending_approval" || status === "confirmed",
    cancel: isBlockingStatus(status),
    mark: (status === "confirmed" || status === "completed" || status === "no_show") && started,
  };
}

/**
 * Confirmed or completed with money still due at the venue (the price of a pay-at-venue booking, or a deposit's
 * balance): staff can record that it was paid in person.
 */
export function canMarkPaidInPerson(
  b: Pick<Booking, "status" | "paymentStatus" | "priceCents" | "amountPaidCents">,
): boolean {
  return (
    (b.status === "confirmed" || b.status === "completed") &&
    (b.paymentStatus === "pay_at_venue" || b.paymentStatus === "paid") &&
    b.priceCents > b.amountPaidCents
  );
}

export type BookingActionLayout = {
  /** Nothing to do: say so. `closed` = cancelled or expired ("This booking is closed."), else "No actions yet". */
  idle: null | { closed: boolean };
  /** Approve and Decline buttons. */
  approveDecline: boolean;
  /** "Completed" and "No-show" buttons (a confirmed booking that has started). */
  markOutcome: boolean;
  /** One button that flips a recorded outcome to the other one. */
  correctOutcome: TerminalBookingStatus | null;
  /** Reschedule and Cancel as buttons when nothing more important is shown… */
  rescheduleButton: boolean;
  cancelButton: boolean;
  /** …or in a "More actions" menu next to the primary actions. */
  overflowMenu: boolean;
};

/** Which controls the action bar shows: primary actions first, the rest in an overflow menu. */
export function bookingActionLayout(
  booking: Pick<Booking, "status">,
  can: BookingCapabilities,
): BookingActionLayout {
  const primary = can.approve || can.mark;
  const nothing = !can.approve && !can.reschedule && !can.cancel && !can.mark;
  const confirmed = booking.status === "confirmed";
  return {
    idle: nothing ? { closed: isReleasedStatus(booking.status) } : null,
    approveDecline: can.approve,
    markOutcome: can.mark && confirmed,
    correctOutcome:
      can.mark && !confirmed ? (booking.status === "completed" ? "no_show" : "completed") : null,
    rescheduleButton: !primary && can.reschedule,
    cancelButton: !primary && can.cancel,
    overflowMenu: primary && (can.reschedule || can.cancel),
  };
}
