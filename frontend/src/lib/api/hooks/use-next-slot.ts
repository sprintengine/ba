"use client";

import { useQuery, type QueryKey } from "@tanstack/react-query";
import type { ApiError } from "../client";
import { meApi } from "../me";
import { publicApi } from "../public";
import { qk } from "../query-keys";
import type { Availability, AvailabilityQuery, CustomerAvailabilityRange, DateRange, Slot } from "../types";

/** The earliest free time after `after`, for businesses that offer their next available time only. */
export type NextSlot = {
  /** The time to offer; null while searching or when there is none. */
  slot: Slot | null;
  /**
   * The earliest a closed day opens (a release schedule, §21) among the days searched: more times then, even when
   * there is nothing to offer now. Null when none of them is waiting to open at a set time.
   */
  opensAt: string | null;
  /** Searching for the first time. */
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: ApiError | null;
  /** Every window up to the last bookable date was searched and none has a free time. */
  none: boolean;
  refetch: () => void;
};

type WindowFetcher = (range: CustomerAvailabilityRange) => Promise<Availability>;

/**
 * The first slot starting after `after` in [windows], asked window by window (≤31 days each) until one has a time,
 * and the earliest opening of a closed day seen on the way.
 */
async function searchWindows(windows: DateRange[], after: string | null, fetchWindow: WindowFetcher) {
  let opensAt: string | null = null;
  for (const w of windows) {
    const availability = await fetchWindow({ ...w, after });
    for (const d of availability.days) {
      if (d.opensAt && (!opensAt || Date.parse(d.opensAt) < Date.parse(opensAt))) opensAt = d.opensAt;
    }
    const slot = availability.days.flatMap((d) => d.slots)[0];
    if (slot) return { slot, opensAt };
  }
  return { slot: null, opensAt };
}

function useNextSlot(
  key: QueryKey,
  windows: DateRange[],
  after: string | null,
  fetchWindow: WindowFetcher,
  enabled: boolean,
): NextSlot {
  const q = useQuery({
    queryKey: key,
    queryFn: () => searchWindows(windows, after, fetchWindow),
    enabled: enabled && windows.length > 0,
    staleTime: 30_000,
  });
  return {
    slot: q.data?.slot ?? null,
    opensAt: q.data?.opensAt ?? null,
    isPending: q.isPending && q.fetchStatus !== "idle",
    isFetching: q.isFetching,
    isError: q.isError,
    error: (q.error ?? null) as ApiError | null,
    none: q.data?.slot === null || (enabled && windows.length === 0),
    refetch: () => void q.refetch(),
  };
}

/** The search's whole span and starting point, so the cache key changes with any of them. */
function span(windows: DateRange[], after: string | null): CustomerAvailabilityRange {
  return { from: windows[0]?.from ?? "", to: windows.at(-1)?.to ?? "", after };
}

/** The next free time for a new public booking of `query`'s selection. */
export function usePublicNextSlot(
  slug: string,
  query: Omit<AvailabilityQuery, "from" | "to">,
  windows: DateRange[],
  after: string | null,
  enabled = true,
) {
  return useNextSlot(
    qk.public.nextSlot(slug, { ...query, ...span(windows, after) }),
    windows,
    after,
    (range) => publicApi.availability(slug, { ...query, ...range }),
    enabled && !!slug && !!query.serviceId,
  );
}

/** The next free time to move a managed booking to. */
export function useManagedNextSlot(
  token: string,
  windows: DateRange[],
  after: string | null,
  enabled = true,
) {
  return useNextSlot(
    qk.public.manageNextSlot(token, span(windows, after)),
    windows,
    after,
    (range) => publicApi.manageAvailability(token, range),
    enabled && !!token,
  );
}

/** The next free time to move one of the signed-in user's bookings to. */
export function useMyBookingNextSlot(
  bookingId: string,
  windows: DateRange[],
  after: string | null,
  enabled = true,
) {
  return useNextSlot(
    qk.myBookingNextSlot(bookingId, span(windows, after)),
    windows,
    after,
    (range) => meApi.bookingAvailability(bookingId, range),
    enabled && !!bookingId,
  );
}
