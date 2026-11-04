/**
 * Pure helpers for site plans (§15.3): live-data resolution (services, team, hours), formatting,
 * anchors and ids. Used by the renderer and the editor; no React.
 */
import type {
  GeneratedPattern,
  OpeningHoursDay,
  PublicService,
  SectionContentMap,
  SiteContext,
  SiteImage,
  SiteSection,
  SiteSectionType,
} from "@/lib/api/types";

export const GENERATED_PATTERNS: GeneratedPattern[] = ["aurora", "mesh", "waves", "grid", "dots", "rays"];

/** Anchor used in the page (`#services`); the first section of a type owns the plain name. */
export function sectionAnchor(section: SiteSection, sections: SiteSection[]): string {
  const first = sections.find((s) => s.type === section.type);
  return first?.id === section.id ? section.type : `${section.type}-${section.id}`;
}

/** Public services referenced by a services section, in its order ([] = all, in their sort order). */
export function resolveServices(ids: string[], services: PublicService[]): PublicService[] {
  if (ids.length === 0) return [...services].sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(services.map((s) => [s.id, s]));
  return ids.map((id) => byId.get(id)).filter((s): s is PublicService => !!s);
}

export type ResolvedMember = { id: string; name: string; bio: string | null; photo: SiteImage | null };

/** Team members of a team section ([] = everyone in the team, with their descriptions). */
export function resolveTeam(
  members: SectionContentMap["team"]["members"],
  context: SiteContext,
): ResolvedMember[] {
  const byId = new Map(context.team.map((t) => [t.id, t]));
  if (members.length === 0) {
    return context.team.map((t) => ({ id: t.id, name: t.name, bio: t.description, photo: null }));
  }
  return members
    .map((m) => {
      const person = byId.get(m.resourceId);
      return person
        ? { id: person.id, name: person.name, bio: m.bio ?? person.description, photo: m.photo }
        : null;
    })
    .filter((m): m is ResolvedMember => !!m);
}

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "09:00 – 13:00, 14:00 – 18:00" or null when closed. */
export function formatIntervals(day: OpeningHoursDay | undefined): string | null {
  if (!day || day.intervals.length === 0) return null;
  return day.intervals.map((i) => `${i.start} – ${i.end}`).join(", ");
}

/** Consecutive days with identical hours grouped: "Mon – Fri 09:00 – 18:00". */
export function groupedHours(days: OpeningHoursDay[]): { label: string; hours: string | null }[] {
  const sorted = [...days].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const groups: { from: number; to: number; hours: string | null }[] = [];
  for (const d of sorted) {
    const hours = formatIntervals(d);
    const last = groups[groups.length - 1];
    if (last && last.hours === hours && last.to === d.dayOfWeek - 1) last.to = d.dayOfWeek;
    else groups.push({ from: d.dayOfWeek, to: d.dayOfWeek, hours });
  }
  const short = (n: number) => (WEEKDAY_NAMES[n - 1] ?? "").slice(0, 3);
  return groups.map((g) => ({
    label: g.from === g.to ? short(g.from) : `${short(g.from)} – ${short(g.to)}`,
    hours: g.hours,
  }));
}

/** A short id unique within the plan ("faq", "faq-2", …). */
export function newSectionId(type: SiteSectionType, sections: SiteSection[]): string {
  const taken = new Set(sections.map((s) => s.id));
  if (!taken.has(type)) return type;
  for (let i = 2; ; i++) if (!taken.has(`${type}-${i}`)) return `${type}-${i}`;
}

/** Google Maps search link for an address. */
export function mapLink(parts: (string | null | undefined)[]): string | null {
  const q = parts.filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** Split plain text into paragraphs on blank lines. */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
