import { api } from "./client";
import { businessPath, seg } from "./paths";
import type {
  AvailabilityOverride,
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
  Resource,
  ResourceAvailability,
  ReplaceRulesResult,
  ResourceInput,
} from "./types";

/** Resources, weekly rules, overrides and business-wide closures (§6.5). */
export const resourcesApi = {
  list: (businessId: string): Promise<Resource[]> =>
    api.get<Resource[]>(businessPath(businessId, "/resources")),

  create: (businessId: string, body: ResourceInput): Promise<Resource> =>
    api.post<Resource>(businessPath(businessId, "/resources"), body),

  update: (businessId: string, resourceId: string, body: Partial<ResourceInput>): Promise<Resource> =>
    api.patch<Resource>(businessPath(businessId, `/resources/${seg(resourceId)}`), body),

  /** Deactivates instead of deleting when the resource has bookings. */
  remove: (businessId: string, resourceId: string): Promise<void> =>
    api.delete(businessPath(businessId, `/resources/${seg(resourceId)}`)),

  /** Overrides from `from` on (default: from 30 days ago). */
  availability: (businessId: string, resourceId: string, from?: string): Promise<ResourceAvailability> =>
    api.get<ResourceAvailability>(businessPath(businessId, `/resources/${seg(resourceId)}/availability`), {
      from,
    }),

  /** Replaces the resource's whole weekly rule set; responds with the new set. */
  replaceRules: (
    businessId: string,
    resourceId: string,
    rules: AvailabilityRuleInput[],
  ): Promise<ReplaceRulesResult> =>
    api.put<ReplaceRulesResult>(businessPath(businessId, `/resources/${seg(resourceId)}/rules`), { rules }),

  createOverride: (
    businessId: string,
    resourceId: string,
    body: AvailabilityOverrideInput,
  ): Promise<AvailabilityOverride> =>
    api.post<AvailabilityOverride>(businessPath(businessId, `/resources/${seg(resourceId)}/overrides`), body),

  /** Deletes a resource override or a business-wide closure. */
  deleteOverride: (businessId: string, overrideId: string): Promise<void> =>
    api.delete(businessPath(businessId, `/overrides/${seg(overrideId)}`)),

  /** Business-wide closures (`AvailabilityOverride` with `resourceId: null`), from `from` on (default: 30 days ago). */
  closures: (businessId: string, from?: string): Promise<AvailabilityOverride[]> =>
    api.get<AvailabilityOverride[]>(businessPath(businessId, "/closures"), { from }),

  createClosure: (businessId: string, body: AvailabilityOverrideInput): Promise<AvailabilityOverride> =>
    api.post<AvailabilityOverride>(businessPath(businessId, "/closures"), body),
};
