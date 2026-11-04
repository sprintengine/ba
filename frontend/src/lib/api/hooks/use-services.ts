"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "../query-keys";
import { servicesApi } from "../services";
import type { Service, ServiceInput } from "../types";
import {
  enabledWhen,
  invalidateAll,
  replaceInList,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

/** Services set slots and prices: availability, the setup checklist, public pages and marketplace listings. */
const serviceKeys = (businessId: string) => {
  const b = qk.business(businessId);
  return [b.services(), b.availabilityAll(), b.overview(), qk.public.all(), qk.marketplace.all()];
};

export function useServices(businessId: string, options?: QueryOptions<Service[]>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).services(),
    queryFn: () => servicesApi.list(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

export function useCreateService(businessId: string, options?: MutationOptions<Service, ServiceInput>) {
  return useApiMutation(
    (input: ServiceInput) => servicesApi.create(businessId, input),
    (qc) => invalidateAll(qc, serviceKeys(businessId)),
    options,
  );
}

export type ReplaceServiceVariables = { id: string; input: ServiceInput };

/** Full replace (PUT), including options/addons/requirements. */
export function useReplaceService(
  businessId: string,
  options?: MutationOptions<Service, ReplaceServiceVariables>,
) {
  return useApiMutation(
    ({ id, input }: ReplaceServiceVariables) => servicesApi.replace(businessId, id, input),
    (qc, service) => {
      replaceInList(qc, qk.business(businessId).services(), service);
      // Bookings (the calendar, lists, customer histories) embed the service's name and colour.
      const b = qk.business(businessId);
      return invalidateAll(qc, [...serviceKeys(businessId), b.bookings.all(), b.customers.all()]);
    },
    options,
  );
}

/** Variables: the service id. Deactivates instead when the service has bookings. */
export function useDeleteService(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => servicesApi.remove(businessId, id),
    (qc) => invalidateAll(qc, serviceKeys(businessId)),
    options,
  );
}
