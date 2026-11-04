/**
 * Human wording for booking history, sources and refunds. Pure functions so
 * they can be tested and reused by the drawer, lists and customer pages.
 */
import type { AuditEvent, Booking, BookingSource } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { isReleasedStatus } from "@/lib/status";

type VFn = (key: "booking" | "customer" | "resource", options?: { title?: boolean }) => string;

const ACTIONS: Record<string, (v: VFn) => string> = {
  "booking.created": (v) => `${v("booking", { title: true })} created`,
  "booking.seeded": (v) => `${v("booking", { title: true })} created`,
  "booking.updated": () => "Details updated",
  "booking.approved": () => "Approved",
  "booking.declined": () => "Declined",
  "booking.cancelled": () => "Cancelled",
  "booking.rescheduled": () => "Rescheduled",
  "booking.completed": () => "Marked completed",
  "booking.no_show": () => "Marked no-show",
  "booking.status_changed": () => "Status changed",
  "booking.expired": () => "Hold expired",
  "booking.confirmed": () => "Confirmed",
  "booking.payment_link_sent": () => "Payment link sent",
  "payment.succeeded": () => "Payment received",
  "payment.received_in_person": () => "Paid in person",
  "payment.failed": () => "Payment failed",
  "payment.refunded": () => "Refund issued",
  "payment.refunded_late": () => "Late payment refunded",
};

/** "booking.cancelled" → "Cancelled"; unknown actions are humanised ("x.some_thing" → "Some thing"). */
export function auditActionLabel(action: string, v: VFn): string {
  const known = ACTIONS[action];
  if (known) return known(v);
  const last = action.split(".").pop() ?? action;
  const words = last.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
}

const ACTOR: Record<string, string> = {
  owner: "Owner",
  member: "Team",
  customer: "Customer",
  guest: "Guest",
  system: "Automatic",
  ai: "AI assistant",
  api: "API",
};

export function auditActorLabel(event: Pick<AuditEvent, "actorType" | "actorName">, v: VFn): string {
  if (event.actorName) return event.actorName;
  if (event.actorType === "customer" || event.actorType === "guest") return v("customer", { title: true });
  return ACTOR[event.actorType] ?? "Someone";
}

/** Payments taken, whose `amountCents` is money in rather than a refund. */
const PAYMENTS_IN = new Set(["payment.succeeded", "payment.received_in_person"]);

/** Short extra detail from an audit summary (reason, amount paid or refunded, new time) — or null. */
export function auditDetail(
  event: Pick<AuditEvent, "summary"> & Partial<Pick<AuditEvent, "action">>,
  currency: string,
  formatInstant: (iso: string) => string,
): string | null {
  const s = event.summary;
  const parts: string[] = [];
  const str = (k: string) => (typeof s[k] === "string" && s[k].trim() ? s[k] : null);
  const num = (k: string) => (typeof s[k] === "number" ? s[k] : null);
  const reason = str("reason");
  if (reason) parts.push(`“${reason}”`);
  const paidIn = event.action !== undefined && PAYMENTS_IN.has(event.action);
  const paid = paidIn ? num("amountCents") : null;
  if (paid !== null && paid > 0) parts.push(formatMoney(paid, currency));
  const refund = num("refundCents") ?? (paidIn ? null : num("amountCents"));
  if (refund !== null && refund > 0) parts.push(`${formatMoney(refund, currency)} refunded`);
  const to = str("start") ?? str("newStart") ?? str("to");
  if (to && /^\d{4}-\d{2}-\d{2}T/.test(to)) parts.push(`to ${formatInstant(to)}`);
  else if (to && to.includes("@")) parts.push(`to ${to}`);
  return parts.length ? parts.join(" · ") : null;
}

export const SOURCE_LABEL: Record<BookingSource, string> = {
  public: "Booking page",
  dashboard: "Dashboard",
  api: "API",
  ai: "AI assistant",
};

export type RefundChoice = "policy" | "full" | "none";

type RefundMoney = Pick<Booking, "amountPaidCents" | "amountPaidInPersonCents" | "amountRefundedCents">;

/** What an online refund can still return: the money paid online, less refunds. Money taken in person never is. */
export function refundableOnline(b: RefundMoney): number {
  return Math.max(0, b.amountPaidCents - b.amountPaidInPersonCents - b.amountRefundedCents);
}

/** " €45 paid in person isn't refunded online — return it at the venue." when some was; "" otherwise. */
export function paidInPersonNote(b: Pick<Booking, "amountPaidInPersonCents" | "currency">): string {
  if (b.amountPaidInPersonCents <= 0) return "";
  return ` ${formatMoney(b.amountPaidInPersonCents, b.currency)} paid in person isn't refunded online — return it at the venue.`;
}

/**
 * What a staff cancellation will refund, mirroring the backend RefundPolicy:
 * a business cancellation refunds in full under the policy; staff can override
 * with "full" or "none". Only money paid online is refunded.
 */
export function refundPreview(
  booking: RefundMoney & Pick<Booking, "currency">,
  choice: RefundChoice,
): { amountCents: number; text: string } {
  const refundable = refundableOnline(booking);
  const money = formatMoney(refundable, booking.currency);
  const inPerson = paidInPersonNote(booking);
  if (refundable === 0)
    return { amountCents: 0, text: `Nothing has been paid online, so there's nothing to refund.${inPerson}` };
  switch (choice) {
    case "policy":
      return {
        amountCents: refundable,
        text: `Your policy refunds cancellations made by the business in full: ${money} goes back to the original payment method.${inPerson}`,
      };
    case "full":
      return {
        amountCents: refundable,
        text: `${money} will be refunded in full to the original payment method.${inPerson}`,
      };
    case "none":
      return { amountCents: 0, text: `No refund. The ${money} already paid online is kept.` };
  }
}

/** Amount still due (for "at venue" / unpaid bookings). */
export function amountDue(
  b: Pick<Booking, "priceCents" | "amountPaidCents" | "amountRefundedCents" | "status">,
) {
  if (isReleasedStatus(b.status)) return 0;
  return Math.max(0, b.priceCents - b.amountPaidCents);
}
