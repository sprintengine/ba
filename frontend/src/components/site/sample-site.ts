/**
 * A fictional sample business and site plan, for the /dev/ui site gallery and component tests.
 * Every name is invented.
 */
import type { PublicService, SiteContext, SitePlan, SiteThemeKey } from "@/lib/api/types";
import { generatedImage } from "@/lib/site/images";
import { siteTheme } from "@/lib/site/themes";
import type { SiteBusiness } from "./site-render-context";

export const SAMPLE_BUSINESS: SiteBusiness = {
  id: "sample-business",
  slug: "harbour-lane-studio",
  name: "Harbour Lane Studio",
  description: "A small, friendly studio on Harbour Lane. Book online in a minute.",
  timezone: "Europe/Dublin",
  currency: "EUR",
  locale: "en-IE",
  contactEmail: "hello@harbour-lane.test",
  contactPhone: "+353 1 555 0199",
  address: { line1: "4 Harbour Lane", line2: null, city: "Dublin", postcode: "D02 XY99" },
  branding: { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null },
  vocabulary: {
    resource: "Specialist",
    resources: "Specialists",
    customer: "Client",
    customers: "Clients",
    booking: "Appointment",
    bookings: "Appointments",
  },
  showBadge: true,
};

function service(
  id: string,
  name: string,
  description: string | null,
  minutes: number,
  cents: number,
  sortOrder: number,
  options: [string, number, number][] = [],
): PublicService {
  return {
    id,
    name,
    description,
    category: null,
    color: "#0e7c70",
    durationMinutes: minutes,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    slotIntervalMinutes: null,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    priceCents: cents,
    paymentMode: cents > 0 ? "full" : "free",
    depositCents: null,
    allowPayAtVenue: false,
    requiresApproval: false,
    locationType: "business",
    sortOrder,
    options: options.map(([n, m, c], i) => ({
      id: `${id}-o${i}`,
      name: n,
      description: null,
      durationMinutes: m,
      priceCents: c,
      sortOrder: i,
    })),
    addons: [],
    allowedGroupIds: [],
    selectableRequirement: null,
    questions: [],
  };
}

export const SAMPLE_SERVICES: PublicService[] = [
  service(
    "svc-intro",
    "First visit",
    "A relaxed first session to understand what you need and plan next steps.",
    60,
    7000,
    0,
  ),
  service("svc-follow", "Follow-up session", "Continue your plan with a focused follow-up.", 45, 5500, 1),
  service("svc-short", "Short session", null, 30, 4000, 2, [
    ["30 minutes", 30, 4000],
    ["60 minutes", 60, 7000],
  ]),
  service("svc-chat", "Free intro call", "Ten minutes to see whether we're the right fit.", 10, 0, 3),
];

export const SAMPLE_CONTEXT: SiteContext = {
  team: [
    { id: "res-1", name: "Robin Vale", description: "Works with clients of every age and pace." },
    { id: "res-2", name: "Sam Ashby", description: "Loves a clear plan and a good playlist." },
    { id: "res-3", name: "Jules Moreno", description: null },
  ],
  openingHours: [
    { dayOfWeek: 1, intervals: [{ start: "09:00", end: "18:00" }] },
    { dayOfWeek: 2, intervals: [{ start: "09:00", end: "18:00" }] },
    {
      dayOfWeek: 3,
      intervals: [
        { start: "09:00", end: "13:00" },
        { start: "14:00", end: "20:00" },
      ],
    },
    { dayOfWeek: 4, intervals: [{ start: "09:00", end: "18:00" }] },
    { dayOfWeek: 5, intervals: [{ start: "09:00", end: "17:00" }] },
    { dayOfWeek: 6, intervals: [{ start: "10:00", end: "14:00" }] },
    { dayOfWeek: 7, intervals: [] },
  ],
};

/** A full plan in the given theme with every section type. */
export function samplePlan(theme: SiteThemeKey = "calm", primaryColor = "#0e7c70"): SitePlan {
  const t = siteTheme(theme);
  return {
    theme,
    palette: { primaryColor, accent: null },
    seo: {
      title: "Harbour Lane Studio · Dublin",
      description: "Book online with Harbour Lane Studio in Dublin.",
    },
    sections: [
      {
        id: "hero",
        type: "hero",
        enabled: true,
        content: {
          variant: t.defaultHero,
          eyebrow: "Dublin 2 · Book online",
          headline: "Feel at home from the first visit",
          subheadline:
            "Friendly, unhurried appointments on Harbour Lane. Pick a time that suits you and you're booked.",
          ctaLabel: "Book now",
          image: generatedImage(t.defaultPattern),
        },
      },
      {
        id: "services",
        type: "services",
        enabled: true,
        content: {
          heading: "Services",
          intro: "Clear prices and times. Choose one to see live availability.",
          serviceIds: [],
          showPrices: true,
          showDurations: true,
        },
      },
      {
        id: "about",
        type: "about",
        enabled: true,
        content: {
          heading: "About the studio",
          body: "We opened on Harbour Lane to make booking simple and visits calm.\n\nEvery appointment starts with a proper conversation, and you always know the price before you book.",
          highlights: [
            "Evening appointments",
            "Online booking any time",
            "Step-free access",
            "Card payments",
          ],
          image: null,
        },
      },
      {
        id: "team",
        type: "team",
        enabled: true,
        content: { heading: "Meet the team", intro: null, members: [] },
      },
      {
        id: "testimonials",
        type: "testimonials",
        enabled: true,
        content: {
          heading: "What people say",
          items: [
            {
              quote: "Booking took a minute and the visit was lovely.",
              author: "Demo customer",
              detail: "Sample review",
            },
            {
              quote: "Clear, kind and on time. I'll be back.",
              author: "Demo customer",
              detail: "Sample review",
            },
          ],
        },
      },
      {
        id: "faq",
        type: "faq",
        enabled: true,
        content: {
          heading: "Questions and answers",
          items: [
            {
              question: "How do I book?",
              answer: "Choose a service, pick a time and confirm. You'll get an email straight away.",
            },
            {
              question: "Can I cancel or reschedule?",
              answer: "Yes, online, up to 24 hours before your appointment.",
            },
          ],
        },
      },
      {
        id: "hours",
        type: "hours",
        enabled: true,
        content: { heading: "Opening hours", note: null, showAddress: true, showMapLink: true },
      },
      { id: "gallery", type: "gallery", enabled: false, content: { heading: "Gallery", images: [] } },
      {
        id: "cta",
        type: "cta",
        enabled: true,
        content: {
          headline: "Ready when you are",
          body: "Pick a time that suits you. It takes about a minute.",
          buttonLabel: "Book now",
        },
      },
      {
        id: "contact",
        type: "contact",
        enabled: true,
        content: { heading: "Get in touch", body: null, showPhone: true, showEmail: true, showAddress: true },
      },
    ],
  };
}
