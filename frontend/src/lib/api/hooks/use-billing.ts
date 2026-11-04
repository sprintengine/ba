"use client";

import { useQuery } from "@tanstack/react-query";
import { billingApi } from "../billing";
import { qk } from "../query-keys";
import type { BillingCheckoutInput, BillingInfo, ReturnUrlInput, UrlResponse } from "../types";
import { enabledWhen, useApiMutation, type MutationOptions, type QueryOptions } from "./shared";

/** Owner only. */
export function useBilling(businessId: string, options?: QueryOptions<BillingInfo>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).billing(),
    queryFn: () => billingApi.get(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

/** Owner only. Resolves with a Stripe Checkout URL — redirect the browser to `url`. */
export function useBillingCheckout(
  businessId: string,
  options?: MutationOptions<UrlResponse, BillingCheckoutInput>,
) {
  return useApiMutation(
    (input: BillingCheckoutInput) => billingApi.checkout(businessId, input),
    undefined,
    options,
  );
}

/** Owner only. Resolves with a Stripe Billing Portal URL — redirect the browser to `url`. */
export function useBillingPortal(businessId: string, options?: MutationOptions<UrlResponse, ReturnUrlInput>) {
  return useApiMutation((input: ReturnUrlInput) => billingApi.portal(businessId, input), undefined, options);
}
