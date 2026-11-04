/**
 * Pure helpers for the Offers screens (the website's offers-page and offer-card): the list's order, the card's
 * services and dates lines, the services a deal can be edited with, and the next time window to add.
 */
import type { Offer, Service } from "@shared/api/types";
import { OFFER_KIND_LABEL, OFFER_STATE, offerState, redemptionsText } from "@shared/offers/display";
import type { OfferFormValues } from "@shared/offers/offer-form";

/** Running deals first, paused ones after; by name within each. */
export function sortOffers(offers: readonly Offer[] | undefined): Offer[] {
  return [...(offers ?? [])].sort(
    (a, b) => Number(a.status === "paused") - Number(b.status === "paused") || a.name.localeCompare(b.name),
  );
}

/** "Initial assessment, Follow-up", "A, B +3 more", or "2 services" when the names aren't loaded. */
export function serviceNames(ids: readonly string[], services: readonly Service[]): string {
  const names = ids.map((id) => services.find((s) => s.id === id)?.name).filter((n): n is string => !!n);
  if (names.length === 0) return `${ids.length} ${ids.length === 1 ? "service" : "services"}`;
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

/** "1 Oct 2026 – 31 Dec 2026", "From …", "Until …", or null when the deal has no dates. */
export function validDates(
  offer: Pick<Offer, "validFrom" | "validUntil">,
  date: (d: string) => string,
): string | null {
  if (offer.validFrom && offer.validUntil) return `${date(offer.validFrom)} – ${date(offer.validUntil)}`;
  if (offer.validFrom) return `From ${date(offer.validFrom)}`;
  if (offer.validUntil) return `Until ${date(offer.validUntil)}`;
  return null;
}

/** Services the editor offers: the active ones, plus any inactive ones the deal already covers. */
export function editorServices(services: readonly Service[] | undefined, offer: Offer | null): Service[] {
  return (services ?? []).filter((s) => s.isActive || offer?.serviceIds.includes(s.id));
}

/** What a card says, as one sentence for screen readers. */
export function offerCardLabel({
  offer,
  services,
  today,
  date,
}: {
  offer: Offer;
  services: readonly Service[];
  today: string;
  date: (d: string) => string;
}): string {
  const state = OFFER_STATE[offerState(offer, today)].label;
  const dates = validDates(offer, date);
  return [
    `${offer.name}, ${offer.label}, ${state}`,
    `${OFFER_KIND_LABEL[offer.kind]}: ${offer.summary}`,
    serviceNames(offer.serviceIds, services),
    redemptionsText(offer.redemptions, offer.maxRedemptions),
    dates,
  ]
    .filter(Boolean)
    .join(". ");
}

type Window = OfferFormValues["schedule"]["timeWindows"][number];

const toMinutes = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * The window "Add hours" appends: after the last one when there's room in the day (two hours, or to 22:00), else
 * the afternoon. Always complete: the app's time pickers have no empty state.
 */
export function nextTimeWindow(windows: readonly Window[]): { start: string; end: string } {
  const last = windows.at(-1)?.end;
  if (last && last < "20:00") {
    const start = toMinutes(last);
    return { start: last, end: toTime(Math.min(start + 120, 22 * 60)) };
  }
  return { start: "13:00", end: "17:00" };
}

/** Quick picks for the days of the week. */
export const DAY_PRESETS = [
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [6, 7] },
  { label: "Every day", days: [] },
] as const;

/** Whether `days` is exactly the preset's (in any order). */
export function isPreset(days: readonly number[], preset: readonly number[]): boolean {
  return days.length === preset.length && preset.every((d) => days.includes(d));
}
