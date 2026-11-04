import { api, type RequestOptions } from "./client";
import { seg } from "./paths";
import type {
  Availability,
  PublicAvailabilityQuery,
  BookingResult,
  BusinessSetup,
  CancelInput,
  CheckoutUrl,
  CreatePublicBooking,
  CustomerAvailabilityRange,
  DevPaymentInfo,
  DevPaymentOutcome,
  Health,
  ManagedBooking,
  PublicBusiness,
  PublicService,
  RedirectUrl,
  RescheduleInput,
  TemplateSummary,
} from "./types";

/**
 * Public endpoints (§6.1). No sign-in required; the bearer token is still sent
 * when present (members may preview draft businesses, bookings link to the user).
 */
export const publicApi = {
  health: (): Promise<Health> => api.get<Health>("/v1/health"),

  templates: (): Promise<TemplateSummary[]> => api.get<TemplateSummary[]>("/v1/public/templates"),

  template: (key: string): Promise<BusinessSetup> =>
    api.get<BusinessSetup>(`/v1/public/templates/${seg(key)}`),

  business: (slug: string): Promise<PublicBusiness> =>
    api.get<PublicBusiness>(`/v1/public/businesses/${seg(slug)}`),

  services: (slug: string): Promise<PublicService[]> =>
    api.get<PublicService[]>(`/v1/public/businesses/${seg(slug)}/services`),

  availability: (
    slug: string,
    query: PublicAvailabilityQuery,
    options?: Pick<RequestOptions, "signal">,
  ): Promise<Availability> =>
    api.get<Availability>(`/v1/public/businesses/${seg(slug)}/availability`, query, options),

  /** `idempotencyKey`: create once per submit intent (`newIdempotencyKey()`) and reuse on retry. */
  createBooking: (slug: string, body: CreatePublicBooking, idempotencyKey: string): Promise<BookingResult> =>
    api.post<BookingResult>(`/v1/public/businesses/${seg(slug)}/bookings`, body, { idempotencyKey }),

  manage: (token: string): Promise<ManagedBooking> =>
    api.get<ManagedBooking>(`/v1/public/manage/${seg(token)}`),

  cancelManaged: (token: string, body: CancelInput = {}): Promise<ManagedBooking> =>
    api.post<ManagedBooking>(`/v1/public/manage/${seg(token)}/cancel`, body),

  rescheduleManaged: (token: string, body: RescheduleInput): Promise<ManagedBooking> =>
    api.post<ManagedBooking>(`/v1/public/manage/${seg(token)}/reschedule`, body),

  manageAvailability: (
    token: string,
    range: CustomerAvailabilityRange,
    options?: Pick<RequestOptions, "signal">,
  ): Promise<Availability> =>
    api.get<Availability>(`/v1/public/manage/${seg(token)}/availability`, range, options),

  /** Resume payment for a still-held booking. */
  payManaged: (token: string): Promise<CheckoutUrl> =>
    api.post<CheckoutUrl>(`/v1/public/manage/${seg(token)}/pay`),

  /** Development payment provider only. */
  devPayment: (paymentId: string): Promise<DevPaymentInfo> =>
    api.get<DevPaymentInfo>(`/v1/public/dev-payments/${seg(paymentId)}`),

  /** Development payment provider only. */
  completeDevPayment: (paymentId: string, outcome: DevPaymentOutcome): Promise<RedirectUrl> =>
    api.post<RedirectUrl>(`/v1/public/dev-payments/${seg(paymentId)}/complete`, { outcome }),
};
