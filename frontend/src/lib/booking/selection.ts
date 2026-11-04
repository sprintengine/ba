/**
 * What the customer has chosen in the public booking flow, and how a change to one choice clears the
 * choices that depend on it. Pure; the flow keeps the selection in the URL (see `url.ts`).
 */
import type { AvailabilityQuery, PublicService, ServiceAddon, ServiceOption, Slot } from "@/lib/api/types";
import { toTimeOfDay, type PlainDate } from "@/lib/format/datetime";
import { findService, servicesForGroup } from "./services";

/** The "no preference" resource choice. */
export const ANY_RESOURCE = "any";

export type Selection = {
  groupId: string | null;
  serviceId: string | null;
  optionId: string | null;
  addonIds: string[];
  /** A resource id, `"any"`, or null when not chosen yet. */
  resource: string | null;
  date: PlainDate | null;
  /** "HH:mm" in the business timezone. */
  time: string | null;
};

export const EMPTY_SELECTION: Selection = {
  groupId: null,
  serviceId: null,
  optionId: null,
  addonIds: [],
  resource: null,
  date: null,
  time: null,
};

export type SelectionChange =
  | { type: "group"; groupId: string }
  | { type: "service"; service: PublicService }
  | { type: "option"; optionId: string }
  | { type: "toggleAddon"; addonId: string }
  | { type: "resource"; resource: string }
  | { type: "date"; date: PlainDate }
  | { type: "time"; date: PlainDate; time: string }
  | { type: "clearTime" };

/** Applies a change; changing an upstream choice clears what depends on it. */
export function applyChange(sel: Selection, change: SelectionChange, services: PublicService[]): Selection {
  switch (change.type) {
    case "group":
      return changeGroup(sel, change.groupId, services);
    case "service":
      return change.service.id === sel.serviceId ? sel : chooseService(sel, change.service);
    case "option":
      return change.optionId === sel.optionId ? sel : { ...sel, optionId: change.optionId, time: null };
    case "toggleAddon":
      return { ...sel, addonIds: toggle(sel.addonIds, change.addonId), time: null };
    case "resource":
      return change.resource === sel.resource ? sel : { ...sel, resource: change.resource, time: null };
    case "date":
      return change.date === sel.date ? sel : { ...sel, date: change.date, time: null };
    case "time":
      return { ...sel, date: change.date, time: change.time };
    case "clearTime":
      return { ...sel, time: null };
  }
}

function changeGroup(sel: Selection, groupId: string, services: PublicService[]): Selection {
  if (groupId === sel.groupId) return sel;
  const service = findService(services, sel.serviceId);
  const stillAllowed = !!service && servicesForGroup(services, groupId).includes(service);
  // Different groups can see different windows, so a chosen time is always cleared.
  return stillAllowed ? { ...sel, groupId, time: null } : { ...EMPTY_SELECTION, groupId };
}

function chooseService(sel: Selection, service: PublicService): Selection {
  return {
    ...EMPTY_SELECTION,
    groupId: sel.groupId,
    serviceId: service.id,
    // Pre-select when there is exactly one option.
    optionId: service.options.length === 1 ? (service.options[0]?.id ?? null) : null,
    date: sel.date,
  };
}

function toggle(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** `resourceId` to send to the API: null for "any" / not selectable. */
export function selectedResourceId(sel: Selection, service: PublicService | null): string | null {
  if (!service?.selectableRequirement || !sel.resource || sel.resource === ANY_RESOURCE) return null;
  return service.selectableRequirement.resources.some((r) => r.id === sel.resource) ? sel.resource : null;
}

/** The availability query (without the date range) for the selection: sorted add-ons share cache entries. */
export function availabilityQuery(
  sel: Selection,
  service: PublicService | null,
): Omit<AvailabilityQuery, "from" | "to"> {
  return {
    serviceId: service?.id ?? "",
    optionId: sel.optionId,
    addonIds: [...sel.addonIds].sort(),
    groupId: sel.groupId,
    resourceId: selectedResourceId(sel, service),
  };
}

/** The loaded slot matching the selected date and time (wall-clock in `timeZone`), if any. */
export function chosenSlot(sel: Selection, days: Map<PlainDate, Slot[]>, timeZone: string): Slot | undefined {
  if (!sel.date || !sel.time) return undefined;
  return days.get(sel.date)?.find((s) => toTimeOfDay(s.start, timeZone) === sel.time);
}

/** The chosen option and add-ons of the service (unknown ids ignored). */
export function chosenExtras(
  service: PublicService | null,
  sel: Pick<Selection, "optionId" | "addonIds">,
): { option: ServiceOption | null; addons: ServiceAddon[] } {
  return {
    option: service?.options.find((o) => o.id === sel.optionId) ?? null,
    addons: service?.addons.filter((a) => sel.addonIds.includes(a.id)) ?? [],
  };
}

/**
 * Who or what the customer chose: "Any therapist" for no preference (the requirement's label, else the
 * business's word for a resource), the resource's name, or undefined when nothing valid is chosen.
 */
export function resourceChoiceName(
  sel: Pick<Selection, "resource">,
  service: PublicService | null,
  resourceNoun: string,
): string | undefined {
  const req = service?.selectableRequirement;
  if (sel.resource === ANY_RESOURCE) return `Any ${(req?.label || resourceNoun).toLowerCase()}`;
  return req?.resources.find((r) => r.id === sel.resource)?.name;
}
