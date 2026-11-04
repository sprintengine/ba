/**
 * Zod schemas mirroring the backend site-plan validator (§15.3–15.4): the same fields, enums and
 * length limits, strict objects (unknown fields are errors). Editor forms validate with these, so
 * owners see problems before saving; the server remains the authority (e.g. contrast, URLs).
 */
import * as z from "zod";
import type {
  AboutContent,
  ContactContent,
  CtaContent,
  FaqContent,
  GalleryContent,
  HeroContent,
  HoursContent,
  ServicesContent,
  SiteImage,
  SitePalette,
  SiteSeo,
  TeamContent,
  TestimonialsContent,
} from "@/lib/api/types";
import { contrastRatio, INK, normalizeHex, WHITE } from "@/lib/theme/color";

export const LIMITS = {
  eyebrow: 60,
  headline: 90,
  subheadline: 240,
  ctaLabel: 30,
  heading: 80,
  intro: 300,
  aboutBody: 1500,
  highlight: 60,
  highlights: 4,
  bio: 400,
  members: 24,
  galleryImages: 12,
  quote: 400,
  author: 60,
  detail: 60,
  testimonials: 8,
  question: 140,
  answer: 600,
  faqItems: 12,
  note: 200,
  ctaBody: 240,
  contactBody: 300,
  alt: 140,
  seoTitle: 70,
  seoDescription: 160,
  sections: 16,
} as const;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const text = (max: number, label = "This") =>
  z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters`)
    .refine((v) => !CONTROL.test(v), "Contains invalid characters");
const required = (max: number, label = "This") => text(max, label).min(1, "Required");
/** Optional text: empty string becomes null (the API stores null). */
const optional = (max: number, label = "This") =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), text(max, label).nullable());

const patternSchema = z.enum(["aurora", "mesh", "waves", "grid", "dots", "rays"]);
const heroVariantSchema = z.enum(["split", "cover", "minimal"]);

const httpUrl = z
  .string()
  .max(600)
  .refine((v) => /^https?:\/\/\S+$/.test(v), "Must be an http(s) URL");

export const siteImageSchema: z.ZodType<SiteImage> = z
  .strictObject({
    kind: z.enum(["upload", "stock", "generated"]),
    url: httpUrl.nullable(),
    alt: text(LIMITS.alt, "Alt text"),
    pattern: patternSchema.nullable(),
    attribution: z.strictObject({ name: required(100), url: httpUrl }).nullable(),
  })
  .superRefine((img, ctx) => {
    if (img.kind === "generated" && !img.pattern)
      ctx.addIssue({ code: "custom", path: ["pattern"], message: "Pick a pattern" });
    if (img.kind !== "generated" && !img.url)
      ctx.addIssue({ code: "custom", path: ["url"], message: "Missing image" });
    if (img.kind === "stock") {
      if (!img.url?.startsWith("https://images.unsplash.com/"))
        ctx.addIssue({ code: "custom", path: ["url"], message: "Stock photos must come from Unsplash" });
      if (!img.attribution)
        ctx.addIssue({ code: "custom", path: ["attribution"], message: "Stock photos need attribution" });
    }
  });

export const heroSchema: z.ZodType<HeroContent> = z.strictObject({
  variant: heroVariantSchema,
  eyebrow: optional(LIMITS.eyebrow, "Eyebrow"),
  headline: required(LIMITS.headline, "Headline"),
  subheadline: optional(LIMITS.subheadline, "Subheadline"),
  ctaLabel: optional(LIMITS.ctaLabel, "Button label"),
  image: siteImageSchema.nullable(),
});

export const servicesSchema: z.ZodType<ServicesContent> = z.strictObject({
  heading: required(LIMITS.heading, "Heading"),
  intro: optional(LIMITS.intro, "Intro"),
  serviceIds: z.array(z.string()),
  showPrices: z.boolean(),
  showDurations: z.boolean(),
});

export const teamSchema: z.ZodType<TeamContent> = z.strictObject({
  heading: required(LIMITS.heading, "Heading"),
  intro: optional(LIMITS.intro, "Intro"),
  members: z
    .array(
      z.strictObject({
        resourceId: z.string().min(1),
        bio: optional(LIMITS.bio, "Bio"),
        photo: siteImageSchema.nullable(),
      }),
    )
    .max(LIMITS.members),
});

export const aboutSchema: z.ZodType<AboutContent> = z.strictObject({
  heading: required(LIMITS.heading, "Heading"),
  body: required(LIMITS.aboutBody, "Text"),
  highlights: z
    .array(required(LIMITS.highlight, "Highlight"))
    .max(LIMITS.highlights, `At most ${LIMITS.highlights} highlights`),
  image: siteImageSchema.nullable(),
});

export const gallerySchema: z.ZodType<GalleryContent> = z.strictObject({
  heading: optional(LIMITS.heading, "Heading"),
  images: z.array(siteImageSchema).max(LIMITS.galleryImages, `At most ${LIMITS.galleryImages} photos`),
});

export const testimonialsSchema: z.ZodType<TestimonialsContent> = z.strictObject({
  heading: required(LIMITS.heading, "Heading"),
  items: z
    .array(
      z.strictObject({
        quote: required(LIMITS.quote, "Quote"),
        author: required(LIMITS.author, "Name"),
        detail: optional(LIMITS.detail, "Detail"),
      }),
    )
    .max(LIMITS.testimonials, `At most ${LIMITS.testimonials} testimonials`),
});

export const faqSchema: z.ZodType<FaqContent> = z.strictObject({
  heading: required(LIMITS.heading, "Heading"),
  items: z
    .array(
      z.strictObject({
        question: required(LIMITS.question, "Question"),
        answer: required(LIMITS.answer, "Answer"),
      }),
    )
    .max(LIMITS.faqItems, `At most ${LIMITS.faqItems} questions`),
});

export const hoursSchema: z.ZodType<HoursContent> = z.strictObject({
  heading: required(LIMITS.heading, "Heading"),
  note: optional(LIMITS.note, "Note"),
  showAddress: z.boolean(),
  showMapLink: z.boolean(),
});

export const ctaSchema: z.ZodType<CtaContent> = z.strictObject({
  headline: required(LIMITS.headline, "Headline"),
  body: optional(LIMITS.ctaBody, "Text"),
  buttonLabel: required(LIMITS.ctaLabel, "Button label"),
});

export const contactSchema: z.ZodType<ContactContent> = z.strictObject({
  heading: required(LIMITS.heading, "Heading"),
  body: optional(LIMITS.contactBody, "Text"),
  showPhone: z.boolean(),
  showEmail: z.boolean(),
  showAddress: z.boolean(),
});

/** Palette rules (port of the backend check): primary ≥ 3:1 on white and a readable text colour. */
export function paletteProblem(color: string | null | undefined, role: "primary" | "accent"): string | null {
  const hex = normalizeHex(color);
  if (!hex) return role === "primary" ? "Pick a colour" : null;
  const onWhite = contrastRatio(hex, WHITE);
  if (onWhite < 3) {
    return `Too light for ${role === "primary" ? "buttons" : "accents"} on a white page (${onWhite.toFixed(1)}:1, needs 3:1). Choose a darker shade.`;
  }
  if (role === "primary" && Math.max(onWhite, contrastRatio(hex, INK)) < 4.5) {
    return "Text on this colour would be hard to read. Choose a darker or lighter shade.";
  }
  return null;
}

export const paletteSchema: z.ZodType<SitePalette> = z
  .strictObject({ primaryColor: z.string(), accent: z.string().nullable() })
  .superRefine((p, ctx) => {
    const primary = paletteProblem(p.primaryColor, "primary");
    if (primary) ctx.addIssue({ code: "custom", path: ["primaryColor"], message: primary });
    const accent = paletteProblem(p.accent, "accent");
    if (accent) ctx.addIssue({ code: "custom", path: ["accent"], message: accent });
  });

export const seoSchema: z.ZodType<SiteSeo> = z.strictObject({
  title: optional(LIMITS.seoTitle, "Title"),
  description: optional(LIMITS.seoDescription, "Description"),
});
