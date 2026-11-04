/** Pure helpers for AI credits (architecture §16). */
import type { AiCredits } from "@/lib/api/types";
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
