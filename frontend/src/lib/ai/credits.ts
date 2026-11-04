/** Pure helpers for AI credits (architecture §16). */
import type { AiCredits, Business } from "@/lib/api/types";
import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { DEFAULT_LOCALE } from "@/lib/format/locale";

export type CreditsTone = "ok" | "low" | "out";

/** "142", "9.5", "0.6": whole numbers once there are plenty, one decimal for small amounts. */
export function formatCredits(value: number, locale = DEFAULT_LOCALE): string {
  const rounded = value >= 10 ? Math.floor(value) : Math.floor(value * 10) / 10;
  return rounded.toLocaleString(locale, { maximumFractionDigits: value >= 10 ? 0 : 1 });
}

export function creditsTone(c: AiCredits): CreditsTone {
  if (c.limitReached) return "out";
  return c.runningLow ? "low" : "ok";
}

/** Share of the allowance used, 0–100 (capped; overage shows as 100). */
export function creditsPercent(c: AiCredits): number {
  return c.limit <= 0 ? 100 : Math.min(100, Math.round((c.used / c.limit) * 100));
}

/** Whether an AI request can start (the server enforces this too). */
export function canUseCredits(c: AiCredits): boolean {
  return !c.limitReached;
}

/**
 * What a business's monthly AI credits pay for on this deployment: Bo (`assistantAvailable`) and the AI site builder
 * (`sitesEnabled`), the same as the plans in Billing say. Null when neither is offered: AI setup runs before the
 * business exists and doesn't draw on them, so there is nothing to show.
 */
export function aiCreditUses(business: Pick<Business, "assistantAvailable" | "sitesEnabled">): string | null {
  const uses = [
    business.assistantAvailable && ASSISTANT_NAME,
    business.sitesEnabled && "the AI site builder",
  ].filter(Boolean);
  return uses.length ? uses.join(" and ") : null;
}
