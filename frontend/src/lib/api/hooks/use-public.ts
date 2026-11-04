"use client";

import {
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { classifyBookingError } from "@/lib/booking/errors";
import type { ApiError } from "../client";
import { publicApi } from "../public";
import { qk } from "../query-keys";
import type {
  Availability,
  AvailabilityQuery,
  BookingResult,
  BusinessSetup,
  CancelInput,
  CheckoutUrl,
  CreatePublicBooking,
  DateRange,
  DevPaymentInfo,
  DevPaymentOutcome,
  ManagedBooking,
  PublicBusiness,
  PublicService,
  RedirectUrl,
  RescheduleInput,
  Slot,
  TemplateSummary,
} from "../types";
import {
  enabledWhen,
  invalidateAll,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

export function useTemplates(options?: QueryOptions<TemplateSummary[]>) {
  return useQuery({
    staleTime: Infinity,
    ...options,
    queryKey: qk.templates.all(),
    queryFn: () => publicApi.templates(),
  });
}

export function useTemplate(key: string, options?: QueryOptions<BusinessSetup>) {
  return useQuery({
    staleTime: Infinity,
    ...options,
    queryKey: qk.templates.detail(key),
    queryFn: () => publicApi.template(key),
    enabled: enabledWhen(!!key, options),
  });
}

export function usePublicBusiness(slug: string, options?: QueryOptions<PublicBusiness>) {
  return useQuery({
    ...options,
    queryKey: qk.public.business(slug),
    queryFn: () => publicApi.business(slug),
    enabled: enabledWhen(!!slug, options),
  });
}

export function usePublicServices(slug: string, options?: QueryOptions<PublicService[]>) {
  return useQuery({
    ...options,
    queryKey: qk.public.services(slug),
    queryFn: () => publicApi.services(slug),
    enabled: enabledWhen(!!slug, options),
  });
}

export type CreatePublicBookingVariables = {
  body: CreatePublicBooking;
  /** Create once per submit intent with `newIdempotencyKey()`; reuse it when retrying. */
  idempotencyKey: string;
};

/**
 * Books publicly. On success the new booking is cached as the manage page's data (so `/manage/{token}` opens
 * without a refetch) and availability and My bookings are refreshed in the background. When the time was taken meanwhile, every
 * cached availability window of the business is refetched so the customer can pick another; when its price changed
 * (PRICE_CHANGED), the windows and the deals are, so the review step shows the price the booking would now get.
 */
export function useCreatePublicBooking(
  slug: string,
  options?: MutationOptions<BookingResult, CreatePublicBookingVariables>,
) {
  const queryClient = useQueryClient();
  return useApiMutation(
    ({ body, idempotencyKey }: CreatePublicBookingVariables) =>
      publicApi.createBooking(slug, body, idempotencyKey),
    (qc, result, { body }) => {
      const managed: ManagedBooking = { ...result.booking, customer: { ...body.customer } };
      qc.setQueryData(qk.public.manage(result.manageToken), managed);
      // A capped deal's last redemption may be gone: the site stops showing it. Not awaited: the customer goes on
      // to the manage page or payment without waiting for the flow's availability to refetch (and its price to
      // change on screen meanwhile).
      void invalidateAll(qc, [qk.public.availabilityAll(slug), qk.public.offers(slug), qk.myBookings()]);
    },
    {
      ...options,
      onError: (error, ...rest) => {
        const kind = classifyBookingError(error);
        if (kind === "slot_taken") {
          void queryClient.invalidateQueries({ queryKey: qk.public.availabilityAll(slug) });
        } else if (kind === "price_changed") {
          // The chosen time's deal ran out (or the price changed): its slot and the site's deals show the new price.
          void invalidateAll(queryClient, [qk.public.availabilityAll(slug), qk.public.offers(slug)]);
        }
        return options?.onError?.(error, ...rest);
      },
    },
  );
}

export function useManagedBooking(token: string, options?: QueryOptions<ManagedBooking>) {
  return useQuery({
    ...options,
    queryKey: qk.public.manage(token),
    queryFn: () => publicApi.manage(token),
    enabled: enabledWhen(!!token, options),
  });
}

function onManagedChange(token: string) {
  return async (qc: QueryClient, booking: ManagedBooking) => {
    // A read sent before the change (a poll) must not land after it and put the old booking back.
    await qc.cancelQueries({ queryKey: qk.public.manage(token) });
    qc.setQueryData(qk.public.manage(token), booking);
    return invalidateAll(qc, [
      qk.public.manageAvailabilityAll(token),
      qk.public.availabilityAll(booking.business.slug),
      // A cancellation frees a deal's redemption.
      qk.public.offers(booking.business.slug),
      qk.myBookings(),
    ]);
  };
}

export function useCancelManagedBooking(
  token: string,
  options?: MutationOptions<ManagedBooking, CancelInput>,
) {
  return useApiMutation(
    (input: CancelInput) => publicApi.cancelManaged(token, input),
    onManagedChange(token),
    options,
  );
}

export function useRescheduleManagedBooking(
  token: string,
  options?: MutationOptions<ManagedBooking, RescheduleInput>,
) {
  return useApiMutation(
    (input: RescheduleInput) => publicApi.rescheduleManaged(token, input),
    onManagedChange(token),
    options,
  );
}

/** Back from Checkout: confirms the payment straight away (the same path as Stripe's webhook, once). */
export function useConfirmManagedPayment(token: string, options?: MutationOptions<ManagedBooking, string>) {
  return useApiMutation(
    (sessionId: string) => publicApi.confirmManagedPayment(token, { sessionId }),
    onManagedChange(token),
    options,
  );
}

/** Returns a fresh checkout URL for a still-held unpaid booking; redirect to it. */
export function usePayManagedBooking(token: string, options?: MutationOptions<CheckoutUrl, void>) {
  return useApiMutation(() => publicApi.payManaged(token), undefined, options);
}

export function useDevPayment(paymentId: string, options?: QueryOptions<DevPaymentInfo>) {
  return useQuery({
    ...options,
    queryKey: qk.public.devPayment(paymentId),
    queryFn: () => publicApi.devPayment(paymentId),
    enabled: enabledWhen(!!paymentId, options),
  });
}

export function useCompleteDevPayment(
  paymentId: string,
  options?: MutationOptions<RedirectUrl, DevPaymentOutcome>,
) {
  return useApiMutation(
    (outcome: DevPaymentOutcome) => publicApi.completeDevPayment(paymentId, outcome),
    (qc) => invalidateAll(qc, [qk.public.devPayment(paymentId)]),
    options,
  );
}

// ---------------------------------------------------------------------------
// Windowed availability (calendar views spanning several ≤31-day windows)
// ---------------------------------------------------------------------------

/** Availability merged across several `from`/`to` windows (each ≤31 days, the API maximum). */
export type AvailabilityWindows = {
  /** date → slots, for every date covered by a loaded window. */
  days: Map<string, Slot[]>;
  /**
   * Days a release schedule keeps closed (§21) that would have times: when each opens, or null when it is held until
   * the business opens it. Their `days` entry has no slots.
   */
  locks: Map<string, { opensAt: string | null }>;
  /** Windows still loading for the first time. */
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: ApiError | null;
  /** Dates whose window has loaded (so "no slots" is known, not just unknown). */
  loaded: (date: string) => boolean;
  /** The business offers its next available time only (customer availability; see `useNextSlot`). */
  nextAvailableOnly: boolean;
  refetch: () => void;
};

/** Merges `useQueries` results for several windows into one `AvailabilityWindows`. */
export function combineWindows(windows: DateRange[]) {
  return (results: UseQueryResult<Availability>[]): AvailabilityWindows => {
    const days = new Map<string, Slot[]>();
    const locks = new Map<string, { opensAt: string | null }>();
    const loadedRanges: DateRange[] = [];
    results.forEach((r, i) => {
      const window = windows[i];
      if (!r.data || !window) return;
      loadedRanges.push(window);
      for (const day of r.data.days) {
        days.set(day.date, day.slots);
        if (day.opensAt !== null || day.held) locks.set(day.date, { opensAt: day.opensAt });
      }
    });
    const firstError = (results.find((r) => r.isError)?.error ?? null) as ApiError | null;
    return {
      days,
      locks,
      isPending: results.some((r) => r.isPending && r.fetchStatus !== "idle"),
      isFetching: results.some((r) => r.isFetching),
      isError: !!firstError,
      error: firstError,
      loaded: (date) => loadedRanges.some((w) => date >= w.from && date <= w.to),
      nextAvailableOnly: results.some((r) => r.data?.nextAvailableOnly),
      refetch: () => results.forEach((r) => void r.refetch()),
    };
  };
}

/** Public availability for several windows at once (keyed per window, so overlapping views share entries). */
export function usePublicAvailabilityWindows(
  slug: string,
  query: Omit<AvailabilityQuery, "from" | "to">,
  windows: DateRange[],
) {
  return useQueries({
    queries: windows.map((w) => {
      const q: AvailabilityQuery = { ...query, from: w.from, to: w.to };
      return {
        queryKey: qk.public.availability(slug, q),
        queryFn: ({ signal }) => publicApi.availability(slug, q, { signal }),
        enabled: !!slug && !!query.serviceId,
        staleTime: 30_000,
      };
    }),
    combine: combineWindows(windows),
  });
}

/** Reschedule availability for a managed booking across several windows. */
export function useManagedAvailabilityWindows(token: string, windows: DateRange[]) {
  return useQueries({
    queries: windows.map((w) => ({
      queryKey: qk.public.manageAvailability(token, w),
      queryFn: ({ signal }) => publicApi.manageAvailability(token, w, { signal }),
      enabled: !!token,
      staleTime: 30_000,
    })),
    combine: combineWindows(windows),
  });
}
