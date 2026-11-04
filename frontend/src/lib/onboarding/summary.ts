/** Summaries of a setup for the success step ("takes payments"); price and duration labels are lib/booking/quote's. */
import type { BusinessSetup } from "@/lib/api/types";

/** Whether any service takes money online (so the owner should connect payments next). */
export function hasPaidServices(setup: BusinessSetup): boolean {
  return setup.services.some(
    (s) =>
      (s.paymentMode === "full" || s.paymentMode === "deposit") &&
      (s.priceCents > 0 || s.options.some((o) => o.priceCents > 0) || s.addons.some((a) => a.priceCents > 0)),
  );
}
