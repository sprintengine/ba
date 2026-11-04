/**
 * What a booking costs, how long it takes and what is paid when, plus the price and duration labels a
 * service list shows ("Free", "€45", "from €45", "30 min – 1 h"). Pure, and shaped for any service-like
 * value: the public `PublicService`, the dashboard's `Service` and form values, onboarding drafts and the
 * marketing examples all fit `PricedService`. The rules mirror the backend's booking engine (`dueNow`).
 */
import type { PaymentMode, SlotOffer } from "@/lib/api/types";
import { formatDuration, formatMoney } from "@/lib/format";

type MoneyOptions = NonNullable<Parameters<typeof formatMoney>[2]>;

export type PricedOption = { id?: string; name: string; priceCents: number; durationMinutes: number };
export type PricedAddon = { id?: string; name: string; priceCents: number; extraMinutes: number };

/** The parts of a service that set its price, length and payment. */
export type PricedService = {
  name: string;
  priceCents: number;
  durationMinutes: number;
  paymentMode: PaymentMode;
  /** For `deposit` services; null/absent charges the whole price online. */
  depositCents?: number | null;
  /** When there are options, the chosen option's price and length replace the service's. */
  options?: readonly PricedOption[];
  addons?: readonly PricedAddon[];
};

export type PaymentSplit = {
  /** Effective payment mode ("free" when the total is 0). */
  mode: PaymentMode;
  /** Charged online at booking time. */
  dueNowCents: number;
  /** Paid at the appointment. */
  dueLaterCents: number;
};

export type QuoteLine = { label: string; cents: number; minutes?: number };

export type Quote = PaymentSplit & {
  durationMinutes: number;
  basePriceCents: number;
  addonsCents: number;
  totalCents: number;
  lines: QuoteLine[];
  /** The deal applied to the chosen time (§19); `totalCents` is then the discounted price. */
  deal?: { name: string; label: string; originalTotalCents: number; discountCents: number };
};

/** What is paid online now and what at the appointment, for a total. A deposit never exceeds the total. */
export function paymentSplit(
  service: Pick<PricedService, "paymentMode" | "depositCents">,
  totalCents: number,
): PaymentSplit {
  const mode: PaymentMode = totalCents === 0 ? "free" : service.paymentMode;
  const dueNowCents =
    mode === "full"
      ? totalCents
      : mode === "deposit"
        ? Math.min(service.depositCents ?? totalCents, totalCents)
        : 0;
  return { mode, dueNowCents, dueLaterCents: totalCents - dueNowCents };
}

/** The same quote paid at the venue instead of online (a service with `allowPayAtVenue`): nothing due now. */
export function payingAtVenue(q: Quote): Quote {
  return { ...q, ...paymentSplit({ paymentMode: "at_venue", depositCents: null }, q.totalCents) };
}

/** The quote for a chosen option (or none) and add-ons. */
export function quoteFor(
  service: PricedService,
  option: PricedOption | null,
  addons: readonly PricedAddon[],
): Quote {
  const basePriceCents = option ? option.priceCents : service.priceCents;
  const baseMinutes = option ? option.durationMinutes : service.durationMinutes;
  const addonsCents = addons.reduce((sum, a) => sum + a.priceCents, 0);
  const totalCents = basePriceCents + addonsCents;
  const lines: QuoteLine[] = [
    {
      label: option ? `${service.name} · ${option.name}` : service.name,
      cents: basePriceCents,
      minutes: baseMinutes,
    },
    ...addons.map((a) => ({ label: a.name, cents: a.priceCents, minutes: a.extraMinutes })),
  ];
  return {
    durationMinutes: baseMinutes + addons.reduce((s, a) => s + a.extraMinutes, 0),
    basePriceCents,
    addonsCents,
    totalCents,
    ...paymentSplit(service, totalCents),
    lines,
  };
}

/** The quote for an option id and add-on ids (unknown ids are ignored), as the booking flow selects them. */
export function quote(service: PricedService, optionId: string | null, addonIds: readonly string[]): Quote {
  const option = service.options?.find((o) => o.id !== undefined && o.id === optionId) ?? null;
  const addons = (service.addons ?? []).filter((a) => a.id !== undefined && addonIds.includes(a.id));
  return quoteFor(service, option, addons);
}

/**
 * The quote with the chosen slot's deal applied. The server prices the slot for the selected
 * service, option and add-ons, so the slot's `priceCents` becomes the total.
 */
export function withSlotOffer(
  q: Quote,
  service: Pick<PricedService, "paymentMode" | "depositCents">,
  offer: SlotOffer | null | undefined,
): Quote {
  if (!offer || offer.priceCents >= q.totalCents) return q;
  const totalCents = Math.max(0, offer.priceCents);
  return {
    ...q,
    totalCents,
    ...paymentSplit(service, totalCents),
    deal: {
      name: offer.name,
      label: offer.label,
      originalTotalCents: q.totalCents,
      discountCents: q.totalCents - totalCents,
    },
  };
}

export type Range = { min: number; max: number };

/** Lowest and highest base price: the options' when there are options, else the service's. */
export function priceRange(service: Pick<PricedService, "priceCents" | "options">): Range {
  return range(service.options?.length ? service.options.map((o) => o.priceCents) : [service.priceCents]);
}

/** Shortest and longest length: the options' when there are options, else the service's. */
export function durationRange(service: Pick<PricedService, "durationMinutes" | "options">): Range {
  return range(
    service.options?.length ? service.options.map((o) => o.durationMinutes) : [service.durationMinutes],
  );
}

function range(values: number[]): Range {
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** The parts of a service its list price reads from; `paymentMode` is optional for marketing examples. */
export type ListedService = Pick<PricedService, "priceCents" | "options"> & { paymentMode?: PaymentMode };

/**
 * How a service's price reads in a list: free when nothing costs anything (or the service is set to free:
 * the editors keep option prices while the mode is free and drop them on save), one price, or "from" the
 * cheapest option when the options' prices differ. Add-ons are extras and never change it.
 */
export type PriceSummary =
  { kind: "free" } | { kind: "fixed"; cents: number } | { kind: "from"; cents: number };

export function priceSummary(service: ListedService): PriceSummary {
  const { min, max } = priceRange(service);
  if (max === 0 || service.paymentMode === "free") return { kind: "free" };
  return min === max ? { kind: "fixed", cents: min } : { kind: "from", cents: min };
}

/**
 * "Free", "€45" or "from €45" ("From €45" with `capitalize`). A free cheapest option reads "from €0", never
 * "from Free".
 */
export function priceLabel(
  service: ListedService,
  currency: string,
  options: MoneyOptions & { capitalize?: boolean } = {},
): string {
  const { capitalize = false, ...money } = options;
  const summary = priceSummary(service);
  switch (summary.kind) {
    case "free":
      return "Free";
    case "fixed":
      return formatMoney(summary.cents, currency, money);
    case "from":
      return `${capitalize ? "From" : "from"} ${formatMoney(summary.cents, currency, money)}`;
  }
}

/** "45 min", or "30 min – 1 h" when the options' lengths differ. */
export function durationLabel(service: Pick<PricedService, "durationMinutes" | "options">): string {
  const { min, max } = durationRange(service);
  return min === max ? formatDuration(min) : `${formatDuration(min)} – ${formatDuration(max)}`;
}
