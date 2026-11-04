/** API types: Sites (§15). Import them from `@/lib/api/types`. */
import type { AiCredits } from "../ai-types";

export type SiteThemeKey = "clinical" | "calm" | "bold" | "playful" | "editorial" | "minimal";
export type SiteSectionType =
  "hero" | "services" | "team" | "about" | "gallery" | "testimonials" | "faq" | "hours" | "cta" | "contact";
export type GeneratedPattern = "aurora" | "mesh" | "waves" | "grid" | "dots" | "rays";

export type SiteImage = {
  kind: "upload" | "stock" | "generated";
  /** upload: our storage URL for this business; stock: images.unsplash.com; generated: null. */
  url: string | null;
  alt: string;
  /** Generated backgrounds only (drawn from the palette). */
  pattern: GeneratedPattern | null;
  /** Stock photos only: the photographer and their Unsplash profile. */
  attribution: { name: string; url: string } | null;
};

export type HeroVariant = "split" | "cover" | "minimal";
export type HeroContent = {
  variant: HeroVariant;
  eyebrow: string | null;
  headline: string;
  subheadline: string | null;
  ctaLabel: string | null;
  image: SiteImage | null;
};
export type ServicesContent = {
  heading: string;
  intro: string | null;
  /** Real service ids in display order; [] = all public services. */
  serviceIds: string[];
  showPrices: boolean;
  showDurations: boolean;
};
export type TeamMemberContent = { resourceId: string; bio: string | null; photo: SiteImage | null };
export type TeamContent = { heading: string; intro: string | null; members: TeamMemberContent[] };
export type AboutContent = { heading: string; body: string; highlights: string[]; image: SiteImage | null };
export type GalleryContent = { heading: string | null; images: SiteImage[] };
export type Testimonial = { quote: string; author: string; detail: string | null };
export type TestimonialsContent = { heading: string; items: Testimonial[] };
export type FaqItem = { question: string; answer: string };
export type FaqContent = { heading: string; items: FaqItem[] };
export type HoursContent = {
  heading: string;
  note: string | null;
  showAddress: boolean;
  showMapLink: boolean;
};
export type CtaContent = { headline: string; body: string | null; buttonLabel: string };
export type ContactContent = {
  heading: string;
  body: string | null;
  showPhone: boolean;
  showEmail: boolean;
  showAddress: boolean;
};

export type SectionContentMap = {
  hero: HeroContent;
  services: ServicesContent;
  team: TeamContent;
  about: AboutContent;
  gallery: GalleryContent;
  testimonials: TestimonialsContent;
  faq: FaqContent;
  hours: HoursContent;
  cta: CtaContent;
  contact: ContactContent;
};

/** A section of a given type (discriminated on `type`). */
export type SiteSectionOf<T extends SiteSectionType> = {
  id: string;
  type: T;
  enabled: boolean;
  content: SectionContentMap[T];
};
export type SiteSection = { [T in SiteSectionType]: SiteSectionOf<T> }[SiteSectionType];

export type SitePalette = { primaryColor: string; accent: string | null };
export type SiteSeo = { title: string | null; description: string | null };

export type SitePlan = {
  theme: SiteThemeKey;
  palette: SitePalette;
  seo: SiteSeo;
  sections: SiteSection[];
};

export type OpeningHoursDay = { dayOfWeek: number; intervals: { start: string; end: string }[] };
export type SiteContext = {
  /** Active person resources, in sort order. */
  team: { id: string; name: string; description: string | null }[];
  /** Mon..Sun; empty intervals = closed. */
  openingHours: OpeningHoursDay[];
};

export type PublicSite = { plan: SitePlan; isDefault: boolean; context: SiteContext };

export type SiteAiStatus = {
  /** An AI model is configured (otherwise the deterministic designer is used, free and unlimited). */
  model: boolean;
  /** The business's AI credits this month, shared by every AI feature. */
  credits: AiCredits;
};

/** `GET /site` */
export type SiteState = {
  draft: SitePlan;
  /** null = never saved (the draft is the default plan). */
  draftVersion: number | null;
  published: SitePlan | null;
  publishedVersion: number | null;
  publishedAt: string | null;
  updatedAt: string | null;
  hasUnpublishedChanges: boolean;
  context: SiteContext;
  ai: SiteAiStatus;
  stock: { enabled: boolean };
  uploads: { enabled: boolean; maxBytes: number };
};

export type SiteVersionSource = "owner" | "ai_generate" | "ai_edit" | "restore" | "template" | "seed";
export type SiteVersion = {
  version: number;
  source: SiteVersionSource;
  instruction: string | null;
  changes: string[];
  actorType: string;
  actorName: string | null;
  createdAt: string;
  isPublished: boolean;
  isDraft: boolean;
};
export type SiteVersionDetail = SiteVersion & { plan: SitePlan };

export type SaveSiteInput = { plan: SitePlan; baseVersion?: number | null };
export type GenerateSiteInput = { prompt?: string; websiteUrl?: string };
export type EditSiteInput = { instruction: string; baseVersion?: number | null };

/** `POST /site/generate`, `POST /site/edit` */
export type SiteAiResult = {
  state: SiteState;
  source: "ai" | "template";
  changes: string[];
  /** The draft version before this change (undo restores it). */
  previousVersion: number | null;
  /** Set when nothing changed or a fallback was used. */
  message: string | null;
};

export type StockPhoto = {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  color: string | null;
  alt: string;
  attribution: { name: string; url: string };
  downloadLocation: string;
};
export type StockSearchResult = { enabled: boolean; results: StockPhoto[] };

/** `POST /uploads` */
export type Upload = {
  url: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  bytes: number;
  width: number;
  height: number;
};
