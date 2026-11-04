/** Pure helpers for the Services screens (the website's services-list.tsx rules, and the app's reordering). */
import type { Service } from "@shared/api/types";
import { durationLabel, priceLabel } from "@shared/booking/quote";
import { PAYMENT_MODE_SHORT } from "@shared/services/service-form";

/** The website's order: `sortOrder`, then name. */
export function sortServices(services: readonly Service[]): Service[] {
  return [...services].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export type ServiceGroups = {
  /** Active services by category, in the order categories first appear; a lone "Other" group has no title (""). */
  entries: [string, Service[]][];
  inactive: Service[];
};

/** Active services grouped by category (uncategorised ones under "Other"), inactive ones on their own. */
export function serviceGroups(sorted: readonly Service[]): ServiceGroups {
  const map = new Map<string, Service[]>();
  for (const s of sorted.filter((s) => s.isActive)) {
    const key = s.category?.trim() || "Other";
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  const entries = [...map.entries()];
  const only = entries.length === 1 ? entries[0] : undefined;
  if (only?.[0] === "Other") only[0] = "";
  return { entries, inactive: sorted.filter((s) => !s.isActive) };
}

/** The categories in use, for the editor's suggestions. */
export function categoriesOf(services: readonly Service[]): string[] {
  return [...new Set(services.map((s) => s.category?.trim()).filter((c): c is string => !!c))];
}

export type ServiceListRow =
  | { kind: "header"; key: string; title: string; first: boolean }
  | {
      kind: "service";
      key: string;
      service: Service;
      first: boolean;
      last: boolean;
      dashed: boolean;
      /** Position in the reorder list (0-based) and its length; only while editing the order. */
      position?: { index: number; count: number };
    };

function groupRows(list: Service[], dashed: boolean): ServiceListRow[] {
  return list.map((service, i) => ({
    kind: "service",
    key: service.id,
    service,
    first: i === 0,
    last: i === list.length - 1,
    dashed,
  }));
}

/** The list's rows: titled category groups, then "Inactive" (dashed). */
export function serviceRows(sorted: readonly Service[]): ServiceListRow[] {
  const { entries, inactive } = serviceGroups(sorted);
  const rows: ServiceListRow[] = [];
  for (const [title, list] of entries) {
    if (title) rows.push({ kind: "header", key: `h:${title}`, title, first: rows.length === 0 });
    rows.push(...groupRows(list, false));
  }
  if (inactive.length > 0) {
    rows.push({ kind: "header", key: "h:inactive", title: "Inactive", first: rows.length === 0 });
    rows.push(...groupRows(inactive, true));
  }
  return rows;
}

/** While editing the order: one list of every service in `ids` order, each knowing its position. */
export function reorderRows(byId: ReadonlyMap<string, Service>, ids: readonly string[]): ServiceListRow[] {
  const list = ids.map((id) => byId.get(id)).filter((s): s is Service => !!s);
  return list.map((service, index) => ({
    kind: "service",
    key: service.id,
    service,
    first: index === 0,
    last: index === list.length - 1,
    dashed: !service.isActive,
    position: { index, count: list.length },
  }));
}

/**
 * The order being edited, kept in step with the data: services that disappeared are dropped, new ones go last.
 */
export function reconcileOrder(ids: readonly string[], sorted: readonly Service[]): string[] {
  const present = new Set(sorted.map((s) => s.id));
  const kept = ids.filter((id) => present.has(id));
  const known = new Set(kept);
  return [...kept, ...sorted.filter((s) => !known.has(s.id)).map((s) => s.id)];
}

/** `ids` with the item at `index` moved by `delta` (−1 up, +1 down); unchanged at the ends. */
export function moveId(ids: readonly string[], index: number, delta: -1 | 1): string[] {
  const to = index + delta;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as string);
  return next;
}

/**
 * The sort orders to save for a new order: the current values (ascending, nudged up where two are equal so the
 * order no longer depends on names) handed out in the new order. A swap changes just the two services swapped;
 * nothing changes when the order is the same. Returns only the services whose `sortOrder` changes.
 */
export function reorderChanges(
  sorted: readonly Service[],
  ids: readonly string[],
): { service: Service; sortOrder: number }[] {
  const byId = new Map(sorted.map((s) => [s.id, s]));
  const ordered = ids.map((id) => byId.get(id)).filter((s): s is Service => !!s);
  if (ordered.every((s, i) => sorted[i]?.id === s.id) && ordered.length === sorted.length) return [];
  const values: number[] = [];
  for (const s of sorted) {
    const prev = values[values.length - 1];
    values.push(prev === undefined ? s.sortOrder : Math.max(s.sortOrder, prev + 1));
  }
  return ordered
    .map((service, i) => ({ service, sortOrder: values[i] ?? i }))
    .filter(({ service, sortOrder }) => service.sortOrder !== sortOrder);
}

/**
 * The row's second line, the website's: "30 min – 1 h · from €40 · Deposit · 2 options · 1 add-on". The payment
 * mode is left out when the price already says it ("Free").
 */
export function serviceSummary(s: Service, currency: string, locale: string): string[] {
  const price = priceLabel(s, currency, { locale });
  const mode = PAYMENT_MODE_SHORT[s.paymentMode];
  const parts = [durationLabel(s), price];
  if (mode !== price) parts.push(s.allowPayAtVenue ? `${mode} or at venue` : mode);
  if (s.options.length > 0)
    parts.push(`${s.options.length} ${s.options.length === 1 ? "option" : "options"}`);
  if (s.addons.length > 0) parts.push(`${s.addons.length} ${s.addons.length === 1 ? "add-on" : "add-ons"}`);
  return parts;
}

/** The row's badges (the website's): Private, Approval, N seats. */
export function serviceBadges(s: Service): { label: string; tone: "neutral" | "info" }[] {
  const badges: { label: string; tone: "neutral" | "info" }[] = [];
  if (!s.isPublic) badges.push({ label: "Private", tone: "neutral" });
  if (s.requiresApproval) badges.push({ label: "Approval", tone: "info" });
  if (s.capacity > 1) badges.push({ label: `${s.capacity} seats`, tone: "neutral" });
  return badges;
}

/** What a screen reader says for a row: name, badges, summary, and whether it's inactive. */
export function serviceRowLabel(s: Service, summary: readonly string[]): string {
  return [s.name, ...serviceBadges(s).map((b) => b.label), s.isActive ? null : "Inactive", ...summary]
    .filter(Boolean)
    .join(", ");
}
