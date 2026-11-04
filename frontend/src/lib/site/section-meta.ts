/**
 * The section registry without schemas: per section type its label, nav label, defaults for a newly added
 * section and whether it has anything to show publicly. This is all the public site needs, so it carries no
 * zod; `sections.ts` adds each type's schema for the editor and plan validation,
 * `components/site/section-renderers.tsx` the renderer and `components/dashboard/site/section-editors.tsx` the
 * editor form.
 */
import type {
  GeneratedPattern,
  PublicService,
  SectionContentMap,
  SiteContext,
  SiteSection,
  SiteSectionOf,
  SiteSectionType,
} from "@/lib/api/types";
import { generatedImage } from "./images";
import { resolveServices, resolveTeam } from "./plan";

/** Live data a section may need to decide whether it is worth showing. */
export type SectionData = {
  services: PublicService[];
  context: SiteContext;
  hasContactDetails: boolean;
  hasAddress: boolean;
};

export type DefaultsInput = { businessName: string; pattern: GeneratedPattern; bookingNoun: string };

export type SectionMeta<T extends SiteSectionType> = {
  type: T;
  label: string;
  description: string;
  /** Header navigation label; null = not in the nav. */
  navLabel: string | null;
  /** Only one allowed per plan. */
  single?: boolean;
  defaults: (input: DefaultsInput) => SectionContentMap[T];
  hasContent: (content: SectionContentMap[T], data: SectionData) => boolean;
};

type MetaRegistry = { [T in SiteSectionType]: SectionMeta<T> };

const always = () => true;

export const SECTION_META: MetaRegistry = {
  hero: {
    type: "hero",
    label: "Hero",
    description: "Headline, intro and the main Book button.",
    navLabel: null,
    single: true,
    defaults: ({ businessName, pattern, bookingNoun }) => ({
      variant: "split",
      eyebrow: null,
      headline: businessName,
      subheadline: `Book your next ${bookingNoun} online in a minute.`,
      ctaLabel: "Book now",
      image: generatedImage(pattern),
    }),
    hasContent: always,
  },
  services: {
    type: "services",
    label: "Services",
    description: "Your live services with prices and durations.",
    navLabel: "Services",
    defaults: () => ({
      heading: "Services",
      intro: null,
      serviceIds: [],
      showPrices: true,
      showDurations: true,
    }),
    hasContent: (c, d) => resolveServices(c.serviceIds, d.services).length > 0,
  },
  team: {
    type: "team",
    label: "Team",
    description: "The people customers can book, with short bios.",
    navLabel: "Team",
    defaults: () => ({ heading: "Meet the team", intro: null, members: [] }),
    hasContent: (c, d) => resolveTeam(c.members, d.context).length > 0,
  },
  about: {
    type: "about",
    label: "About",
    description: "Your story and what makes you different.",
    navLabel: "About",
    defaults: ({ businessName }) => ({
      heading: `About ${businessName}`,
      body: "",
      highlights: [],
      image: null,
    }),
    hasContent: (c) => c.body.trim().length > 0,
  },
  gallery: {
    type: "gallery",
    label: "Gallery",
    description: "Photos of your place and your work.",
    navLabel: "Gallery",
    defaults: () => ({ heading: "Gallery", images: [] }),
    hasContent: (c) => c.images.length > 0,
  },
  testimonials: {
    type: "testimonials",
    label: "Testimonials",
    description: "Kind words from real customers. Hidden until you add one.",
    navLabel: "Reviews",
    defaults: () => ({ heading: "What people say", items: [] }),
    hasContent: (c) => c.items.length > 0,
  },
  faq: {
    type: "faq",
    label: "FAQ",
    description: "Answers to common questions.",
    navLabel: "FAQ",
    defaults: () => ({ heading: "Questions and answers", items: [] }),
    hasContent: (c) => c.items.length > 0,
  },
  hours: {
    type: "hours",
    label: "Hours & location",
    description: "Opening hours and address, from your settings.",
    navLabel: "Visit",
    defaults: () => ({ heading: "Opening hours", note: null, showAddress: true, showMapLink: true }),
    hasContent: (_c, d) => d.context.openingHours.some((day) => day.intervals.length > 0) || d.hasAddress,
  },
  cta: {
    type: "cta",
    label: "Call to action",
    description: "A bold prompt to book.",
    navLabel: null,
    defaults: ({ bookingNoun }) => ({
      headline: `Ready to book your ${bookingNoun}?`,
      body: null,
      buttonLabel: "Book now",
    }),
    hasContent: always,
  },
  contact: {
    type: "contact",
    label: "Contact",
    description: "Phone, email and address.",
    navLabel: "Contact",
    defaults: () => ({
      heading: "Get in touch",
      body: null,
      showPhone: true,
      showEmail: true,
      showAddress: true,
    }),
    hasContent: (_c, d) => d.hasContactDetails,
  },
};

export const SECTION_TYPES = Object.keys(SECTION_META) as SiteSectionType[];

export function sectionMeta<T extends SiteSectionType>(type: T): SectionMeta<T> {
  return SECTION_META[type];
}

/** Calls `fn` with the section and its metadata, typed together (one narrowing point). */
export function withMeta<R>(
  section: SiteSection,
  fn: <T extends SiteSectionType>(meta: SectionMeta<T>, section: SiteSectionOf<T>) => R,
): R {
  return fn(sectionMeta(section.type), section as SiteSectionOf<typeof section.type>);
}

/** Does the section have anything to show on the public page? (Empty ones are hidden there.) */
export function sectionHasContent(section: SiteSection, data: SectionData): boolean {
  return withMeta(section, (meta, s) => meta.hasContent(s.content, data));
}
