/** API types: Deals / offers (architecture §19). Import them from `@/lib/api/types`. */

export type Discount = { type: "percent"; percent: number } | { type: "fixed"; amountCents: number };
export type OfferKind = "off_peak" | "last_minute" | "always";
export type OfferStatus = "active" | "paused";
export type TimeWindow = { start: string; end: string };
export type OfferSchedule = {
  /** ISO days, Mon = 1; empty = every day. */
  daysOfWeek: number[];
  /** Local `HH:mm` ranges; a slot matches when its start is inside one. Empty = all day. */
  timeWindows: TimeWindow[];
  /** Slots starting within this many hours of now; null = no last-minute condition. */
  lastMinuteHours: number | null;
};

export type Offer = {
  id: string;
  name: string;
  description: string | null;
  serviceIds: string[];
  discount: Discount;
  schedule: OfferSchedule;
  validFrom: string | null;
  validUntil: string | null;
  maxRedemptions: number | null;
  status: OfferStatus;
  kind: OfferKind;
  /** "20% off", "€5 off" */
  label: string;
  /** "Tue, 13:00–17:00" */
  summary: string;
  redemptions: number;
  createdAt: string;
  updatedAt: string;
};

export type OfferInput = {
  name: string;
  description: string | null;
  serviceIds: string[];
  discount: Discount;
  schedule: OfferSchedule;
  validFrom: string | null;
  validUntil: string | null;
  maxRedemptions: number | null;
  active: boolean;
};

/** Active deals as customers see them (site, booking flow, marketplace). */
export type PublicOffer = {
  id: string;
  name: string;
  description: string | null;
  kind: OfferKind;
  discount: Discount;
  label: string;
  summary: string;
  serviceIds: string[];
  validUntil: string | null;
};

export type SlotOffer = {
  id: string;
  name: string;
  label: string;
  originalPriceCents: number;
  priceCents: number;
};

/** The deal recorded on a booking's price snapshot. */
export type BookingOffer = {
  id: string;
  name: string;
  label: string;
  originalPriceCents: number;
  discountCents: number;
};

export type OfferPreviewInput = { offer: OfferInput; from?: string; days?: number };
export type OfferPreviewSlot = {
  start: string;
  serviceId: string;
  serviceName: string;
  originalPriceCents: number;
  priceCents: number;
};
export type OfferPreview = {
  timezone: string;
  currency: string;
  from: string;
  to: string;
  totalSlots: number;
  affectedSlots: number;
  days: { date: string; slots: OfferPreviewSlot[] }[];
};
