/**
 * Client-side plan validation and normalisation, mirroring the server (which stays the authority).
 * Editor forms keep raw input (e.g. "" for an empty optional field) so typing is never blocked;
 * `normalizePlan` turns it into the API shape before saving.
 */
import type { SitePlan, SiteSection } from "@/lib/api/types";
import { LIMITS, paletteSchema, seoSchema } from "./schema";
import { sectionIssues, withDef } from "./sections";

export type PlanIssues = {
  /** Total number of problems. */
  count: number;
  /** Section id → field path → message. */
  sections: Record<string, Record<string, string>>;
  palette: Record<string, string>;
  seo: Record<string, string>;
};

export function planIssues(plan: SitePlan): PlanIssues {
  const sections: PlanIssues["sections"] = {};
  for (const section of plan.sections) {
    const issues = sectionIssues(section);
    if (Object.keys(issues).length) sections[section.id] = issues;
  }
  if (plan.sections.length > LIMITS.sections) {
    sections._plan = { sections: `A site can have at most ${LIMITS.sections} sections.` };
  }
  const palette = zodIssues(paletteSchema.safeParse(plan.palette));
  const seo = zodIssues(seoSchema.safeParse(plan.seo));
  const count =
    Object.values(sections).reduce((n, s) => n + Object.keys(s).length, 0) +
    Object.keys(palette).length +
    Object.keys(seo).length;
  return { count, sections, palette, seo };
}

function zodIssues(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  const out: Record<string, string> = {};
  if (!result.success)
    for (const issue of result.error!.issues) out[issue.path.map(String).join(".")] ??= issue.message;
  return out;
}

/** The plan in API shape: trimmed text, empty optional text as null. Invalid content is left as is. */
export function normalizePlan(plan: SitePlan): SitePlan {
  const seo = seoSchema.safeParse(plan.seo);
  return {
    ...plan,
    seo: seo.success ? seo.data : plan.seo,
    sections: plan.sections.map(normalizeSection),
  };
}

function normalizeSection(section: SiteSection): SiteSection {
  return withDef(section, (def, s) => {
    const parsed = def.schema.safeParse(s.content);
    return (parsed.success ? { ...s, content: parsed.data } : s) as SiteSection;
  });
}
