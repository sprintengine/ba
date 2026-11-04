"use client";

import { useQuery } from "@tanstack/react-query";
import { paymentsApi } from "../payments";
import { qk } from "../query-keys";
import type {
  ConnectExistingInput,
  ConnectExistingResult,
  PaymentsStatus,
  ReturnUrlInput,
  UrlResponse,
} from "../types";
import {
  enabledWhen,
  invalidateAll,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

/** Admin only. */
export function usePaymentsStatus(businessId: string, options?: QueryOptions<PaymentsStatus>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).payments(),
    queryFn: () => paymentsApi.status(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

/** Owner only. Resolves with Stripe's page for connecting an existing account — redirect the browser to `url`. */
export function useConnectExistingPayments(
  businessId: string,
  options?: MutationOptions<UrlResponse, ReturnUrlInput>,
) {
  return useApiMutation(
    (input: ReturnUrlInput) => paymentsApi.connectExisting(businessId, input),
    (qc) => invalidateAll(qc, [qk.business(businessId).payments()]),
    options,
  );
}

/** Owner only. Finishes connecting an existing account with what Stripe's redirect carried back. */
export function useCompleteConnectExisting(
  businessId: string,
  options?: MutationOptions<ConnectExistingResult, ConnectExistingInput>,
) {
  return useApiMutation(
    (input: ConnectExistingInput) => paymentsApi.completeExisting(businessId, input),
    (qc) => invalidateAll(qc, [qk.business(businessId).payments()]),
    options,
  );
}

/** Owner only. Disconnects the business's Stripe account; online payments stop until one is connected again. */
export function useDisconnectPayments(businessId: string, options?: MutationOptions<PaymentsStatus, void>) {
  return useApiMutation(
    () => paymentsApi.disconnect(businessId),
    (qc) => invalidateAll(qc, [qk.business(businessId).payments()]),
    options,
  );
}

/** Owner only. Resolves with the Stripe onboarding URL — redirect the browser to `url`. */
export function useConnectPayments(
  businessId: string,
  options?: MutationOptions<UrlResponse, ReturnUrlInput>,
) {
  return useApiMutation(
    (input: ReturnUrlInput) => paymentsApi.connect(businessId, input),
    (qc) => invalidateAll(qc, [qk.business(businessId).payments()]),
    options,
  );
}
