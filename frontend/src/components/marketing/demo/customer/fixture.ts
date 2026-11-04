/**
 * Lumen Physiotherapy as the public API serves it (`/v1/public/businesses/lumen-physio`, its services and deals),
 * captured from the demo seed and trimmed to what the customer demo shows. Dressed in the Prism brand rather than the
 * seed's teal and Calm style, so the demo matches the landing around it.
 */
import type { Policies, PublicOffer, PublicService, SitePalette, SiteThemeKey } from "@/lib/api/types";
import type { SiteBusiness } from "@/components/site/site-render-context";
import { LUMEN_TIMEZONE } from "./state";

export const LUMEN: SiteBusiness = {
  id: "becb482a-4a01-48aa-b8b5-0038af4d1475",
  slug: "lumen-physio",
  name: "Lumen Physiotherapy",
  description:
    "Evidence-based physiotherapy for sports injuries, back and neck pain, and post-surgery rehabilitation.",
  timezone: LUMEN_TIMEZONE,
  currency: "EUR",
  locale: "en-IE",
  contactEmail: "hello@lumen-physio.test",
  contactPhone: "+353 1 555 0101",
  address: { line1: "Unit 4, Lantern Quay", line2: null, city: "Dublin", postcode: "D02 XY01" },
  branding: { primaryColor: "#5b4ae0", logoUrl: null, coverImageUrl: null },
  vocabulary: {
    resource: "Therapist",
    resources: "Therapists",
    customer: "Client",
    customers: "Clients",
    booking: "Appointment",
    bookings: "Appointments",
  },
  showBadge: false,
};

export const LUMEN_POLICIES: Policies = {
  minNoticeMinutes: 120,
  maxAdvanceDays: 60,
  cancellationNoticeHours: 24,
  lateCancellationRefundPercent: 50,
  allowCustomerCancel: true,
  allowCustomerReschedule: true,
  holdMinutes: 30,
  requireCustomerPhone: true,
  nextAvailableOnly: false,
};

export const LUMEN_SERVICES: PublicService[] = [
  {
    id: "604bdd21-f40a-4570-8f06-0d43056bd60f",
    name: "Initial assessment",
    description:
      "A full assessment of your injury or pain, a clear diagnosis and a treatment plan. Your first visit.",
    category: "Physiotherapy",
    color: "#5b4ae0",
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 10,
    slotIntervalMinutes: 30,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    priceCents: 7000,
    paymentMode: "full",
    depositCents: null,
    allowPayAtVenue: false,
    requiresApproval: false,
    locationType: "business",
    sortOrder: 0,
    options: [],
    addons: [],
    allowedGroupIds: [],
    selectableRequirement: {
      id: "4740b0d1-11f7-4afd-8417-75ec3aa05049",
      label: "Therapist",
      resources: [
        {
          id: "429b9ed1-58de-4c15-ac08-820e3cb78d1d",
          name: "Sam Rivers",
          description: "Chartered physiotherapist. Special interest in running injuries and knee rehab.",
          kind: "person",
        },
        {
          id: "fb774403-4c8e-4792-bdd5-c7c3f3e4f889",
          name: "Casey Lane",
          description: "Physiotherapist and sports massage therapist. Works with field-sport athletes.",
          kind: "person",
        },
      ],
    },
    questions: [
      {
        id: "e11b70cd-9947-4fb3-ba09-34ddae08790d",
        label: "What would you like help with?",
        helpText: "A short description of your injury or symptoms. Only your therapist will see this.",
        kind: "textarea",
        options: [],
        required: true,
        sensitive: true,
        sortOrder: 0,
      },
      {
        id: "3c157cc5-476b-4254-9ef7-066274897618",
        label: "Have you had surgery on this area in the last 12 months?",
        helpText: null,
        kind: "select",
        options: ["No", "Yes"],
        required: true,
        sensitive: true,
        sortOrder: 1,
      },
      {
        id: "303c658a-eccb-43ed-9c0b-bd93f3298747",
        label: "How did you hear about us?",
        helpText: null,
        kind: "select",
        options: ["Search engine", "Friend or family", "GP or consultant referral", "Sports club", "Other"],
        required: false,
        sensitive: false,
        sortOrder: 2,
      },
    ],
  },
  {
    id: "fe0be0c1-ad6d-424c-ac17-b32f86d2bdb6",
    name: "Follow-up treatment",
    description: "Hands-on treatment and exercise progression for existing clients.",
    category: "Physiotherapy",
    color: "#a99bff",
    durationMinutes: 45,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 5,
    slotIntervalMinutes: 15,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    priceCents: 6000,
    paymentMode: "full",
    depositCents: null,
    allowPayAtVenue: false,
    requiresApproval: false,
    locationType: "business",
    sortOrder: 1,
    options: [],
    addons: [],
    allowedGroupIds: [],
    selectableRequirement: {
      id: "e6e217df-7023-4c5c-a577-662732ca6c61",
      label: "Therapist",
      resources: [
        {
          id: "429b9ed1-58de-4c15-ac08-820e3cb78d1d",
          name: "Sam Rivers",
          description: "Chartered physiotherapist. Special interest in running injuries and knee rehab.",
          kind: "person",
        },
        {
          id: "fb774403-4c8e-4792-bdd5-c7c3f3e4f889",
          name: "Casey Lane",
          description: "Physiotherapist and sports massage therapist. Works with field-sport athletes.",
          kind: "person",
        },
      ],
    },
    questions: [
      {
        id: "e11b70cd-9947-4fb3-ba09-34ddae08790d",
        label: "What would you like help with?",
        helpText: "A short description of your injury or symptoms. Only your therapist will see this.",
        kind: "textarea",
        options: [],
        required: true,
        sensitive: true,
        sortOrder: 0,
      },
      {
        id: "303c658a-eccb-43ed-9c0b-bd93f3298747",
        label: "How did you hear about us?",
        helpText: null,
        kind: "select",
        options: ["Search engine", "Friend or family", "GP or consultant referral", "Sports club", "Other"],
        required: false,
        sensitive: false,
        sortOrder: 2,
      },
    ],
  },
  {
    id: "8131abcd-3026-49e5-ac6e-7cbe5d443561",
    name: "Sports massage",
    description: "Deep tissue sports massage to aid recovery and reduce muscle tension.",
    category: "Massage",
    color: "#0ea5e9",
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 5,
    slotIntervalMinutes: 15,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    priceCents: 4000,
    paymentMode: "full",
    depositCents: null,
    allowPayAtVenue: false,
    requiresApproval: false,
    locationType: "business",
    sortOrder: 2,
    options: [
      {
        id: "9dd3d0f7-d89f-463b-8030-1ae96a5a1f5a",
        name: "30 minutes",
        description: null,
        durationMinutes: 30,
        priceCents: 4000,
        sortOrder: 0,
      },
      {
        id: "53ec462c-0b72-4714-9de8-dd0306060a02",
        name: "60 minutes",
        description: null,
        durationMinutes: 60,
        priceCents: 6500,
        sortOrder: 1,
      },
    ],
    addons: [],
    allowedGroupIds: [],
    selectableRequirement: {
      id: "ed6b5b9b-2682-4b71-a344-f656d2e26a88",
      label: "Therapist",
      resources: [
        {
          id: "429b9ed1-58de-4c15-ac08-820e3cb78d1d",
          name: "Sam Rivers",
          description: "Chartered physiotherapist. Special interest in running injuries and knee rehab.",
          kind: "person",
        },
        {
          id: "fb774403-4c8e-4792-bdd5-c7c3f3e4f889",
          name: "Casey Lane",
          description: "Physiotherapist and sports massage therapist. Works with field-sport athletes.",
          kind: "person",
        },
      ],
    },
    questions: [
      {
        id: "e11b70cd-9947-4fb3-ba09-34ddae08790d",
        label: "What would you like help with?",
        helpText: "A short description of your injury or symptoms. Only your therapist will see this.",
        kind: "textarea",
        options: [],
        required: true,
        sensitive: true,
        sortOrder: 0,
      },
      {
        id: "303c658a-eccb-43ed-9c0b-bd93f3298747",
        label: "How did you hear about us?",
        helpText: null,
        kind: "select",
        options: ["Search engine", "Friend or family", "GP or consultant referral", "Sports club", "Other"],
        required: false,
        sensitive: false,
        sortOrder: 2,
      },
    ],
  },
];

/**
 * The booking pages' look: the portal style and colour (`branding.portalStyle`, `primaryColor`), as the Prism brand
 * rather than the seed's teal and Calm.
 */
export const LUMEN_STYLE: { theme: SiteThemeKey; palette: SitePalette } = {
  theme: "minimal",
  palette: { primaryColor: "#5b4ae0", accent: null },
};

/** The clinic's live deal (`/v1/public/businesses/lumen-physio/offers`), shown above the booking flow. */
export const LUMEN_OFFERS: PublicOffer[] = [
  {
    id: "f3bd9f02-73fc-4dd9-96b2-b7b8c760503c",
    name: "Last-minute physio",
    description: "A therapist had a cancellation? Grab the slot for less.",
    kind: "last_minute",
    discount: { type: "fixed", amountCents: 1500 },
    label: "€15 off",
    summary: "Starting within 24 hours",
    serviceIds: ["8131abcd-3026-49e5-ac6e-7cbe5d443561", "fe0be0c1-ad6d-424c-ac17-b32f86d2bdb6"],
    validUntil: null,
  },
];
