import { api } from "./client";
import { businessPath } from "./paths";
import type { PaymentsStatus, ReturnUrlInput, UrlResponse } from "./types";

/** Payment provider connection (§6.8). */
export const paymentsApi = {
  /** Admin only. */
  status: (businessId: string): Promise<PaymentsStatus> =>
    api.get<PaymentsStatus>(businessPath(businessId, "/payments/status")),

  /** Owner only. Returns a Stripe onboarding link (creates the connected account on first call). */
  connect: (businessId: string, body: ReturnUrlInput): Promise<UrlResponse> =>
    api.post<UrlResponse>(businessPath(businessId, "/payments/connect"), body),
};
