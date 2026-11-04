"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { qk } from "../query-keys";
import { resourcesApi } from "../resources";
import type {
  AvailabilityOverride,
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
  ReplaceRulesResult,
  Resource,
  ResourceAvailability,
  ResourceInput,
} from "../types";
import {
  enabledWhen,
  invalidateAll,
  removeFromList,
  replaceInList,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

/**
 * Anything that changes resources or their hours affects bookable slots (including the marketplace listings'
 * next free times) and the setup checklist. `resources()` is a prefix of every `resourceAvailability`.
 */
const scheduleKeys = (businessId: string) => {
  const b = qk.business(businessId);
  return [
    b.resources(),
    b.closures(),
    b.availabilityAll(),
    b.overview(),
    qk.public.all(),
    qk.marketplace.all(),
  ];
};

export function useResources(businessId: string, options?: QueryOptions<Resource[]>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).resources(),
    queryFn: () => resourcesApi.list(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

/** A new resource may link a team member (`memberId`), whose `resourceId` the team list shows. */
export function useCreateResource(businessId: string, options?: MutationOptions<Resource, ResourceInput>) {
  return useApiMutation(
    (input: ResourceInput) => resourcesApi.create(businessId, input),
    (qc) => invalidateAll(qc, [...scheduleKeys(businessId), qk.business(businessId).team()]),
    options,
  );
}

export type UpdateResourceVariables = { id: string; input: Partial<ResourceInput> };

export function useUpdateResource(
  businessId: string,
  options?: MutationOptions<Resource, UpdateResourceVariables>,
) {
  return useApiMutation(
    ({ id, input }: UpdateResourceVariables) => resourcesApi.update(businessId, id, input),
    (qc, resource) => {
      replaceInList(qc, qk.business(businessId).resources(), resource);
      // Bookings (the calendar, lists, customer histories) embed the resource's name.
      const b = qk.business(businessId);
      return invalidateAll(qc, [...scheduleKeys(businessId), b.team(), b.bookings.all(), b.customers.all()]);
    },
    options,
  );
}

/** Variables: the resource id. Deactivates instead when the resource has bookings. */
export function useDeleteResource(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => resourcesApi.remove(businessId, id),
    (qc) => invalidateAll(qc, [...scheduleKeys(businessId), qk.business(businessId).team()]),
    options,
  );
}

/** Weekly rules + dated overrides for one resource. */
export function useResourceAvailability(
  businessId: string,
  resourceId: string,
  options?: QueryOptions<ResourceAvailability>,
) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).resourceAvailability(resourceId),
    queryFn: () => resourcesApi.availability(businessId, resourceId),
    enabled: enabledWhen(!!businessId && !!resourceId, options),
  });
}

/**
 * Weekly rules + overrides for several resources at once (calendar shading).
 * Returns one query result per id, in order; shares cache entries with
 * `useResourceAvailability` unless `from` asks for overrides from an earlier date than the API's default.
 */
export function useResourceAvailabilities(businessId: string, resourceIds: readonly string[], from?: string) {
  return useQueries({
    queries: resourceIds.map((resourceId) => ({
      queryKey: qk.business(businessId).resourceAvailability(resourceId, from),
      queryFn: () => resourcesApi.availability(businessId, resourceId, from),
      enabled: !!businessId && !!resourceId,
    })),
  });
}

/** Variables: the complete new weekly rule set (replaces the existing one). */
export function useReplaceResourceRules(
  businessId: string,
  resourceId: string,
  options?: MutationOptions<ReplaceRulesResult, AvailabilityRuleInput[]>,
) {
  return useApiMutation(
    (rules: AvailabilityRuleInput[]) => resourcesApi.replaceRules(businessId, resourceId, rules),
    (qc) => invalidateAll(qc, scheduleKeys(businessId)),
    options,
  );
}

export function useCreateResourceOverride(
  businessId: string,
  resourceId: string,
  options?: MutationOptions<AvailabilityOverride, AvailabilityOverrideInput>,
) {
  return useApiMutation(
    (input: AvailabilityOverrideInput) => resourcesApi.createOverride(businessId, resourceId, input),
    (qc) => invalidateAll(qc, scheduleKeys(businessId)),
    options,
  );
}

/** Variables: the override id. Deletes resource overrides and business-wide closures alike. */
export function useDeleteOverride(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (overrideId: string) => resourcesApi.deleteOverride(businessId, overrideId),
    (qc, _data, overrideId) => {
      removeFromList(qc, qk.business(businessId).closures(), overrideId);
      return invalidateAll(qc, scheduleKeys(businessId));
    },
    options,
  );
}

/** Business-wide closures, from `from` on (default: from 30 days ago). */
export function useClosures(
  businessId: string,
  options?: QueryOptions<AvailabilityOverride[]>,
  from?: string,
) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).closures(from),
    queryFn: () => resourcesApi.closures(businessId, from),
    enabled: enabledWhen(!!businessId, options),
  });
}

export function useCreateClosure(
  businessId: string,
  options?: MutationOptions<AvailabilityOverride, AvailabilityOverrideInput>,
) {
  return useApiMutation(
    (input: AvailabilityOverrideInput) => resourcesApi.createClosure(businessId, input),
    (qc) => invalidateAll(qc, scheduleKeys(businessId)),
    options,
  );
}
