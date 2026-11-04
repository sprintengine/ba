"use client";

import { useQueries, useQuery, type QueryClient } from "@tanstack/react-query";
import { meApi } from "../me";
import { qk } from "../query-keys";
import type {
  AcceptedInvitation,
  CancelInput,
  CheckoutUrl,
  CustomerBooking,
  DateRange,
  Me,
  MyBookings,
  RescheduleInput,
} from "../types";
import { invalidateAll, useApiMutation, type MutationOptions, type QueryOptions } from "./shared";
import { combineWindows } from "./use-public";

/** The signed-in user. Only enable once the auth layer has a session. */
export function useMe(options?: QueryOptions<Me>) {
  return useQuery({ ...options, queryKey: qk.me(), queryFn: () => meApi.me() });
}

export function useMyBookings(options?: QueryOptions<MyBookings>) {
  return useQuery({ ...options, queryKey: qk.myBookings(), queryFn: () => meApi.bookings() });
}

export type CancelMyBookingVariables = { id: string; input?: CancelInput };
export type RescheduleMyBookingVariables = { id: string; input: RescheduleInput };

/** My bookings, and the business's free times and deals (a cancellation frees a deal's redemption). */
const afterMyBookingChange = (qc: QueryClient, booking: CustomerBooking) =>
  invalidateAll(qc, [
    qk.myBookings(),
    qk.public.availabilityAll(booking.business.slug),
    qk.public.offers(booking.business.slug),
  ]);

export function useCancelMyBooking(options?: MutationOptions<CustomerBooking, CancelMyBookingVariables>) {
  return useApiMutation(
    ({ id, input }: CancelMyBookingVariables) => meApi.cancelBooking(id, input),
    afterMyBookingChange,
    options,
  );
}

export function useRescheduleMyBooking(
  options?: MutationOptions<CustomerBooking, RescheduleMyBookingVariables>,
) {
  return useApiMutation(
    ({ id, input }: RescheduleMyBookingVariables) => meApi.rescheduleBooking(id, input),
    afterMyBookingChange,
    options,
  );
}

/**
 * Reschedule slots for one of my bookings across several windows (the booking's own
 * service, duration and customer group; its current time doesn't count as busy).
 */
export function useMyBookingAvailabilityWindows(bookingId: string, windows: DateRange[], enabled = true) {
  return useQueries({
    queries: windows.map((w) => ({
      queryKey: qk.myBookingAvailability(bookingId, w),
      queryFn: () => meApi.bookingAvailability(bookingId, w),
      enabled: enabled && !!bookingId,
      staleTime: 30_000,
    })),
    combine: combineWindows(windows),
  });
}

/** Variables: the booking id. Resolves to a fresh checkout URL for a held booking; redirect to it. */
export function usePayMyBooking(options?: MutationOptions<CheckoutUrl, string>) {
  return useApiMutation((id: string) => meApi.payBooking(id), undefined, options);
}

/** Variables: the invitation token. Resolves to the refreshed `Me` and the business joined. */
export function useAcceptInvitation(options?: MutationOptions<AcceptedInvitation, string>) {
  return useApiMutation(
    (token: string) => meApi.acceptInvitation(token),
    (qc, { joinedBusinessId: _joined, ...me }) => {
      qc.setQueryData<Me>(qk.me(), me);
    },
    options,
  );
}
