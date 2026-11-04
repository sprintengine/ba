/** How a booking's page was reached, as the manage view understands it. Pure. */
import type { ManageContext } from "@shared/booking/manage";
import type { CheckoutOutcome } from "~/features/booking/checkout";

/**
 * The website's contexts (`booked`, `paid`, `payment_cancelled`, none), plus two the app has: `checkout` while
 * Checkout is open over the app, and `checking` when it closed without saying how it ended (the booking is read
 * again for a few seconds: paid, or not).
 */
export type ViewContext = ManageContext | "checkout" | "checking";

/** A flow's or a payment's outcome as the view's context. */
export function contextFromOutcome(outcome: "booked" | "checkout" | CheckoutOutcome | null): ViewContext {
  switch (outcome) {
    case "booked":
      return "booked";
    case "checkout":
      return "checkout";
    case "succeeded":
      return "paid";
    case "cancelled":
      return "payment_cancelled";
    case "unknown":
      return "checking";
    default:
      return null;
  }
}

/** The website's hero context for a view context: still checking reads as "Confirming your payment…". */
export function heroContext(context: ViewContext): ManageContext {
  if (context === "checking") return "paid";
  if (context === "checkout") return null;
  return context;
}

/** How long to keep reading a held booking after Checkout closed without an outcome, before saying it wasn't paid. */
export const CHECKING_MS = 8_000;
/** How often to read it meanwhile (and while confirming a payment that succeeded). */
export const POLL_MS = 2_000;
