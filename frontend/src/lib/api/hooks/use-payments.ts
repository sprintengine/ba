"use client";

import { useQuery } from "@tanstack/react-query";
import { paymentsApi } from "../payments";
import { qk } from "../query-keys";
import type { PaymentsStatus, ReturnUrlInput, UrlResponse } from "../types";
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
