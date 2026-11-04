import { api } from "./client";
import { businessPath } from "./paths";
import type { BillingCheckoutInput, BillingInfo, ReturnUrlInput, UrlResponse } from "./types";

/** Platform subscription billing (§6.8). Owner only. */
export const billingApi = {
  get: (businessId: string): Promise<BillingInfo> =>
    api.get<BillingInfo>(businessPath(businessId, "/billing")),

  /** Stripe Checkout (subscription) URL. */
  checkout: (businessId: string, body: BillingCheckoutInput): Promise<UrlResponse> =>
    api.post<UrlResponse>(businessPath(businessId, "/billing/checkout"), body),

  /** Stripe Billing Portal URL. */
  portal: (businessId: string, body: ReturnUrlInput): Promise<UrlResponse> =>
    api.post<UrlResponse>(businessPath(businessId, "/billing/portal"), body),
};
