/**
 * What a cancellation should refund (docs/architecture.md section 7), worked out independently of the backend's
 * `RefundPolicy`: the business (or the system) refunds in full, a customer in full when cancelling at least the notice
 * before the start and the late percentage (rounded down) after it; staff may override with full or none.
 */

export type CancelledBy = "customer" | "business";
export type RefundOverride = "policy" | "full" | "none";

export type RefundCase = {
  by: CancelledBy;
  override: RefundOverride;
  /** The booking's start. */
  start: number;
  /** When the request was sent and answered: the server decided at some instant between them. */
  sentAt: number;
  receivedAt: number;
  noticeHours: number;
  latePercent: number;
  /** Paid online (in-person payments are never refunded online). */
  paidOnlineCents: number;
  refundedCents: number;
};

/** The refunds the policy allows: one value, or two when the request straddled the notice deadline. */
export function expectedRefunds(c: RefundCase): number[] {
  const refundable = Math.max(0, c.paidOnlineCents - c.refundedCents);
  if (refundable === 0) return [0];
  if (c.override === "full") return [refundable];
  if (c.override === "none") return [0];
  if (c.by === "business") return [refundable];
  const late = Math.min(
    refundable,
    Math.floor((c.paidOnlineCents * Math.min(100, Math.max(0, c.latePercent))) / 100),
  );
  const deadline = c.start - c.noticeHours * 3_600_000;
  const earlyAtSend = c.sentAt <= deadline;
  const earlyAtAnswer = c.receivedAt <= deadline;
  if (earlyAtSend && earlyAtAnswer) return [refundable];
  if (!earlyAtSend && !earlyAtAnswer) return [late];
  return [...new Set([refundable, late])];
}
