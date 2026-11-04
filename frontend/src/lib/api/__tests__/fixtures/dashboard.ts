/** Dashboard fixtures: weekly hours and closures, customer detail, overview, reports, payments and billing. */
import type {
  AvailabilityOverride,
  AvailabilityRule,
  BillingInfo,
  CustomerDetail,
  Overview,
  PaymentsStatus,
  ReportSummary,
  ResourceAvailability,
} from "@/lib/api/types";
import { booking, bookingSparse, customer } from "./bookings";
import { ids } from "./ids";

export const availabilityRule = {
  id: "00000000-0000-4000-8000-000000000080",
  resourceId: ids.resource,
  dayOfWeek: 2,
  startTime: "09:00",
  endTime: "17:30",
  validFrom: "2026-10-01",
  validUntil: "2026-12-31",
  audienceGroupIds: [ids.group],
} satisfies AvailabilityRule;

export const availabilityRuleSparse = {
  ...availabilityRule,
  validFrom: null,
  validUntil: null,
} satisfies AvailabilityRule;

export const availabilityOverride = {
  id: "00000000-0000-4000-8000-000000000081",
  resourceId: ids.resource,
  date: "2026-10-12",
  isAvailable: true,
  startTime: "10:00",
  endTime: "14:00",
  reason: "Covering a Saturday clinic",
} satisfies AvailabilityOverride;

/** A business-wide closure for the whole day. */
export const availabilityOverrideSparse = {
  ...availabilityOverride,
  resourceId: null,
  isAvailable: false,
  startTime: null,
  endTime: null,
  reason: null,
} satisfies AvailabilityOverride;

export const resourceAvailability = {
  rules: [availabilityRule],
  overrides: [availabilityOverride],
} satisfies ResourceAvailability;

export const customerDetail = { ...customer, bookings: [booking] } satisfies CustomerDetail;

export const overview = {
  today: [bookingSparse],
  upcomingCount7d: 12,
  revenueCents30d: 184_000,
  bookings30d: 41,
  checklist: [
    { key: "services", done: true },
    { key: "publish", done: false },
  ],
} satisfies Overview;

export const reportSummary = {
  from: "2026-09-01",
  to: "2026-09-30",
  currency: "EUR",
  totals: {
    bookings: 41,
    confirmed: 36,
    cancelled: 3,
    noShows: 2,
    revenueCents: 184_000,
    refundedCents: 4_500,
    newCustomers: 9,
  },
  byDay: [{ date: "2026-09-01", bookings: 2, revenueCents: 9_000 }],
  byService: [{ serviceId: ids.service, name: "Initial assessment", bookings: 20, revenueCents: 140_000 }],
  byResource: [
    {
      resourceId: ids.resource,
      name: "Alex Morgan",
      bookedMinutes: 1_200,
      availableMinutes: 2_400,
      utilisation: 0.5,
    },
  ],
} satisfies ReportSummary;

export const paymentsStatus = {
  provider: "stripe",
  connected: true,
  chargesEnabled: true,
  detailsSubmitted: true,
} satisfies PaymentsStatus;

export const billing = {
  plan: "pro",
  status: "active",
  usage: { bookingsThisMonth: 41, limit: 500 },
  prices: [
    {
      plan: "free",
      name: "Free",
      amountCents: 0,
      currency: "EUR",
      interval: "month",
      features: ["50 bookings a month"],
    },
    {
      plan: "pro",
      name: "Pro",
      amountCents: 1_900,
      currency: "EUR",
      interval: "month",
      features: ["Online payments"],
    },
  ],
} satisfies BillingInfo;

/** Unlimited bookings. */
export const billingSparse = {
  ...billing,
  usage: { bookingsThisMonth: 41, limit: null },
} satisfies BillingInfo;
