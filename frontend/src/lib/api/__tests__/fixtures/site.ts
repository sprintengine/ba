/** Site fixtures (§15): a plan with one section of every type, the public site and the editor's state. */
import type {
  AiCredits,
  PublicSite,
  SiteContext,
  SitePlan,
  SiteState,
  SiteVersion,
  SiteVersionDetail,
  StockPhoto,
  Upload,
} from "@/lib/api/types";
import { ids } from "./ids";

export const sitePlan = {
  theme: "calm",
  palette: { primaryColor: "#0e7c70", accent: "#c2410c" },
  seo: { title: "Lumen Physiotherapy, Dublin", description: "Sports injuries and rehab in Dublin 2." },
  sections: [
    {
      id: "hero",
      type: "hero",
      enabled: true,
      content: {
        variant: "split",
        eyebrow: "Physiotherapy in Dublin 2",
        headline: "Move without pain",
        subheadline: "Assessment and treatment for sports injuries.",
        ctaLabel: "Book an assessment",
        image: {
          kind: "stock",
          url: "https://images.unsplash.com/photo-1",
          alt: "A physiotherapist treating a knee",
          pattern: null,
          attribution: { name: "Ana Photo", url: "https://unsplash.com/@ana" },
        },
      },
    },
    {
      id: "services",
      type: "services",
      enabled: true,
      content: {
        heading: "Treatments",
        intro: "Every visit starts with a conversation.",
        serviceIds: [ids.service],
        showPrices: true,
        showDurations: true,
      },
    },
    {
      id: "team",
      type: "team",
      enabled: true,
      content: {
        heading: "Our team",
        intro: null,
        members: [{ resourceId: ids.resource, bio: "Sports physio.", photo: null }],
      },
    },
    {
      id: "about",
      type: "about",
      enabled: true,
      content: {
        heading: "About us",
        body: "A small clinic by the canal.",
        highlights: ["Evening appointments"],
        image: { kind: "generated", url: null, alt: "", pattern: "waves", attribution: null },
      },
    },
    {
      id: "gallery",
      type: "gallery",
      enabled: false,
      content: {
        heading: "The clinic",
        images: [
          {
            kind: "upload",
            url: "https://cdn.bookanything.test/b/1.webp",
            alt: "Treatment room",
            pattern: null,
            attribution: null,
          },
        ],
      },
    },
    {
      id: "testimonials",
      type: "testimonials",
      enabled: true,
      content: {
        heading: "What clients say",
        items: [{ quote: "Back running.", author: "Sam", detail: null }],
      },
    },
    {
      id: "faq",
      type: "faq",
      enabled: true,
      content: { heading: "Questions", items: [{ question: "Do I need a referral?", answer: "No." }] },
    },
    {
      id: "hours",
      type: "hours",
      enabled: true,
      content: { heading: "Opening hours", note: null, showAddress: true, showMapLink: true },
    },
    {
      id: "cta",
      type: "cta",
      enabled: true,
      content: { headline: "Ready when you are", body: null, buttonLabel: "Book now" },
    },
    {
      id: "contact",
      type: "contact",
      enabled: true,
      content: { heading: "Contact", body: null, showPhone: true, showEmail: true, showAddress: false },
    },
  ],
} satisfies SitePlan;

/** Every nullable plan field null (nothing chosen yet, no images). */
export const sitePlanSparse = {
  theme: "minimal",
  palette: { primaryColor: "#0e7c70", accent: null },
  seo: { title: null, description: null },
  sections: [
    {
      id: "hero",
      type: "hero",
      enabled: true,
      content: {
        variant: "minimal",
        eyebrow: null,
        headline: "Lumen Physiotherapy",
        subheadline: null,
        ctaLabel: null,
        image: null,
      },
    },
    {
      id: "services",
      type: "services",
      enabled: true,
      content: { heading: "Services", intro: null, serviceIds: [], showPrices: false, showDurations: false },
    },
    {
      id: "team",
      type: "team",
      enabled: true,
      content: {
        heading: "Team",
        intro: null,
        members: [{ resourceId: ids.resource, bio: null, photo: null }],
      },
    },
    {
      id: "about",
      type: "about",
      enabled: true,
      content: { heading: "About", body: "A small clinic.", highlights: [], image: null },
    },
    {
      id: "gallery",
      type: "gallery",
      enabled: true,
      content: {
        heading: null,
        images: [{ kind: "generated", url: null, alt: "", pattern: null, attribution: null }],
      },
    },
    {
      id: "testimonials",
      type: "testimonials",
      enabled: true,
      content: { heading: "Reviews", items: [{ quote: "Great.", author: "Sam", detail: null }] },
    },
    {
      id: "hours",
      type: "hours",
      enabled: true,
      content: { heading: "Hours", note: null, showAddress: false, showMapLink: false },
    },
    {
      id: "cta",
      type: "cta",
      enabled: true,
      content: { headline: "Book today", body: null, buttonLabel: "Book" },
    },
    {
      id: "contact",
      type: "contact",
      enabled: true,
      content: { heading: "Contact", body: null, showPhone: false, showEmail: false, showAddress: false },
    },
  ],
} satisfies SitePlan;

export const siteContext = {
  team: [{ id: ids.resource, name: "Alex Morgan", description: "Senior physiotherapist" }],
  openingHours: [
    { dayOfWeek: 1, intervals: [{ start: "09:00", end: "17:30" }] },
    { dayOfWeek: 2, intervals: [] },
  ],
} satisfies SiteContext;

const siteContextSparse = {
  team: [{ id: ids.resource, name: "Alex Morgan", description: null }],
  openingHours: [],
} satisfies SiteContext;

export const publicSite = { plan: sitePlan, isDefault: false, context: siteContext } satisfies PublicSite;

export const aiCredits = {
  limit: 500,
  used: 120.5,
  remaining: 379.5,
  runningLow: false,
  limitReached: false,
  resetsOn: "2026-11-01",
  overage: false,
} satisfies AiCredits;

export const siteState = {
  draft: sitePlan,
  draftVersion: 4,
  published: sitePlan,
  publishedVersion: 3,
  publishedAt: "2026-09-20T10:00:00Z",
  updatedAt: "2026-09-21T08:30:00Z",
  hasUnpublishedChanges: true,
  context: siteContext,
  ai: { model: true, credits: aiCredits },
  stock: { enabled: true },
  uploads: { enabled: true, maxBytes: 5_242_880 },
} satisfies SiteState;

/** A business that never saved or published its site. */
export const siteStateSparse = {
  ...siteState,
  draft: sitePlanSparse,
  context: siteContextSparse,
  draftVersion: null,
  published: null,
  publishedVersion: null,
  publishedAt: null,
  updatedAt: null,
  hasUnpublishedChanges: false,
} satisfies SiteState;

export const siteVersion = {
  version: 4,
  source: "ai_edit",
  instruction: "Make the hero warmer",
  changes: ["Hero: new headline"],
  actorType: "member",
  actorName: "Avery Morgan",
  createdAt: "2026-09-21T08:30:00Z",
  isPublished: false,
  isDraft: true,
} satisfies SiteVersion;

export const siteVersionSparse = {
  ...siteVersion,
  source: "seed",
  instruction: null,
  actorType: "system",
  actorName: null,
} satisfies SiteVersion;

export const siteVersionDetail = { ...siteVersion, plan: sitePlan } satisfies SiteVersionDetail;

export const stockPhoto = {
  id: "Yk3mA1",
  url: "https://images.unsplash.com/photo-1",
  thumbUrl: "https://images.unsplash.com/photo-1?w=400",
  width: 4000,
  height: 3000,
  color: "#d9c8b4",
  alt: "A treatment room",
  attribution: { name: "Ana Photo", url: "https://unsplash.com/@ana" },
  downloadLocation: "https://api.unsplash.com/photos/Yk3mA1/download",
} satisfies StockPhoto;

export const stockPhotoSparse = { ...stockPhoto, color: null } satisfies StockPhoto;

export const upload = {
  url: "https://cdn.bookanything.test/b/1.webp",
  contentType: "image/webp",
  bytes: 120_000,
  width: 1600,
  height: 900,
} satisfies Upload;
