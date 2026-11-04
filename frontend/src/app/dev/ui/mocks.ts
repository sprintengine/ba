import type { Membership, PublicBusiness } from "@/lib/api/types";

/** Mock data for /dev/ui shell previews only. */
/** The business the dashboard preview shows. */
export const MOCK_MEMBERSHIP: Membership = {
  businessId: "b1",
  slug: "lumen-physio",
  name: "Lumen Physiotherapy",
  role: "owner",
  branding: { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null },
};

export const MOCK_MEMBERSHIPS: Membership[] = [
  MOCK_MEMBERSHIP,
  {
    businessId: "b2",
    slug: "gleam-car-wash",
    name: "Gleam Car Wash",
    role: "admin",
    branding: { primaryColor: "#1d4ed8", logoUrl: null, coverImageUrl: null },
  },
  {
    businessId: "b3",
    slug: "cadence-music",
    name: "Cadence Music Studio",
    role: "staff",
    branding: { primaryColor: "#be185d", logoUrl: null, coverImageUrl: null },
  },
];

export const MOCK_PUBLIC_BUSINESS: PublicBusiness = {
  id: "b3",
  slug: "cadence-music",
  name: "Cadence Music Studio",
  description: "Piano, guitar and voice lessons for all ages in Galway city. Trial lessons are free.",
  industry: "music_lessons",
  timezone: "Europe/Dublin",
  currency: "EUR",
  locale: "en-IE",
  contactEmail: "hello@trebleclef.ie",
  contactPhone: "+353 91 555 0142",
  websiteUrl: null,
  address: { line1: "12 Example Street", line2: null, city: "Galway", postcode: "H91 X2Y3" },
  branding: { primaryColor: "#be185d", logoUrl: null, coverImageUrl: null },
  vocabulary: {
    resource: "teacher",
    resources: "teachers",
    customer: "student",
    customers: "students",
    booking: "lesson",
    bookings: "lessons",
  },
  policies: {
    minNoticeMinutes: 60,
    maxAdvanceDays: 60,
    cancellationNoticeHours: 24,
    lateCancellationRefundPercent: 0,
    allowCustomerCancel: true,
    allowCustomerReschedule: true,
    holdMinutes: 30,
    requireCustomerPhone: false,
    nextAvailableOnly: false,
  },
  customerGroups: [
    { id: "g1", name: "New students", description: null },
    { id: "g2", name: "Existing students", description: null },
  ],
  paymentsEnabled: true,
  showBadge: true,
};
