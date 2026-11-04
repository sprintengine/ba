import type { ServicePartAction, SetupHandlers } from "../actions";
import type { SetupRequirement } from "../types";
import { mapAt, mapService, without } from "./edit";

/** Removing an item renumbers the rest, so `sortOrder` always matches the list order. */
const renumber = <T extends { sortOrder: number }>(list: T[]): T[] =>
  list.map((x, i) => ({ ...x, sortOrder: i }));

/** Adds or removes [resourceKey] from the pool, keeping the quantity between 1 and the pool size. */
function toggleResource(r: SetupRequirement, resourceKey: string): SetupRequirement {
  const resourceKeys = r.resourceKeys.includes(resourceKey)
    ? r.resourceKeys.filter((k) => k !== resourceKey)
    : [...r.resourceKeys, resourceKey];
  return { ...r, resourceKeys, quantity: Math.max(1, Math.min(r.quantity, resourceKeys.length || 1)) };
}

/** Options, add-ons and requirements of one service. */
export const servicePartHandlers: SetupHandlers<ServicePartAction> = {
  addOption: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      options: [
        ...svc.options,
        {
          name: "",
          description: null,
          durationMinutes: svc.durationMinutes,
          priceCents: svc.priceCents,
          sortOrder: svc.options.length,
        },
      ],
    })),
  updateOption: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      options: mapAt(svc.options, action.index, (o) => ({ ...o, ...action.patch })),
    })),
  removeOption: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      options: renumber(without(svc.options, action.index)),
    })),
  addAddon: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      addons: [
        ...svc.addons,
        { name: "", description: null, extraMinutes: 15, priceCents: 0, sortOrder: svc.addons.length },
      ],
    })),
  updateAddon: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      addons: mapAt(svc.addons, action.index, (a) => ({ ...a, ...action.patch })),
    })),
  removeAddon: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      addons: renumber(without(svc.addons, action.index)),
    })),
  addRequirement: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      requirements: [
        ...svc.requirements,
        {
          label: draft.setup.vocabulary.resource,
          quantity: 1,
          customerSelectable: false,
          resourceKeys: draft.setup.resources.map((r) => r.key),
        },
      ],
    })),
  updateRequirement: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      requirements: svc.requirements.map((r, i) => {
        if (i === action.index) return { ...r, ...action.patch };
        // Only one requirement can be customer-selectable.
        return action.patch.customerSelectable ? { ...r, customerSelectable: false } : r;
      }),
    })),
  toggleRequirementResource: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      requirements: mapAt(svc.requirements, action.index, (r) => toggleResource(r, action.resourceKey)),
    })),
  removeRequirement: (draft, action) =>
    mapService(draft, action.serviceIndex, (svc) => ({
      ...svc,
      requirements: without(svc.requirements, action.index),
    })),
};
