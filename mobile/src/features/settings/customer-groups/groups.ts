/** Pure helpers for Settings › Customer groups (the website's groups-settings.tsx rules). */
import type { CustomerGroup } from "@shared/api/types";

export type GroupRow =
  { kind: "header"; key: string; title: string } | { kind: "group"; key: string; group: CustomerGroup };

/** Active groups first, each by sort order (the website's order). */
export function sortGroups(groups: readonly CustomerGroup[]): CustomerGroup[] {
  return [...groups].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder);
}

/** The list's rows: active groups, then an "Inactive" section when there are any. */
export function groupRows(groups: readonly CustomerGroup[]): GroupRow[] {
  const sorted = sortGroups(groups);
  const rows: GroupRow[] = sorted
    .filter((g) => g.isActive)
    .map((group) => ({ kind: "group", key: group.id, group }));
  const inactive = sorted.filter((g) => !g.isActive);
  if (inactive.length > 0) {
    rows.push({ kind: "header", key: "inactive", title: "Inactive" });
    rows.push(...inactive.map((group): GroupRow => ({ kind: "group", key: group.id, group })));
  }
  return rows;
}
