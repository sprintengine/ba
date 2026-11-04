/** What the guest "manage your booking" page says, from the booking's status and how the visitor arrived. */
import type { ManagedBooking } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { seeYouWhen } from "./copy";

/** How the visitor reached the page: straight after booking, back from checkout, or neither. */
export type ManageContext = "booked" | "paid" | "payment_cancelled" | null;

export function manageContextFrom(params: URLSearchParams): ManageContext {
  if (params.get("payment") === "succeeded") return "paid";
  if (params.get("payment") === "cancelled") return "payment_cancelled";
  if (params.get("booked") === "1") return "booked";
  return null;
}

export type ManageHero =
  | { kind: "confirmed"; title: string; tone: "success" }
  | { kind: "pending_approval"; title: string; tone: "info" }
  | { kind: "confirming_payment"; title: string; tone: "info" }
  | { kind: "awaiting_payment"; title: string; tone: "warning" }
  | { kind: "cancelled" | "expired" | "past"; title: string; tone: "neutral" }
  | { kind: "none" };

/** The page's headline (title and tone) for this booking; `none` on a plain revisit of a confirmed booking. */
export function manageHero(
  booking: Pick<ManagedBooking, "status">,
  context: ManageContext,
  holdRemainingMs: number | null,
): ManageHero {
  switch (booking.status) {
    case "confirmed":
      return confirmedHero(context);
    case "pending_approval":
      return {
        kind: "pending_approval",
        title: context === "paid" ? "Payment received and request sent" : "Request received",
        tone: "info",
      };
    case "held":
      return heldHero(context, holdRemainingMs);
    case "cancelled":
      return { kind: "cancelled", title: "Cancelled", tone: "neutral" };
    case "expired":
      return { kind: "expired", title: "This hold expired", tone: "neutral" };
    case "completed":
    case "no_show":
      return { kind: "past", title: "This has passed", tone: "neutral" };
  }
}

function confirmedHero(context: ManageContext): ManageHero {
  if (context === "booked") return { kind: "confirmed", title: "You're booked", tone: "success" };
  if (context === "paid") return { kind: "confirmed", title: "You're booked and paid", tone: "success" };
  return { kind: "none" };
}

function heldHero(context: ManageContext, holdRemainingMs: number | null): ManageHero {
  if (context === "paid")
    return { kind: "confirming_payment", title: "Confirming your payment…", tone: "info" };
  if (holdRemainingMs === 0) return { kind: "expired", title: "Your hold has run out", tone: "neutral" };
  return {
    kind: "awaiting_payment",
    title: context === "payment_cancelled" ? "Payment not completed" : "Complete your payment",
    tone: "warning",
  };
}

/**
 * The hero's line under the title, for every kind but `awaiting_payment` (which shows a live countdown) and
 * `none`. `knowsBusiness` is false while the business's public profile hasn't loaded.
 */
export function manageHeroText(
  kind: Exclude<ManageHero["kind"], "awaiting_payment" | "none">,
  b: Pick<
    ManagedBooking,
    "customer" | "start" | "timezone" | "business" | "amountRefundedCents" | "currency"
  >,
  opts: { noun: string; knowsBusiness: boolean },
): string | null {
  const email = b.customer.email;
  switch (kind) {
    case "confirmed":
      return [
        email ? `We've emailed the details to ${email}.` : null,
        `See you ${seeYouWhen(b.start, b.timezone)}.`,
      ]
        .filter(Boolean)
        .join(" ");
    case "pending_approval":
      return `${b.business.name} reviews each request. We'll email ${email ?? "you"} as soon as it's confirmed, and your time is held until then.`;
    case "confirming_payment":
      return "This usually takes a few seconds. You can safely stay on this page.";
    case "cancelled":
      return b.amountRefundedCents > 0
        ? `${formatMoney(b.amountRefundedCents, b.currency)} is on its way back to your card. Refunds usually arrive within 5–10 working days.`
        : `This ${opts.noun} was cancelled and the time released.`;
    case "expired":
      return "Payment wasn't completed in time, so the slot was released. Nothing was charged.";
    case "past":
      return opts.knowsBusiness ? `Thanks for booking with ${b.business.name}.` : null;
  }
}
