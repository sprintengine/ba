/**
 * Pure site-plan transforms for the editor: every change is a function `plan → plan`, composed
 * by `editPlan(plan, action)` so the editor state is a plain reducer (unit-tested).
 */
import type {
  SitePalette,
  SitePlan,
  SiteSection,
  SiteSectionType,
  SiteSeo,
  SiteThemeKey,
} from "@/lib/api/types";
import { newSectionId } from "./plan";
import { LIMITS } from "./schema";
import { sectionDef, type DefaultsInput } from "./sections";
import { siteTheme } from "./themes";

export type PlanAction =
  | { type: "setTheme"; theme: SiteThemeKey }
  | { type: "setPalette"; palette: Partial<SitePalette> }
  | { type: "setSeo"; seo: Partial<SiteSeo> }
  | { type: "move"; id: string; to: number }
  | { type: "toggle"; id: string; enabled?: boolean }
  | { type: "updateContent"; id: string; content: SiteSection["content"] }
  | {
      type: "add";
      sectionType: SiteSectionType;
      defaults: Omit<DefaultsInput, "pattern">;
      at?: number;
      id?: string;
    }
  | { type: "remove"; id: string }
  | { type: "duplicate"; id: string };

export function editPlan(plan: SitePlan, action: PlanAction): SitePlan {
  switch (action.type) {
    case "setTheme":
      return { ...plan, theme: action.theme };
    case "setPalette":
      return { ...plan, palette: { ...plan.palette, ...action.palette } };
    case "setSeo":
      return { ...plan, seo: { ...plan.seo, ...action.seo } };
    case "move":
      return { ...plan, sections: moveSection(plan.sections, action.id, action.to) };
    case "toggle":
      return mapSection(plan, action.id, (s) => ({ ...s, enabled: action.enabled ?? !s.enabled }));
    case "updateContent":
      return mapSection(plan, action.id, (s) => ({ ...s, content: action.content }) as SiteSection);
    case "add":
      return addSection(plan, action.sectionType, action.defaults, action.at, action.id);
    case "remove":
      return { ...plan, sections: plan.sections.filter((s) => s.id !== action.id) };
    case "duplicate":
      return duplicateSection(plan, action.id);
  }
}

function mapSection(plan: SitePlan, id: string, fn: (s: SiteSection) => SiteSection): SitePlan {
  return { ...plan, sections: plan.sections.map((s) => (s.id === id ? fn(s) : s)) };
}

/** Moves a section to index `to` (clamped). */
export function moveSection(sections: SiteSection[], id: string, to: number): SiteSection[] {
  const from = sections.findIndex((s) => s.id === id);
  if (from < 0) return sections;
  const target = Math.max(0, Math.min(sections.length - 1, to));
  if (target === from) return sections;
  const next = [...sections];
  next.splice(target, 0, ...next.splice(from, 1));
  return next;
}

/** Why a section of this type can't be added right now, or null. */
export function addBlocker(plan: SitePlan, type: SiteSectionType): string | null {
  if (plan.sections.length >= LIMITS.sections) return `A site can have at most ${LIMITS.sections} sections.`;
  if (sectionDef(type).single && plan.sections.some((s) => s.type === type)) {
    return `There can only be one ${sectionDef(type).label.toLowerCase()} section.`;
  }
  return null;
}

function addSection(
  plan: SitePlan,
  type: SiteSectionType,
  input: Omit<DefaultsInput, "pattern">,
  at?: number,
  requestedId?: string,
): SitePlan {
  if (addBlocker(plan, type)) return plan;
  const taken = plan.sections.some((s) => s.id === requestedId);
  const content = sectionDef(type).defaults({ ...input, pattern: siteTheme(plan.theme).defaultPattern });
  const id = requestedId && !taken ? requestedId : newSectionId(type, plan.sections);
  const section = { id, type, enabled: true, content } as SiteSection;
  const sections = [...plan.sections];
  // The hero belongs at the top; others go where asked, else before the closing CTA/contact.
  const index = type === "hero" ? 0 : (at ?? defaultInsertIndex(sections));
  sections.splice(index, 0, section);
  return { ...plan, sections };
}

function defaultInsertIndex(sections: SiteSection[]): number {
  let i = sections.length;
  while (i > 0 && isClosing(sections[i - 1])) i--;
  return i;
}

/** The CTA and contact sections close a page; new sections go before them. */
function isClosing(section: SiteSection | undefined): boolean {
  return section?.type === "cta" || section?.type === "contact";
}

function duplicateSection(plan: SitePlan, id: string): SitePlan {
  const index = plan.sections.findIndex((s) => s.id === id);
  const source = plan.sections[index];
  if (!source || addBlocker(plan, source.type)) return plan;
  const copy = {
    ...source,
    id: newSectionId(source.type, plan.sections),
    content: structuredClone(source.content),
  } as SiteSection;
  const sections = [...plan.sections];
  sections.splice(index + 1, 0, copy);
  return { ...plan, sections };
}

/** Structural equality of two plans (JSON-shaped data; key order ignored). */
export function samePlan(a: SitePlan | null | undefined, b: SitePlan | null | undefined): boolean {
  return stableStringify(a ?? null) === stableStringify(b ?? null);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
