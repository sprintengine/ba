/** Pure helpers for the service editor (the website's service-editor/* rules). */
import type { CustomerGroup, FormQuestion, ReleaseSchedule, Resource, Service } from "@shared/api/types";
import { nextSortOrder } from "@shared/dashboard/sort-order";
import { formatDuration } from "@shared/format";
import { emptyServiceValues, SERVICE_COLORS, type ServiceFormValues } from "@shared/services/service-form";
import type { SelectOption } from "~/ui";

/** The new-service editor's id, in the route (`/services/new`) and the iPad selection. */
export const NEW_SERVICE = "new";

/** "Start times every": the website's choices. */
export const INTERVALS = [5, 10, 15, 20, 30, 45, 60, 90, 120] as const;

/** "Minimum notice": the website's choices. */
export const NOTICE = [
  { value: 0, label: "No notice needed" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "1 day" },
  { value: 2880, label: "2 days" },
  { value: 10080, label: "1 week" },
] as const;

/** The select value for "no value" (null): "Same as duration", "Business default". */
export const NONE = "none";

/** A nullable number as a select value, and back. */
export const toChoice = (n: number | null): string => (n === null ? NONE : String(n));
export const fromChoice = (value: string): number | null => (value === NONE ? null : Number(value));

/**
 * The interval choices. A value saved elsewhere that isn't one of them (the API or Bo set 25) is listed too, so the
 * select still says what it is.
 */
export function intervalOptions(current: number | null): SelectOption<string>[] {
  const values: number[] = [...INTERVALS];
  if (current !== null && !values.includes(current)) values.push(current);
  return [
    { value: NONE, label: "Same as duration" },
    ...values.sort((a, b) => a - b).map((m) => ({ value: String(m), label: formatDuration(m) })),
  ];
}

/** The minimum-notice choices, with the current value if it isn't one of them. */
export function noticeOptions(current: number | null): SelectOption<string>[] {
  const options: { value: number; label: string }[] = [...NOTICE];
  if (current !== null && !options.some((o) => o.value === current)) {
    options.push({ value: current, label: formatDuration(current) });
  }
  return [
    { value: NONE, label: "Business default" },
    ...options.sort((a, b) => a.value - b.value).map((o) => ({ value: String(o.value), label: o.label })),
  ];
}

/** A new service's values: last in the list, the next colour along. */
export function newServiceValues(services: readonly Service[]): ServiceFormValues {
  const order = nextSortOrder(services);
  return emptyServiceValues(order, SERVICE_COLORS[order % SERVICE_COLORS.length]);
}

/** The questions asked when booking this service (Settings › Questions): active, for all services or this one. */
export function questionsFor(
  questions: readonly FormQuestion[] | undefined,
  serviceId: string,
): FormQuestion[] {
  return (questions ?? []).filter((q) => q.isActive && (q.serviceId === null || q.serviceId === serviceId));
}

/**
 * The groups "Who can book" lists: active ones, and an inactive one the service already allows (it still applies
 * until it's unticked and saved).
 */
export function groupChoices(
  groups: readonly CustomerGroup[] | undefined,
  allowed: readonly string[],
  saved: readonly string[],
): CustomerGroup[] {
  return (groups ?? []).filter((g) => g.isActive || allowed.includes(g.id) || saved.includes(g.id));
}

/** A group's chip: its name, and whether it's restricted or inactive (in words, not just colour). */
export function groupChipLabel(g: CustomerGroup): string {
  return [g.name, g.restricted ? "Restricted" : null, g.isActive ? null : "Inactive"]
    .filter(Boolean)
    .join(" · ");
}

/** The resources that can fill a requirement: active ones, and inactive ones it already names (to take them off). */
export function resourceChoices(
  resources: readonly Resource[] | undefined,
  ids: readonly string[],
): Resource[] {
  return (resources ?? []).filter((r) => r.isActive || ids.includes(r.id));
}

export function resourceChipLabel(r: Resource): string {
  return r.isActive ? r.name : `${r.name} · Inactive`;
}

/** The active release schedules that decide when this service's days open. */
export function coveringSchedules(
  schedules: readonly ReleaseSchedule[] | undefined,
  serviceId: string | null,
): ReleaseSchedule[] {
  if (serviceId === null) return [];
  return (schedules ?? []).filter((s) => s.status === "active" && s.serviceIds.includes(serviceId));
}

/** "Let the customer choose" help: names what they pick. */
export function chooseHint(label: string | undefined): string {
  return label?.trim()
    ? `They pick their ${label.trim().toLowerCase()} when booking.`
    : "They pick who they see when booking.";
}
