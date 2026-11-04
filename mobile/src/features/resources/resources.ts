/** Pure helpers for the Resources screens (the website's resources-view.tsx and time-off.tsx rules). */
import type { AvailabilityOverride, DayOfWeek, Resource, ResourceKind, TeamMember } from "@shared/api/types";
import { RESOURCE_KIND_LABEL } from "@shared/catalog/resources";
import { formatDate } from "@shared/format";
import { User, DoorOpen, Box, type LucideIcon } from "lucide-react-native";

/** The website's KIND_ICON (components/dashboard/common.tsx). */
export const KIND_ICON: Record<ResourceKind, LucideIcon> = { person: User, space: DoorOpen, equipment: Box };

/** Active first, then by sort order and name (the website's list order). */
export function sortResources(resources: readonly Resource[] | undefined): Resource[] {
  return [...(resources ?? [])].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

/** The signed-in person's team member id (staff edit the hours of resources linked to it). */
export function myMemberId(team: readonly TeamMember[] | undefined, userId: string): string | null {
  return team?.find((m) => m.userId === userId)?.id ?? null;
}

/** A team member's display name (name, else email), or null when `id` isn't on the team. */
export function memberName(team: readonly TeamMember[] | undefined, id: string | null): string | null {
  const m = team?.find((x) => x.id === id);
  return m ? m.name || m.email : null;
}

/** The line under a resource's name: inactive, who a person is linked to, or a thing's kind and capacity. */
export function resourceSubtitle(resource: Resource, linkedTo: string | null): string {
  if (!resource.isActive) return "Inactive";
  if (resource.kind === "person") return linkedTo ? `Linked to ${linkedTo}` : "Not linked";
  return `${RESOURCE_KIND_LABEL[resource.kind]}${resource.capacity > 1 ? ` · ${resource.capacity} places` : ""}`;
}

/** Overrides from `today` on, by date then start time. */
export function upcomingOverrides(
  overrides: readonly AvailabilityOverride[] | undefined,
  today: string,
): AvailabilityOverride[] {
  return (overrides ?? [])
    .filter((o) => o.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

/** "09:00–13:00 · Course", "All day". */
export function overrideDetail(o: Pick<AvailabilityOverride, "startTime" | "endTime" | "reason">): string {
  return `${o.startTime && o.endTime ? `${o.startTime}–${o.endTime}` : "All day"}${o.reason ? ` · ${o.reason}` : ""}`;
}

/** A weekly-hours schedule's name in the "Which hours" picker (the website's `label`). */
export function scheduleLabel(
  s: { validFrom: string | null; validUntil: string | null },
  timeZone: string,
  locale: string,
): string {
  if (s.validFrom === null && s.validUntil === null) return "Regular hours";
  const from = s.validFrom ? formatDate(s.validFrom, timeZone, "short", locale) : "Until";
  const until = s.validUntil ? formatDate(s.validUntil, timeZone, "medium", locale) : "onwards";
  return `${from}${s.validFrom && s.validUntil ? " – " : " "}${until}`;
}

/** The copy-to-other-days choices (the website's DayRow Copy menu). */
export const COPY_TARGETS: readonly { key: string; label: string; days: readonly DayOfWeek[] }[] = [
  { key: "all", label: "Copy to all days", days: [1, 2, 3, 4, 5, 6, 7] },
  { key: "weekdays", label: "Copy to weekdays", days: [1, 2, 3, 4, 5] },
  { key: "weekend", label: "Copy to the weekend", days: [6, 7] },
];

/** A new seasonal period's problem (the website's AddPeriodDialog), or null. */
export function periodError(from: string | null, until: string | null): string | null {
  return from && until && until < from ? "The end is before the start" : null;
}

/** A row of the resources list: the active ones, then a heading and the inactive ones. */
export type ResourceListRow =
  | { kind: "header"; key: string; title: string }
  | { kind: "resource"; key: string; resource: Resource; first: boolean; last: boolean };

/** The list's rows from resources in list order; each row knows whether it starts or ends its group. */
export function resourceRows(sorted: readonly Resource[]): ResourceListRow[] {
  const group = (items: Resource[]): ResourceListRow[] =>
    items.map((resource, i) => ({
      kind: "resource",
      key: resource.id,
      resource,
      first: i === 0,
      last: i === items.length - 1,
    }));
  const active = sorted.filter((r) => r.isActive);
  const inactive = sorted.filter((r) => !r.isActive);
  const heading: ResourceListRow[] = inactive.length
    ? [{ kind: "header", key: "inactive", title: "Inactive" }]
    : [];
  return [...group(active), ...heading, ...group(inactive)];
}

/** What a screen reader says for a resource's row: "Alex Morgan, Person, Linked to Sam". */
export function resourceA11yLabel(resource: Resource, linkedTo: string | null): string {
  return `${resource.name}, ${RESOURCE_KIND_LABEL[resource.kind]}, ${resourceSubtitle(resource, linkedTo)}`;
}
