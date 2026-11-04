import type { GroupAction, SetupHandlers } from "../actions";
import { uniqueKey, uniqueName } from "../keys";
import { withSetup } from "./edit";

/** Customer groups are referenced by `key` from services and opening hours; removing one cleans both up. */
export const groupHandlers: SetupHandlers<GroupAction> = {
  addGroup: (draft) =>
    withSetup(draft, (s) => {
      const name = uniqueName(
        "New group",
        s.customerGroups.map((g) => g.name),
      );
      const key = uniqueKey(
        name,
        s.customerGroups.map((g) => g.key),
        "group",
      );
      return {
        ...s,
        customerGroups: [...s.customerGroups, { key, name, description: null, restricted: false }],
      };
    }),
  updateGroup: (draft, action) =>
    withSetup(draft, (s) => ({
      ...s,
      customerGroups: s.customerGroups.map((g) => (g.key === action.key ? { ...g, ...action.patch } : g)),
    })),
  removeGroup: (draft, action) =>
    withSetup(draft, (s) => ({
      ...s,
      customerGroups: s.customerGroups.filter((g) => g.key !== action.key),
      services: s.services.map((svc) => ({
        ...svc,
        allowedGroupKeys: svc.allowedGroupKeys.filter((k) => k !== action.key),
      })),
      resources: s.resources.map((r) => ({
        ...r,
        weeklyHours: r.weeklyHours.map((h) => ({
          ...h,
          audienceGroupKeys: h.audienceGroupKeys.filter((k) => k !== action.key),
        })),
      })),
    })),
};
