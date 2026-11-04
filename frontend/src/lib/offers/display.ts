/** Copy and small helpers for showing deals (dashboard and public). Pure; tested in display.test.ts. */
import type { Offer, OfferKind } from "@/lib/api/types";
import { DEFAULT_LOCALE, formatMoney } from "@/lib/format";

/** ISO weekdays, Monday first (matches `OfferSchedule.daysOfWeek`). */
export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
] as const;

export const OFFER_KIND_LABEL: Record<OfferKind, string> = {
  off_peak: "Off-peak",
  last_minute: "Last-minute",
  always: "Always on",
};

export type OfferState = "active" | "paused" | "scheduled" | "ended" | "limit_reached";

/** Status text and badge tone (text always says it; colour is only a hint). */
export const OFFER_STATE: Record<
  OfferState,
  { label: string; tone: "success" | "neutral" | "info" | "warning" }
> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
  limit_reached: { label: "Limit reached", tone: "warning" },
};

/** Whether a deal applies today (`today` in the business timezone). Paused wins over everything else. */
export function offerState(
  offer: Pick<Offer, "status" | "validFrom" | "validUntil" | "redemptions" | "maxRedemptions">,
  today: string,
): OfferState {
  if (offer.status === "paused") return "paused";
  if (offer.validUntil && offer.validUntil < today) return "ended";
  if (offer.maxRedemptions !== null && offer.redemptions >= offer.maxRedemptions) return "limit_reached";
  if (offer.validFrom && offer.validFrom > today) return "scheduled";
  return "active";
}

/** "3 used" or "3 of 50 used". */
export function redemptionsText(redemptions: number, max: number | null): string {
  return max === null
    ? `${redemptions} used`
    : `${redemptions} of ${max.toLocaleString(DEFAULT_LOCALE)} used`;
}

/** Accessible text for a struck-through price: "was €50, now €40". */
export function wasNowText(
  originalCents: number,
  priceCents: number,
  currency: string,
  locale?: string,
): string {
  const now = priceCents === 0 ? "free" : formatMoney(priceCents, currency, { locale });
  return `was ${formatMoney(originalCents, currency, { locale })}, now ${now}`;
}
