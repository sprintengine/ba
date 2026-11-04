/**
 * The section registry with schemas, for the editor and plan validation: `section-meta.ts` (labels, defaults,
 * whether a section has content; no zod, so the public site can use it alone) plus each type's schema
 * (mirrors the backend). `components/site/section-renderers.tsx` adds the renderer and
 * `components/dashboard/site/section-editors.tsx` the editor form, so a new section type is one entry in each.
 */
import type { z } from "zod";
import type { SectionContentMap, SiteSection, SiteSectionOf, SiteSectionType } from "@/lib/api/types";
import { SECTION_META, type SectionMeta } from "./section-meta";
import {
  aboutSchema,
  contactSchema,
  ctaSchema,
  faqSchema,
  gallerySchema,
  heroSchema,
  hoursSchema,
  servicesSchema,
  teamSchema,
  testimonialsSchema,
} from "./schema";

export {
  SECTION_TYPES,
  sectionHasContent,
  type DefaultsInput,
  type SectionData,
  type SectionMeta,
} from "./section-meta";

export type SectionDef<T extends SiteSectionType> = SectionMeta<T> & {
  schema: z.ZodType<SectionContentMap[T]>;
};

type Registry = { [T in SiteSectionType]: SectionDef<T> };

const SECTION_SCHEMAS: { [T in SiteSectionType]: z.ZodType<SectionContentMap[T]> } = {
  hero: heroSchema,
  services: servicesSchema,
  team: teamSchema,
  about: aboutSchema,
  gallery: gallerySchema,
  testimonials: testimonialsSchema,
  faq: faqSchema,
  hours: hoursSchema,
  cta: ctaSchema,
  contact: contactSchema,
};

function withSchema<T extends SiteSectionType>(type: T): SectionDef<T> {
  return { ...SECTION_META[type], schema: SECTION_SCHEMAS[type] };
}

export const SECTION_DEFS: Registry = {
  hero: withSchema("hero"),
  services: withSchema("services"),
  team: withSchema("team"),
  about: withSchema("about"),
  gallery: withSchema("gallery"),
  testimonials: withSchema("testimonials"),
  faq: withSchema("faq"),
  hours: withSchema("hours"),
  cta: withSchema("cta"),
  contact: withSchema("contact"),
};

export function sectionDef<T extends SiteSectionType>(type: T): SectionDef<T> {
  return SECTION_DEFS[type];
}

/** Calls `fn` with the section and its definition, typed together (one narrowing point). */
export function withDef<R>(
  section: SiteSection,
  fn: <T extends SiteSectionType>(def: SectionDef<T>, section: SiteSectionOf<T>) => R,
): R {
  return fn(sectionDef(section.type), section as SiteSectionOf<typeof section.type>);
}

/** Validates a section's content against its schema; returns the first problem per path. */
export function sectionIssues(section: SiteSection): Record<string, string> {
  const result = withDef(section, (def, s) => def.schema.safeParse(s.content));
  if (result.success) return {};
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    issues[key] ??= issue.message;
  }
  return issues;
}
