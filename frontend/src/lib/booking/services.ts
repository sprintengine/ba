/** The public service list as the booking flow shows it: lookup, customer-group visibility, categories. */
import type { PublicService } from "@/lib/api/types";

export function findService(services: PublicService[], id: string | null): PublicService | null {
  if (!id) return null;
  return services.find((s) => s.id === id) ?? null;
}

/** Services visible to a customer group (empty `allowedGroupIds` = everyone). */
export function servicesForGroup(services: PublicService[], groupId: string | null): PublicService[] {
  return services.filter(
    (s) => s.allowedGroupIds.length === 0 || (groupId !== null && s.allowedGroupIds.includes(groupId)),
  );
}

/** Services grouped by category, keeping sort order; uncategorised last (or alone, untitled). */
export function groupByCategory<S extends Pick<PublicService, "category" | "sortOrder" | "name">>(
  services: S[],
): { category: string | null; services: S[] }[] {
  const sorted = [...services].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const groups = new Map<string | null, S[]>();
  for (const s of sorted) {
    const key = s.category?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const named = [...groups.entries()].filter(([k]) => k !== null);
  const other = groups.get(null);
  const result = named.map(([category, list]) => ({ category, services: list }));
  if (other) result.push({ category: named.length ? "Other" : null, services: other });
  return result;
}
