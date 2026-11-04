"use client";

import { useCallback, useEffect, useMemo } from "react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import type { Booking, Resource, ResourceAvailability } from "@/lib/api/types";
import {
  prefetchInfiniteBookings,
  useClosures,
  useInfiniteBookings,
  useResourceAvailabilities,
  useResources,
} from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import {
  calendarRange,
  calendarStatuses,
  calendarStep,
  type CalendarMode,
  type CalendarParams,
} from "@/lib/dashboard/calendar";
import { addDaysToPlainDate, todayInTz, type PlainDate } from "@/lib/format/datetime";
import { mergeIntervals, openIntervalsForDate } from "@/lib/availability/windows";
import {
  groupByDate,
  layoutDay,
  visibleHourRange,
  type MinuteInterval,
} from "@/lib/dashboard/calendar-layout";

/** Active and deactivated resources, each in display order (sort order, then name). */
function useSortedResources(businessId: string) {
  const query = useResources(businessId);
  const [resources, inactive] = useMemo(() => {
    const sorted = [...(query.data ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    return [sorted.filter((r) => r.isActive), sorted.filter((r) => !r.isActive)];
  }, [query.data]);
  return { query, resources, inactive };
}

const NO_BOOKINGS: Booking[] = [];

const bookingsQuery = (from: PlainDate, to: PlainDate, showCancelled: boolean) => ({
  from,
  to,
  status: calendarStatuses(showCancelled),
  limit: 200,
});

/**
 * Every booking in the range: the calendar needs the whole range, so keep pulling pages (200 at a time). While a new
 * range loads, the previous one's bookings stay as placeholder data (the grid dims rather than flashing skeletons),
 * and once it has loaded the ranges either side are fetched ahead, so stepping a day or week is usually instant.
 */
function useAllBookings(
  businessId: string,
  view: CalendarMode,
  date: PlainDate,
  { from, to }: { from: PlainDate; to: PlainDate },
  showCancelled: boolean,
) {
  const query = useInfiniteBookings(businessId, bookingsQuery(from, to, showCancelled), {
    placeholderData: keepPreviousData,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const queryClient = useQueryClient();
  const loaded = query.isSuccess && !query.isPlaceholderData;
  useEffect(() => {
    if (!loaded) return;
    for (const step of [-1, 1]) {
      const next = calendarRange(view, addDaysToPlainDate(date, step * calendarStep(view)));
      void prefetchInfiniteBookings(
        queryClient,
        businessId,
        bookingsQuery(next.from, next.to, showCancelled),
      );
    }
  }, [loaded, queryClient, businessId, view, date, showCancelled]);

  const bookings = query.data ?? NO_BOOKINGS;
  return { query, bookings };
}

/**
 * The date to list overrides and closures from for a range starting `rangeFrom`: the API lists them from 30 days
 * ago by default, so an older range asks from the start of its month (one more request per month stepped back, not
 * per day). `undefined` keeps the default, and the cache entries the settings pages share.
 */
export function overridesFrom(rangeFrom: PlainDate, today: PlainDate): PlainDate | undefined {
  return rangeFrom < addDaysToPlainDate(today, -29) ? `${rangeFrom.slice(0, 8)}01` : undefined;
}

/**
 * Open hours for a set of resources on a date (merged), from their weekly rules, overrides and closures, and whether
 * they're still loading (the grid's hour range comes from them).
 */
function useOpenHours(businessId: string, resources: Resource[], from: PlainDate | undefined) {
  const availQ = useResourceAvailabilities(
    businessId,
    resources.map((r) => r.id),
    from,
  );
  const closuresQ = useClosures(businessId, undefined, from);
  // useQueries returns a new array every render; key the memo on the data versions instead.
  const availVersion = availQ.map((q) => q.dataUpdatedAt).join(",");
  const availability = useMemo(() => {
    const map = new Map<string, ResourceAvailability>();
    resources.forEach((r, i) => {
      const data = availQ[i]?.data;
      if (data) map.set(r.id, data);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- availVersion tracks availQ's data
  }, [resources, availVersion]);

  const openFor = useCallback(
    (resourceIds: string[], d: PlainDate): MinuteInterval[] =>
      mergeIntervals(
        resourceIds.flatMap((id) => {
          const a = availability.get(id);
          return a ? openIntervalsForDate(a.rules, a.overrides, closuresQ.data ?? [], d) : [];
        }),
      ),
    [availability, closuresQ.data],
  );
  // isLoading, not isPending: a disabled query (no resources yet) is pending for ever.
  return { openFor, pending: closuresQ.isLoading || availQ.some((q) => q.isLoading) };
}

/** One grid column: a resource on the date (day view) or a day of the week (week view). */
export type CalendarColumn = {
  key: string;
  date: PlainDate;
  /** The column's resource in day view; `null` in week view. */
  resource: Resource | null;
  bookings: Booking[];
  open: MinuteInterval[];
};

/**
 * Everything the calendar grid shows for the URL state: the columns ((resource × date) in day view, (date) in week
 * view) with their bookings and open hours, and the hours to draw.
 */
export function useCalendarData({ date, view, resourceId, showCancelled }: CalendarParams) {
  const business = useCurrentBusiness();
  const range = useMemo(() => calendarRange(view, date), [view, date]);
  const { days, from, to } = range;
  const { query: resourcesQ, resources, inactive } = useSortedResources(business.id);
  const selected = resourceId !== "all" ? resources.find((r) => r.id === resourceId) : undefined;
  const { query: bookingsQ, bookings: loaded } = useAllBookings(
    business.id,
    view,
    date,
    range,
    showCancelled,
  );
  // Placeholder bookings are the previous range's: keep only those that fall on the days now shown (none after a
  // step; the uncancelled ones while cancelled bookings are being added).
  const placeholder = bookingsQ.isPlaceholderData;
  const bookings = useMemo(() => {
    if (!placeholder) return loaded;
    const byDate = groupByDate(loaded, business.timezone);
    return [...new Set(days.flatMap((d) => byDate.get(d) ?? []))];
  }, [placeholder, loaded, days, business.timezone]);
  // A deactivated resource keeps the bookings it already had: give it a column (after the active ones, marked
  // inactive) while it has any in the range, so they don't vanish from the day view.
  const columnsResources = useMemo(() => {
    if (selected) return [selected];
    const booked = new Set(bookings.flatMap((b) => b.resources.map((x) => x.id)));
    return [...resources, ...inactive.filter((r) => booked.has(r.id))];
  }, [selected, resources, inactive, bookings]);
  const { openFor, pending: hoursPending } = useOpenHours(
    business.id,
    resources,
    overridesFrom(from, todayInTz(business.timezone)),
  );

  const columns = useMemo((): CalendarColumn[] => {
    if (view === "day") {
      return columnsResources.map((r) => ({
        key: r.id,
        date,
        resource: r,
        bookings: bookings.filter((b) => b.resources.some((x) => x.id === r.id)),
        open: openFor([r.id], date),
      }));
    }
    const ids = selected ? [selected.id] : resources.map((r) => r.id);
    const scoped = selected
      ? bookings.filter((b) => b.resources.some((x) => x.id === selected.id))
      : bookings;
    const byDate = groupByDate(scoped, business.timezone);
    return days.map((d) => ({
      key: d,
      date: d,
      resource: null,
      bookings: byDate.get(d) ?? [],
      open: openFor(ids, d),
    }));
  }, [view, columnsResources, resources, date, bookings, openFor, selected, business.timezone, days]);

  const [startHour, endHour] = useMemo(() => {
    const open = columns.flatMap((c) => c.open);
    const events = columns.flatMap((c) => layoutDay(c.bookings, c.date, business.timezone));
    return visibleHourRange(open, events);
  }, [columns, business.timezone]);

  const count = new Set(
    columns.flatMap((c) => c.bookings.filter((b) => b.status !== "cancelled").map((b) => b.id)),
  ).size;

  return {
    days,
    from,
    to,
    resources,
    selected,
    columns,
    startHour,
    endHour,
    /** Earliest opening minute across the columns (24:00 when nothing is open). */
    firstOpen: Math.min(...columns.flatMap((c) => c.open.map((i) => i.start)), 24 * 60),
    /** Distinct bookings shown, not counting cancelled ones. */
    count,
    resourcesQ,
    bookingsQ,
    // Open hours too: they set the grid's hour range, which would otherwise re-scale the grid once they arrive.
    ready: !resourcesQ.isPending && !bookingsQ.isPending && !hoursPending && !placeholder,
    /** Bookings, resources or open hours still loading for the first time: the grid shows its skeleton. */
    loading: resourcesQ.isPending || bookingsQ.isPending || hoursPending,
    /** The range changed and its bookings are still loading; the previous range's stay visible meanwhile. */
    updating: placeholder,
    error: resourcesQ.error ?? bookingsQ.error,
    refetch: () => {
      void resourcesQ.refetch();
      void bookingsQ.refetch();
    },
  };
}
