"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { customersApi } from "../customers";
import { qk } from "../query-keys";
import type {
  Customer,
  CustomerDetail,
  CustomerExport,
  CustomerInput,
  CustomerListQuery,
  Page,
} from "../types";
import {
  cursorPaging,
  loadedItems,
  enabledWhen,
  invalidateAll,
  useApiMutation,
  type InfiniteQueryOptions,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

/** Single page — handy for search-as-you-type pickers. */
export function useCustomers(
  businessId: string,
  query: CustomerListQuery = {},
  options?: QueryOptions<Page<Customer>>,
) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).customers.list(query),
    queryFn: () => customersApi.list(businessId, query),
    enabled: enabledWhen(!!businessId, options),
  });
}

export function useInfiniteCustomers(
  businessId: string,
  query: Omit<CustomerListQuery, "cursor"> = {},
  options?: InfiniteQueryOptions<Customer>,
) {
  return useInfiniteQuery({
    ...options,
    ...cursorPaging,
    queryKey: qk.business(businessId).customers.infinite(query),
    queryFn: ({ pageParam }) => customersApi.list(businessId, { ...query, cursor: pageParam }),
    select: loadedItems,
    enabled: enabledWhen(!!businessId, options),
  });
}

export function useCustomer(businessId: string, customerId: string, options?: QueryOptions<CustomerDetail>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).customers.detail(customerId),
    queryFn: () => customersApi.get(businessId, customerId),
    enabled: enabledWhen(!!businessId && !!customerId, options),
  });
}

export function useCreateCustomer(businessId: string, options?: MutationOptions<Customer, CustomerInput>) {
  return useApiMutation(
    (input: CustomerInput) => customersApi.create(businessId, input),
    (qc) => invalidateAll(qc, [qk.business(businessId).customers.all()]),
    options,
  );
}

export type UpdateCustomerVariables = { id: string; input: CustomerInput };

export function useUpdateCustomer(
  businessId: string,
  options?: MutationOptions<Customer, UpdateCustomerVariables>,
) {
  return useApiMutation(
    ({ id, input }: UpdateCustomerVariables) => customersApi.update(businessId, id, input),
    (qc, customer) => {
      qc.setQueryData<CustomerDetail>(qk.business(businessId).customers.detail(customer.id), (old) =>
        old ? { ...old, ...customer } : old,
      );
      // Bookings (and the overview's list of today's) embed the customer's name/email/phone.
      return invalidateAll(qc, [
        qk.business(businessId).customers.all(),
        qk.business(businessId).bookings.all(),
        qk.business(businessId).overview(),
      ]);
    },
    options,
  );
}

/** Variables: the customer id. Admin only — GDPR erase (anonymises the customer and their answers). */
export function useEraseCustomer(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => customersApi.erase(businessId, id),
    (qc, _data, id) => {
      qc.removeQueries({ queryKey: qk.business(businessId).customers.detail(id) });
      return invalidateAll(qc, [
        qk.business(businessId).customers.all(),
        qk.business(businessId).bookings.all(),
        qk.business(businessId).overview(),
      ]);
    },
    options,
  );
}

/**
 * Variables: the customer id. Admin only. A mutation rather than a query
 * because the export is fetched on demand (download button) and never cached.
 */
export function useExportCustomer(businessId: string, options?: MutationOptions<CustomerExport, string>) {
  return useApiMutation((id: string) => customersApi.export(businessId, id), undefined, options);
}
