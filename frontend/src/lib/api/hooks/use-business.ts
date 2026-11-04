"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { businessApi } from "../business";
import { qk } from "../query-keys";
import type {
  Business,
  CustomerGroup,
  CustomerGroupInput,
  FormQuestion,
  FormQuestionInput,
  Overview,
  UpdateBusiness,
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

export function useBusiness(businessId: string, options?: QueryOptions<Business>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).detail(),
    queryFn: () => businessApi.get(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

/**
 * Reads the business by its slug, for the dashboard to start it alongside `/me` instead of after it (the URL names the
 * slug before the memberships say which business it is). The business is stored under its id, where `useBusiness`
 * finds it fresh; the query itself holds only the id, or null when the slug didn't lead to the business (an error,
 * not a member, a renamed address): `useBusiness` then reads by id as before, which decides what to show. Read once
 * per slug: `useBusiness` keeps the business fresh.
 */
export function useBusinessBySlug(slug: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.businessBySlug(slug),
    queryFn: async ({ signal }) => {
      try {
        const business = await businessApi.getBySlug(slug, { signal });
        qc.setQueryData(qk.business(business.id).detail(), business);
        return business.id;
      } catch {
        return null;
      }
    },
    enabled: !!slug,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * Also refreshes `me` (memberships carry name/slug/branding), staff availability (timezone and policies shape the
 * slots), cached public pages and marketplace listings (they embed name, address, branding and timezone).
 */
export function useUpdateBusiness(businessId: string, options?: MutationOptions<Business, UpdateBusiness>) {
  return useApiMutation(
    (input: UpdateBusiness) => businessApi.update(businessId, input),
    (qc, business) => {
      const b = qk.business(businessId);
      qc.setQueryData(b.detail(), business);
      return invalidateAll(qc, [
        qk.me(),
        b.overview(),
        b.availabilityAll(),
        qk.public.all(),
        qk.marketplace.all(),
      ]);
    },
    options,
  );
}

/** Owner only. Soft-deletes (suspends) the business and drops its cached data. */
export function useDeleteBusiness(businessId: string, options?: MutationOptions<void, void>) {
  return useApiMutation(
    () => businessApi.remove(businessId),
    (qc) => {
      qc.removeQueries({ queryKey: qk.business(businessId).root() });
      return invalidateAll(qc, [qk.me()]);
    },
    options,
  );
}

/**
 * Pass the business's `today`, so the cached overview isn't shown for yesterday after midnight (the server works out
 * today itself; the date only keys the cache).
 */
export function useOverview(businessId: string, today?: string, options?: QueryOptions<Overview>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).overview(today),
    queryFn: () => businessApi.overview(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

// --- Customer groups -------------------------------------------------------

export function useCustomerGroups(businessId: string, options?: QueryOptions<CustomerGroup[]>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).customerGroups(),
    queryFn: () => businessApi.customerGroups(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

export type UpdateCustomerGroupVariables = { id: string; input: Partial<CustomerGroupInput> };

/** Groups are embedded in `Business.customerGroups`, so the business detail is refreshed too. */
const customerGroupKeys = (businessId: string) => [
  qk.business(businessId).customerGroups(),
  qk.business(businessId).detail(),
  qk.public.all(),
];

export function useCreateCustomerGroup(
  businessId: string,
  options?: MutationOptions<CustomerGroup, CustomerGroupInput>,
) {
  return useApiMutation(
    (input: CustomerGroupInput) => businessApi.createCustomerGroup(businessId, input),
    (qc) => invalidateAll(qc, customerGroupKeys(businessId)),
    options,
  );
}

export function useUpdateCustomerGroup(
  businessId: string,
  options?: MutationOptions<CustomerGroup, UpdateCustomerGroupVariables>,
) {
  return useApiMutation(
    ({ id, input }: UpdateCustomerGroupVariables) => businessApi.updateCustomerGroup(businessId, id, input),
    (qc, group) => {
      replaceInList(qc, qk.business(businessId).customerGroups(), group);
      return invalidateAll(qc, customerGroupKeys(businessId));
    },
    options,
  );
}

/** Variables: the group id. */
export function useDeleteCustomerGroup(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => businessApi.deleteCustomerGroup(businessId, id),
    (qc, _data, id) => {
      removeFromList(qc, qk.business(businessId).customerGroups(), id);
      return invalidateAll(qc, customerGroupKeys(businessId));
    },
    options,
  );
}

// --- Questions -------------------------------------------------------------

export function useQuestions(businessId: string, options?: QueryOptions<FormQuestion[]>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).questions(),
    queryFn: () => businessApi.questions(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

export type UpdateQuestionVariables = { id: string; input: Partial<FormQuestionInput> };

const questionKeys = (businessId: string) => [qk.business(businessId).questions(), qk.public.all()];

export function useCreateQuestion(
  businessId: string,
  options?: MutationOptions<FormQuestion, FormQuestionInput>,
) {
  return useApiMutation(
    (input: FormQuestionInput) => businessApi.createQuestion(businessId, input),
    (qc) => invalidateAll(qc, questionKeys(businessId)),
    options,
  );
}

export function useUpdateQuestion(
  businessId: string,
  options?: MutationOptions<FormQuestion, UpdateQuestionVariables>,
) {
  return useApiMutation(
    ({ id, input }: UpdateQuestionVariables) => businessApi.updateQuestion(businessId, id, input),
    (qc, question) => {
      replaceInList(qc, qk.business(businessId).questions(), question);
      return invalidateAll(qc, questionKeys(businessId));
    },
    options,
  );
}

/** Variables: the question id. */
export function useDeleteQuestion(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => businessApi.deleteQuestion(businessId, id),
    (qc, _data, id) => {
      removeFromList(qc, qk.business(businessId).questions(), id);
      return invalidateAll(qc, questionKeys(businessId));
    },
    options,
  );
}
