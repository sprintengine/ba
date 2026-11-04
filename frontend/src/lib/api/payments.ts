import { api } from "./client";
import { businessPath } from "./paths";
import type {
  ConnectExistingInput,
  ConnectExistingResult,
  PaymentsStatus,
  ReturnUrlInput,
  UrlResponse,
} from "./types";

/** Payment provider connection (§6.8). */
export const paymentsApi = {
  /** Admin only. */
  status: (businessId: string): Promise<PaymentsStatus> =>
    api.get<PaymentsStatus>(businessPath(businessId, "/payments/status")),

  /** Owner only. Returns a Stripe onboarding link (creates the connected account on first call). */
  connect: (businessId: string, body: ReturnUrlInput): Promise<UrlResponse> =>
    api.post<UrlResponse>(businessPath(businessId, "/payments/connect"), body),

  /**
   * Owner only. Returns Stripe's page for connecting an account the business already has. Stripe comes back to
   * `returnUrl?stripe=complete&code=…&state=…` (then call `completeExisting`) or `?stripe=connect_error&reason=…`.
   */
  connectExisting: (businessId: string, body: ReturnUrlInput): Promise<UrlResponse> =>
    api.post<UrlResponse>(businessPath(businessId, "/payments/connect/existing"), body),

  /** Owner only. Finishes connecting with what Stripe's redirect carried back (`?stripe=complete&code=&state=`). */
  completeExisting: (businessId: string, body: ConnectExistingInput): Promise<ConnectExistingResult> =>
    api.post<ConnectExistingResult>(businessPath(businessId, "/payments/connect/existing/complete"), body),

  /** Owner only. Forgets the business's Stripe account (and ends our access to one connected with OAuth). */
  disconnect: (businessId: string): Promise<PaymentsStatus> =>
    api.post<PaymentsStatus>(businessPath(businessId, "/payments/disconnect")),
};
