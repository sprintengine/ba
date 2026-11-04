"use client";

import { hashKey, noop, useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import { bookingsApi } from "../bookings";
import { qk } from "../query-keys";
import type {
  Availability,
  Booking,
  BookingDetail,
  BookingListQuery,
  BookingStatus,
  CancelStaffBookingInput,
  CreateStaffBooking,
  CreatedBooking,
  DeclineBookingInput,
  Page,
  PaymentLinkSent,
  RescheduleStaffBookingInput,
  StaffAvailabilityQuery,
  TerminalBookingStatus,
  UpdateBookingInput,
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

/**
 * Single page of bookings — use for calendar ranges (`from`/`to`, generous
 * `limit`). For scrolling lists use `useInfiniteBookings`.
 */
export function useBookings(
  businessId: string,
  query: BookingListQuery = {},
  options?: QueryOptions<Page<Booking>>,
) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).bookings.list(query),
    queryFn: () => bookingsApi.list(businessId, query),
    enabled: enabledWhen(!!businessId, options),
  });
}

/** Cursor-paginated bookings. `data` is every loaded booking; `fetchNextPage()` while `hasNextPage`. */
export function useInfiniteBookings(
  businessId: string,
  query: Omit<BookingListQuery, "cursor"> = {},
  options?: InfiniteQueryOptions<Booking>,
) {
  return useInfiniteQuery({
    ...options,
    ...cursorPaging,
    queryKey: qk.business(businessId).bookings.infinite(query),
    queryFn: ({ pageParam }) => bookingsApi.list(businessId, { ...query, cursor: pageParam }),
    select: loadedItems,
    enabled: enabledWhen(!!businessId, options),
  });
}

/**
 * Loads the first page of `useInfiniteBookings(businessId, query)` ahead of time (the calendar's next day or week),
 * unless it is cached and fresh. A failure is left for the query itself to show when it is used.
 */
export function prefetchInfiniteBookings(
  queryClient: QueryClient,
  businessId: string,
  query: Omit<BookingListQuery, "cursor">,
) {
  return queryClient
    .infiniteQuery({
      ...cursorPaging,
      queryKey: qk.business(businessId).bookings.infinite(query),
      queryFn: ({ pageParam }) => bookingsApi.list(businessId, { ...query, cursor: pageParam }),
    })
    .then(noop, noop);
}

export function useBooking(businessId: string, bookingId: string, options?: QueryOptions<BookingDetail>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).bookings.detail(bookingId),
    queryFn: () => bookingsApi.get(businessId, bookingId),
    enabled: enabledWhen(!!businessId && !!bookingId, options),
  });
}

/**
 * Cache effects of any booking write: merge the returned `Booking` into a
 * cached detail (instant UI), then refresh lists, the detail (payments/history),
 * slots, overview, reports, customers (booking counts) and deals (redemption counts).
 * Only the detail's refetch is awaited (the mutation stays pending until the drawer shows payments and history as
 * they are now); the rest refresh in the background, so a busy calendar or list doesn't hold the button's spinner.
 */
function afterBookingChange(qc: QueryClient, businessId: string, booking: Booking) {
  const b = qk.business(businessId);
  const detail = b.bookings.detail(booking.id);
  qc.setQueryData<BookingDetail>(detail, (old) => (old ? { ...old, ...booking } : old));
  const detailHash = hashKey(detail);
  void Promise.all([
    qc.invalidateQueries({
      queryKey: b.bookings.all(),
      predicate: (query) => query.queryHash !== detailHash,
    }),
    invalidateAll(qc, [
      b.availabilityAll(),
      b.overview(),
      b.reportsAll(),
      b.customers.all(),
      b.offers(),
      qk.public.all(),
    ]),
  ]);
  return qc.invalidateQueries({ queryKey: detail });
}

/**
 * Optimistic status flip for safe, reversible actions (approve, mark completed / no-show): the cached detail shows
 * the new status at once and is restored, then refetched, if the request fails. The caller's own `onMutate`/`onError` still run
 * (after the flip / after the rollback); the flip owns `onMutate`'s result.
 */
function withOptimisticStatus<TData, TVariables>(
  businessId: string,
  target: (variables: TVariables) => { id: string; status: BookingStatus },
  options?: MutationOptions<TData, TVariables>,
): MutationOptions<TData, TVariables> {
  const detailKey = (variables: TVariables) => qk.business(businessId).bookings.detail(target(variables).id);
  return {
    ...options,
    onMutate: async (variables, context) => {
      const key = detailKey(variables);
      await context.client.cancelQueries({ queryKey: key });
      const previous = context.client.getQueryData<BookingDetail>(key);
      const { status } = target(variables);
      context.client.setQueryData<BookingDetail>(key, (old) => (old ? { ...old, status } : old));
      await options?.onMutate?.(variables, context);
      return previous;
    },
    onError: (error, variables, previous, context) => {
      if (previous) context.client.setQueryData(detailKey(variables), previous);
      // A refusal usually means the booking changed meanwhile (a request the customer cancelled): show it as it is
      // now rather than the snapshot, which would keep offering the same action.
      void context.client.invalidateQueries({ queryKey: qk.business(businessId).bookings.all() });
      return options?.onError?.(error, variables, previous, context);
    },
  };
}

/**
 * When the time was taken meanwhile (`SLOT_UNAVAILABLE`), refetch the business's free times so the taken one stops
 * being offered; then the caller's own `onError`.
 */
function refreshSlotsWhenTaken<TData, TVariables>(
  businessId: string,
  options?: MutationOptions<TData, TVariables>,
): MutationOptions<TData, TVariables> {
  return {
    ...options,
    onError: (error, variables, result, context) => {
      if (error.code === "SLOT_UNAVAILABLE") {
        void context.client.invalidateQueries({ queryKey: qk.business(businessId).availabilityAll() });
      }
      return options?.onError?.(error, variables, result, context);
    },
  };
}

export type CreateStaffBookingVariables = {
  input: CreateStaffBooking;
  /** Optional; create once per submit intent with `newIdempotencyKey()` to make retries safe. */
  idempotencyKey?: string;
};

/** Resolves to the booking plus `checkoutUrl` (set when it is held for online payment). */
export function useCreateBooking(
  businessId: string,
  options?: MutationOptions<CreatedBooking, CreateStaffBookingVariables>,
) {
  return useApiMutation(
    ({ input, idempotencyKey }: CreateStaffBookingVariables) =>
      bookingsApi.create(businessId, input, idempotencyKey),
    (qc, booking) => afterBookingChange(qc, businessId, booking),
    refreshSlotsWhenTaken(businessId, options),
  );
}

export type UpdateBookingVariables = { id: string; input: UpdateBookingInput };

export function useUpdateBooking(
  businessId: string,
  options?: MutationOptions<Booking, UpdateBookingVariables>,
) {
  return useApiMutation(
    ({ id, input }: UpdateBookingVariables) => bookingsApi.update(businessId, id, input),
    (qc, booking) => afterBookingChange(qc, businessId, booking),
    options,
  );
}

export type CancelBookingVariables = { id: string; input: CancelStaffBookingInput };

export function useCancelBooking(
  businessId: string,
  options?: MutationOptions<Booking, CancelBookingVariables>,
) {
  return useApiMutation(
    ({ id, input }: CancelBookingVariables) => bookingsApi.cancel(businessId, id, input),
    (qc, booking) => afterBookingChange(qc, businessId, booking),
    options,
  );
}

export type RescheduleBookingVariables = { id: string; input: RescheduleStaffBookingInput };

export function useRescheduleBooking(
  businessId: string,
  options?: MutationOptions<Booking, RescheduleBookingVariables>,
) {
  return useApiMutation(
    ({ id, input }: RescheduleBookingVariables) => bookingsApi.reschedule(businessId, id, input),
    (qc, booking) => afterBookingChange(qc, businessId, booking),
    refreshSlotsWhenTaken(businessId, options),
  );
}

/** Variables: the booking id. The cached detail shows "confirmed" at once (rolled back on error). */
export function useApproveBooking(businessId: string, options?: MutationOptions<Booking, string>) {
  return useApiMutation(
    (id: string) => bookingsApi.approve(businessId, id),
    (qc, booking) => afterBookingChange(qc, businessId, booking),
    withOptimisticStatus(businessId, (id: string) => ({ id, status: "confirmed" }), options),
  );
}

export type DeclineBookingVariables = { id: string } & DeclineBookingInput;

/** Variables: `{ id, reason? }`. The reason is quoted in the email to the customer. */
export function useDeclineBooking(
  businessId: string,
  options?: MutationOptions<Booking, DeclineBookingVariables>,
) {
  return useApiMutation(
    ({ id, reason }: DeclineBookingVariables) =>
      bookingsApi.decline(businessId, id, { reason: reason?.trim() || null }),
    (qc, booking) => afterBookingChange(qc, businessId, booking),
    options,
  );
}

/** Variables: the booking id. Emails the held booking's payment link to the customer again. */
export function useSendPaymentLink(businessId: string, options?: MutationOptions<PaymentLinkSent, string>) {
  return useApiMutation(
    (id: string) => bookingsApi.sendPaymentLink(businessId, id),
    (qc, _sent, id) => invalidateAll(qc, [qk.business(businessId).bookings.detail(id)]),
    options,
  );
}

/** Variables: the booking id. Records that what was due at the venue was paid in person. */
export function useMarkPaidInPerson(businessId: string, options?: MutationOptions<Booking, string>) {
  return useApiMutation(
    (id: string) => bookingsApi.markPaidInPerson(businessId, id),
    (qc, booking) => afterBookingChange(qc, businessId, booking),
    options,
  );
}

export type SetBookingStatusVariables = { id: string; status: TerminalBookingStatus };

/** Mark a booking `completed` or `no_show`. The cached detail shows the new status at once (rolled back on error). */
export function useSetBookingStatus(
  businessId: string,
  options?: MutationOptions<Booking, SetBookingStatusVariables>,
) {
  return useApiMutation(
    ({ id, status }: SetBookingStatusVariables) => bookingsApi.setStatus(businessId, id, status),
    (qc, booking) => afterBookingChange(qc, businessId, booking),
    withOptimisticStatus(businessId, (v: SetBookingStatusVariables) => v, options),
  );
}

/**
 * Staff availability (includes private services by default). Disabled until `serviceId`, `from`, `to` are set.
 * Pass `excludeBookingId` when rescheduling so the booking's own time doesn't count as busy.
 */
export function useStaffAvailability(
  businessId: string,
  query: StaffAvailabilityQuery,
  options?: QueryOptions<Availability>,
) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).availability(query),
    queryFn: () => bookingsApi.availability(businessId, query),
    enabled: enabledWhen(!!businessId && !!query.serviceId && !!query.from && !!query.to, options),
  });
}
