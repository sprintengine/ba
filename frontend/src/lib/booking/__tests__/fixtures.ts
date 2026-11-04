import type { ManagedBooking, PublicBusiness, PublicService } from "@/lib/api/types";

/** Fictional test data — "Lumen Physiotherapy" is not a real business. */
export const business: PublicBusiness = {
  id: "b1",
  slug: "lumen-physio",
  name: "Lumen Physiotherapy",
  description: "Physiotherapy for sports injuries.",
  industry: "physio",
  timezone: "Europe/Dublin",
  currency: "EUR",
  locale: "en-IE",
  contactEmail: "hello@lumen-physio.test",
  contactPhone: "+353 1 555 0101",
  websiteUrl: null,
  address: { line1: "Unit 4, Lantern Quay", line2: null, city: "Dublin", postcode: null },
  branding: { primaryColor: "#0f766e", logoUrl: null, coverImageUrl: null },
  vocabulary: {
    resource: "Therapist",
    resources: "Therapists",
    customer: "Client",
    customers: "Clients",
    booking: "Appointment",
    bookings: "Appointments",
  },
  policies: {
    minNoticeMinutes: 60,
    maxAdvanceDays: 60,
    cancellationNoticeHours: 24,
    lateCancellationRefundPercent: 50,
    allowCustomerCancel: true,
    allowCustomerReschedule: true,
    holdMinutes: 30,
    requireCustomerPhone: false,
    nextAvailableOnly: false,
  },
  customerGroups: [],
  paymentsEnabled: true,
  showBadge: false,
};

const base: Omit<PublicService, "id" | "name"> = {
  description: null,
  category: null,
  color: "#0f766e",
  durationMinutes: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  slotIntervalMinutes: null,
  minNoticeMinutes: null,
  maxAdvanceDays: null,
  capacity: 1,
  priceCents: 7000,
  paymentMode: "at_venue",
  depositCents: null,
  allowPayAtVenue: false,
  requiresApproval: false,
  locationType: "business",
  sortOrder: 1,
  options: [],
  addons: [],
  allowedGroupIds: [],
  selectableRequirement: null,
  questions: [],
};

export const assessment: PublicService = {
  ...base,
  id: "s1",
  name: "Initial assessment",
  category: "Physiotherapy",
  selectableRequirement: {
    id: "req1",
    label: "Therapist",
    resources: [
      { id: "r1", name: "Alex Morgan", description: null, kind: "person" },
      { id: "r2", name: "Jordan Casey", description: null, kind: "person" },
    ],
  },
  questions: [
    {
      id: "q1",
      label: "What would you like help with?",
      helpText: null,
      kind: "textarea",
      options: [],
      required: true,
      sensitive: true,
      sortOrder: 1,
    },
  ],
};

export const massage: PublicService = {
  ...base,
  id: "s2",
  name: "Sports massage",
  category: "Massage",
  sortOrder: 2,
  priceCents: 4000,
  paymentMode: "deposit",
  depositCents: 1500,
  options: [
    { id: "o1", name: "30 minutes", description: null, durationMinutes: 30, priceCents: 4000, sortOrder: 1 },
    { id: "o2", name: "60 minutes", description: null, durationMinutes: 60, priceCents: 7000, sortOrder: 2 },
  ],
  addons: [
    { id: "a1", name: "Cupping", description: null, extraMinutes: 10, priceCents: 1000, sortOrder: 1 },
  ],
};

export const consult: PublicService = {
  ...base,
  id: "s3",
  name: "Phone consult",
  durationMinutes: 15,
  priceCents: 0,
  paymentMode: "free",
  sortOrder: 3,
};

export function managedBooking(overrides: Partial<ManagedBooking> = {}): ManagedBooking {
  return {
    id: "bk1",
    reference: "BA-7K3F9Q",
    status: "confirmed",
    paymentStatus: "paid",
    start: "2026-10-08T10:00:00+01:00",
    end: "2026-10-08T11:00:00+01:00",
    timezone: "Europe/Dublin",
    business: {
      id: business.id,
      slug: business.slug,
      name: business.name,
      branding: business.branding,
      contactEmail: business.contactEmail,
      contactPhone: business.contactPhone,
      address: business.address,
    },
    service: { id: "s1", name: "Initial assessment" },
    option: null,
    addons: [],
    resources: [{ id: "r1", name: "Alex Morgan", kind: "person" }],
    priceCents: 7000,
    depositCents: null,
    amountPaidCents: 7000,
    amountPaidInPersonCents: 0,
    amountRefundedCents: 0,
    currency: "EUR",
    holdExpiresAt: null,
    canCancel: true,
    canReschedule: true,
    refundPreview: {
      amountCents: 7000,
      reason: "Cancelled at least 24 hours before the start: full refund.",
    },
    customer: { name: "Alex Morgan", email: "alex.morgan@example.com", phone: null },
    ...overrides,
  };
}
