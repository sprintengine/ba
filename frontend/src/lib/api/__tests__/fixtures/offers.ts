/** Deal fixtures (§19): an offer as the dashboard sees it and the deal snapshots on slots and bookings. */
import type { BookingOffer, Offer, OfferPreview, PublicOffer, SlotOffer } from "@/lib/api/types";
import { ids } from "./ids";

export const offer = {
  id: ids.offer,
  name: "Quiet Tuesdays",
  description: "20% off Tuesday afternoons.",
  serviceIds: [ids.service],
  discount: { type: "percent", percent: 20 },
  schedule: { daysOfWeek: [2], timeWindows: [{ start: "13:00", end: "17:00" }], lastMinuteHours: 24 },
  validFrom: "2026-10-01",
  validUntil: "2026-12-31",
  maxRedemptions: 50,
  status: "active",
  kind: "off_peak",
  label: "20% off",
  summary: "Tue, 13:00–17:00",
  redemptions: 3,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-02T10:00:00Z",
} satisfies Offer;

export const offerSparse = {
  ...offer,
  description: null,
  discount: { type: "fixed", amountCents: 500 },
  schedule: { daysOfWeek: [], timeWindows: [], lastMinuteHours: null },
  validFrom: null,
  validUntil: null,
  maxRedemptions: null,
  kind: "always",
  label: "€5 off",
} satisfies Offer;

export const publicOffer = {
  id: ids.offer,
  name: "Quiet Tuesdays",
  description: "20% off Tuesday afternoons.",
  kind: "off_peak",
  discount: { type: "percent", percent: 20 },
  label: "20% off",
  summary: "Tue, 13:00–17:00",
  serviceIds: [ids.service],
  validUntil: "2026-12-31",
} satisfies PublicOffer;

export const publicOfferSparse = {
  ...publicOffer,
  description: null,
  validUntil: null,
} satisfies PublicOffer;

export const slotOffer = {
  id: ids.offer,
  name: "Quiet Tuesdays",
  label: "20% off",
  originalPriceCents: 7000,
  priceCents: 5600,
} satisfies SlotOffer;

export const bookingOffer = {
  id: ids.offer,
  name: "Quiet Tuesdays",
  label: "20% off",
  originalPriceCents: 7000,
  discountCents: 1400,
} satisfies BookingOffer;

export const offerPreview = {
  timezone: "Europe/Dublin",
  currency: "EUR",
  from: "2026-10-01",
  to: "2026-10-14",
  totalSlots: 120,
  affectedSlots: 8,
  days: [
    {
      date: "2026-10-06",
      slots: [
        {
          start: "2026-10-06T13:00:00+01:00",
          serviceId: ids.service,
          serviceName: "Initial assessment",
          originalPriceCents: 7000,
          priceCents: 5600,
        },
      ],
    },
  ],
} satisfies OfferPreview;
