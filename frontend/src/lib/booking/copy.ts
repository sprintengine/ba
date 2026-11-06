/** Customer-facing booking copy that depends on policy and payment. Pure. */
import type { CustomerBooking, PaymentMode, Policies, PublicService } from "@/lib/api/types";
import { formatDate, formatMoney, formatRelativeDay, formatTime } from "@/lib/format";
import type { Quote } from "./quote";

export function cancellationSummary(policies: Policies, mode: PaymentMode, businessName: string): string {
  if (!policies.allowCustomerCancel) {
    return `Online cancellation isn't available. Contact ${businessName} if your plans change.`;
  }
  const h = policies.cancellationNoticeHours;
  const window = h === 0 ? "any time before your appointment" : `up to ${formatHours(h)} before`;
  const paid = mode === "full" || mode === "deposit";
  if (!paid) return `Free cancellation ${window}.`;
  return `Cancel ${window} for a full refund.${h === 0 ? "" : lateRefund(policies.lateCancellationRefundPercent)}`;
}

function lateRefund(percent: number): string {
  if (percent >= 100) return " Later cancellations are still refunded in full.";
  if (percent <= 0) return " Later cancellations aren't refunded.";
  return ` Later cancellations are refunded ${percent}%.`;
}

function formatHours(h: number): string {
  if (h % 24 === 0 && h >= 48) return `${h / 24} days`;
  return h === 1 ? "1 hour" : `${h} hours`;
}

/**
 * What cancelling now would refund, in words (from the booking's server-side refund preview). Only money paid online
 * comes back online; money paid in person is for the business to settle.
 */
export function refundCopy(
  booking: Pick<
    CustomerBooking,
    | "amountPaidCents"
    | "amountPaidInPersonCents"
    | "amountRefundedCents"
    | "currency"
    | "paymentStatus"
    | "refundPreview"
  >,
): string {
  const money = (c: number) => formatMoney(c, booking.currency);
  const inPerson =
    booking.amountPaidInPersonCents > 0
      ? ` ${money(booking.amountPaidInPersonCents)} paid in person isn't refunded online — the business settles that with you directly.`
      : "";
  return onlineRefundCopy(booking, money) + inPerson;
}

function onlineRefundCopy(booking: Parameters<typeof refundCopy>[0], money: (c: number) => string): string {
  const paid = booking.amountPaidCents - booking.amountPaidInPersonCents - booking.amountRefundedCents;
  if (paid <= 0) {
    return booking.paymentStatus === "pending"
      ? "Nothing has been paid yet, so there's nothing to refund."
      : "Nothing has been paid online, so there's nothing to refund.";
  }
  const online = booking.amountPaidInPersonCents > 0 ? " online" : "";
  const preview = booking.refundPreview;
  const reason = lowerFirst(preview?.reason ?? "");
  if (!preview || preview.amountCents <= 0) {
    return `No refund applies${reason ? ` — ${reason}` : ""}. You paid ${money(paid)}${online}.`;
  }
  if (preview.amountCents >= paid) return `You'll get a full refund of ${money(paid)}.`;
  return `You'll be refunded ${money(preview.amountCents)} of the ${money(paid)} you paid${online}${reason ? ` (${reason})` : ""}.`;
}

function lowerFirst(s: string) {
  const t = s.trim().replace(/[.\s]+$/, "");
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** A hold countdown: 1_445_000 ms → "24:05". */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "later today at 14:00", "tomorrow at 09:30" or "on Friday 9 October" (business timezone). */
export function seeYouWhen(start: string, timeZone: string): string {
  const rel = formatRelativeDay(start, timeZone);
  if (rel === "Today") return `later today at ${formatTime(start, timeZone)}`;
  if (rel === "Tomorrow") return `tomorrow at ${formatTime(start, timeZone)}`;
  return `on ${formatDate(start, timeZone, "long")}`;
}

/** The extras step's subtitle for a service with options and/or add-ons. */
export function extrasStepDescription(service: {
  options: readonly unknown[];
  addons: readonly unknown[];
}): string {
  if (service.options.length > 0 && service.addons.length > 0) return "Choose an option and any extras.";
  if (service.options.length > 0) return "Choose the option that suits you.";
  return "Add any extras you'd like.";
}

/** "+353 1 555 0101 or hello@lumen.ie": how to reach the business directly ("" when neither is set). */
export function contactLine(business: { contactPhone: string | null; contactEmail: string | null }): string {
  return [business.contactPhone, business.contactEmail].filter(Boolean).join(" or ");
}

/** How paying works for this quote ("Paid securely online when you book."); null when it is free. */
export function paymentModeCopy(
  q: Pick<Quote, "mode" | "dueNowCents" | "dueLaterCents">,
  currency: string,
  locale: string,
): string | null {
  switch (q.mode) {
    case "free":
      return null;
    case "full":
      return "Paid securely online when you book.";
    case "deposit":
      return `${formatMoney(q.dueNowCents, currency, { locale })} deposit online now, ${formatMoney(q.dueLaterCents, currency, { locale })} at your appointment.`;
    case "at_venue":
      return "Nothing to pay now. Pay at your appointment.";
  }
}

/** The review step's button: pay (the amount due now), send a request, or confirm. */
export function submitLabel(
  service: Pick<PublicService, "requiresApproval">,
  q: Pick<Quote, "mode" | "dueNowCents" | "totalCents">,
  currency: string,
  locale: string,
  bookingNoun: string,
): string {
  if (q.mode === "full" || q.mode === "deposit")
    return `Continue to payment · ${formatMoney(q.dueNowCents, currency, { locale })}`;
  if (service.requiresApproval) return "Send request";
  if (q.mode === "at_venue" && q.totalCents > 0)
    return `Confirm ${bookingNoun} · ${formatMoney(q.totalCents, currency, { locale })} at venue`;
  return `Confirm ${bookingNoun}`;
}
