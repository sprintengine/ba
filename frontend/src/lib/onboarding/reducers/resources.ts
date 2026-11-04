import type { BusinessSetup, ResourceKind } from "@/lib/api/types";
import type { HoursAction, ResourceAction, SetupHandlers } from "../actions";
import { addWindow, copyDayToWeekdays, copyWindow, mapDayWindow, setDayOpen, WEEKDAYS } from "../hours";
import { uniqueKey, uniqueName } from "../keys";
import type { SetupResource, SetupService } from "../types";
import { mapResourceHours, withSetup } from "./edit";

/** Kind, name and key that `addResource` will use (so the UI can expand the new row). */
export function nextResource(s: BusinessSetup, kind?: ResourceKind, name?: string) {
  const k = kind ?? s.resources.at(-1)?.kind ?? "person";
  const n =
    name ??
    uniqueName(
      `${s.vocabulary.resource} ${s.resources.length + 1}`,
      s.resources.map((r) => r.name),
    );
  return {
    kind: k,
    name: n,
    key: uniqueKey(
      n,
      s.resources.map((r) => r.key),
      "resource",
    ),
  };
}

/** A new resource copies the capacity and hours of the last one of its kind (or opens 09:00–17:00 on weekdays). */
function newResource(s: BusinessSetup, kind?: ResourceKind, name?: string): SetupResource {
  const next = nextResource(s, kind, name);
  const template = s.resources.filter((r) => r.kind === next.kind).at(-1);
  return {
    ...next,
    description: null,
    capacity: template?.capacity ?? 1,
    weeklyHours: template
      ? template.weeklyHours.map((h) => ({ ...h }))
      : WEEKDAYS.slice(0, 5).map((d) => ({
          dayOfWeek: d,
          startTime: "09:00",
          endTime: "17:00",
          audienceGroupKeys: [],
        })),
  };
}

/** A new resource joins every requirement pool made only of resources of its kind (a new bay joins the bays). */
function joinSameKindPools(s: BusinessSetup, added: SetupResource): SetupService[] {
  const byKey = new Map(s.resources.map((r) => [r.key, r]));
  const sameKindOnly = (keys: string[]) =>
    keys.length > 0 && keys.every((k) => byKey.get(k)?.kind === added.kind);
  return s.services.map((svc) => ({
    ...svc,
    requirements: svc.requirements.map((req) =>
      sameKindOnly(req.resourceKeys) ? { ...req, resourceKeys: [...req.resourceKeys, added.key] } : req,
    ),
  }));
}

/** Drops [key] from every pool, clamps quantities to the smaller pool, and removes requirements left empty. */
function leavePools(services: SetupService[], key: string): SetupService[] {
  return services.map((svc) => ({
    ...svc,
    requirements: svc.requirements
      .map((req) => {
        const resourceKeys = req.resourceKeys.filter((k) => k !== key);
        return { ...req, resourceKeys, quantity: Math.max(1, Math.min(req.quantity, resourceKeys.length)) };
      })
      .filter((req) => req.resourceKeys.length > 0),
  }));
}

/** Resources are referenced by `key`, which never changes, so renaming never breaks a requirement. */
export const resourceHandlers: SetupHandlers<ResourceAction> = {
  addResource: (draft, action) =>
    withSetup(draft, (s) => {
      const resource = newResource(s, action.kind, action.name);
      return { ...s, resources: [...s.resources, resource], services: joinSameKindPools(s, resource) };
    }),
  updateResource: (draft, action) =>
    withSetup(draft, (s) => ({
      ...s,
      resources: s.resources.map((r) => (r.key === action.key ? { ...r, ...action.patch } : r)),
    })),
  removeResource: (draft, action) =>
    withSetup(draft, (s) => ({
      ...s,
      resources: s.resources.filter((r) => r.key !== action.key),
      services: leavePools(s.services, action.key),
    })),
  copyHoursToAll: (draft, action) =>
    withSetup(draft, (s) => {
      const source = s.resources.find((r) => r.key === action.resourceKey);
      if (!source) return s;
      return {
        ...s,
        resources: s.resources.map((r) =>
          r.key === source.key ? r : { ...r, weeklyHours: source.weeklyHours.map(copyWindow) },
        ),
      };
    }),
};

export const hoursHandlers: SetupHandlers<HoursAction> = {
  setDayOpen: (draft, action) =>
    mapResourceHours(draft, action.resourceKey, (hours) => setDayOpen(hours, action.day, action.open)),
  updateWindow: (draft, action) =>
    mapResourceHours(draft, action.resourceKey, (hours) =>
      mapDayWindow(hours, action.day, action.windowIndex, (h) => ({ ...h, ...action.patch })),
    ),
  addWindow: (draft, action) =>
    mapResourceHours(draft, action.resourceKey, (hours) => addWindow(hours, action.day)),
  removeWindow: (draft, action) =>
    mapResourceHours(draft, action.resourceKey, (hours) =>
      mapDayWindow(hours, action.day, action.windowIndex, () => null),
    ),
  copyDayToWeekdays: (draft, action) =>
    mapResourceHours(draft, action.resourceKey, (hours) => copyDayToWeekdays(hours, action.fromDay ?? 1)),
};
