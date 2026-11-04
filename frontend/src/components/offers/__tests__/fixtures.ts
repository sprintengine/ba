import type { Offer, OfferPreview, Service } from "@/lib/api/types";

/** Fictional test data. */
export const service = (patch: Partial<Service> = {}): Service => ({
  id: "s1",
  name: "Sports massage",
  description: null,
  category: null,
  color: "#0e7c70",
  durationMinutes: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  slotIntervalMinutes: null,
  minNoticeMinutes: null,
  maxAdvanceDays: null,
  capacity: 1,
  priceCents: 5000,
  paymentMode: "at_venue",
  depositCents: null,
  allowPayAtVenue: false,
  requiresApproval: false,
  locationType: "business",
  allowedGroupIds: [],
  isPublic: true,
  isActive: true,
  sortOrder: 0,
  options: [],
  addons: [],
  requirements: [],
  ...patch,
});

export const offer = (patch: Partial<Offer> = {}): Offer => ({
  id: "of1",
  name: "Quiet Tuesdays",
  description: null,
  serviceIds: ["s1"],
  discount: { type: "percent", percent: 20 },
  schedule: { daysOfWeek: [2], timeWindows: [{ start: "13:00", end: "17:00" }], lastMinuteHours: null },
  validFrom: null,
  validUntil: null,
  maxRedemptions: 50,
  status: "active",
  kind: "off_peak",
  label: "20% off",
  summary: "Tue, 13:00–17:00",
  redemptions: 4,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
  ...patch,
});

export const preview: OfferPreview = {
  timezone: "Europe/Dublin",
  currency: "EUR",
  from: "2026-10-05",
  to: "2026-10-11",
  totalSlots: 12,
  affectedSlots: 2,
  days: [
    {
      date: "2026-10-06",
      slots: [
        {
          start: "2026-10-06T13:00:00+01:00",
          serviceId: "s1",
          serviceName: "Sports massage",
          originalPriceCents: 5000,
          priceCents: 4000,
        },
        {
          start: "2026-10-06T14:00:00+01:00",
          serviceId: "s1",
          serviceName: "Sports massage",
          originalPriceCents: 5000,
          priceCents: 4000,
        },
      ],
    },
  ],
};

export const apiError = (
  status: number,
  code: string,
  message: string,
  fields: Record<string, string> = {},
) => new Response(JSON.stringify({ error: { code, message, fields } }), { status });
