/**
 * Everything the calendar grid shows: the columns (a resource on the date in day view, a day of the week in week
 * view) with their bookings, open hours and time off, and the hours to draw. The website's `useCalendarData`
 * (components/dashboard/calendar), on the same shared hooks and pure layout rules (`@shared/dashboard/calendar*`).
 *
 * Staff only ever receive their own resources and bookings from the API, so their calendar is theirs alone.
 */
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { prefetchInfiniteBookings, useInfiniteBookings } from "@shared/api/hooks/use-bookings";
import { useClosures, useResourceAvailabilities, useResources } from "@shared/api/hooks/use-resources";
import type { AvailabilityOverride, Booking, Resource, ResourceAvailability } from "@shared/api/types";
import { mergeIntervals, openIntervalsForDate } from "@shared/availability/windows";
import { useCurrentBusiness } from "@shared/business/business-context";
import { calendarRange, calendarStatuses, calendarStep } from "@shared/dashboard/calendar";
import {
  groupByDate,
  layoutDay,
  visibleHourRange,
  type MinuteInterval,
} from "@shared/dashboard/calendar-layout";
import { addDaysToPlainDate, todayInTz, type PlainDate } from "@shared/format";

export type GridView = "day" | "week";

export type CalendarState = {
  date: PlainDate;
  view: GridView;
  /** Day view: the resource shown alone, or "all" for every resource side by side. */
  resourceId: string;
  showCancelled: boolean;
};

/** One grid column: a resource on the date (day view) or a day of the week (week view). */
export type CalendarColumn = {
  key: string;
  date: PlainDate;
  resource: Resource | null;
  bookings: Booking[];
  open: MinuteInterval[];
  /** Time off and closures on that date for the column (shown with their notes). */
  timeOff: AvailabilityOverride[];
};

const NO_BOOKINGS: Booking[] = [];

const bookingsQuery = (from: PlainDate, to: PlainDate, showCancelled: boolean) => ({
  from,
  to,
  status: calendarStatuses(showCancelled),
  limit: 200,
});

/** The date to list overrides from: the API's default is 30 days back, so older ranges ask from their month. */
export function overridesFrom(rangeFrom: PlainDate, today: PlainDate): PlainDate | undefined {
  return rangeFrom < addDaysToPlainDate(today, -29) ? `${rangeFrom.slice(0, 8)}01` : undefined;
}

/** Active resources in display order, and deactivated ones (shown only while they still have bookings). */
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

/**
 * Every booking in the range (pages of 200 pulled until done). The previous range stays as placeholder while the next
 * loads, and the ranges either side are prefetched once this one is in, so stepping a day or week is instant.
 */
function useAllBookings(businessId: string, state: CalendarState, from: PlainDate, to: PlainDate) {
  const query = useInfiniteBookings(businessId, bookingsQuery(from, to, state.showCancelled), {
    placeholderData: keepPreviousData,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const queryClient = useQueryClient();
  const loaded = query.isSuccess && !query.isPlaceholderData;
  const { view, date, showCancelled } = state;
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
  return query;
}

/** Open hours per resource and date (weekly rules, overrides, closures), and the time off itself. */
function useOpenHours(businessId: string, resources: Resource[], from: PlainDate | undefined) {
  const availQ = useResourceAvailabilities(
    businessId,
    resources.map((r) => r.id),
    from,
  );
  const closuresQ = useClosures(businessId, undefined, from);
  const version = availQ.map((q) => q.dataUpdatedAt).join(",");
  const availability = useMemo(() => {
    const map = new Map<string, ResourceAvailability>();
    resources.forEach((r, i) => {
      const data = availQ[i]?.data;
      if (data) map.set(r.id, data);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` tracks the queries' data
  }, [resources, version]);
  const closures = closuresQ.data;

  const openFor = useCallback(
    (ids: string[], d: PlainDate): MinuteInterval[] =>
      mergeIntervals(
        ids.flatMap((id) => {
          const a = availability.get(id);
          return a ? openIntervalsForDate(a.rules, a.overrides, closures ?? [], d) : [];
        }),
      ),
    [availability, closures],
  );
  const timeOffFor = useCallback(
    (ids: string[], d: PlainDate): AvailabilityOverride[] => [
      ...(closures ?? []).filter((c) => c.date === d && !c.isAvailable),
      ...ids.flatMap((id) =>
        (availability.get(id)?.overrides ?? []).filter((o) => o.date === d && !o.isAvailable),
      ),
    ],
    [availability, closures],
  );
  return { openFor, timeOffFor, pending: closuresQ.isLoading || availQ.some((q) => q.isLoading) };
}

export function useCalendarData(state: CalendarState) {
  const business = useCurrentBusiness();
  const { date, view, resourceId } = state;
  const range = useMemo(() => calendarRange(view, date), [view, date]);
  const { days, from, to } = range;
  const { query: resourcesQ, resources, inactive } = useSortedResources(business.id);
  const selected = resourceId !== "all" ? resources.find((r) => r.id === resourceId) : undefined;
  const bookingsQ = useAllBookings(business.id, state, from, to);
  const loaded = bookingsQ.data ?? NO_BOOKINGS;
  const placeholder = bookingsQ.isPlaceholderData;
  // Placeholder bookings are the previous range's: keep only those on the days now shown.
  const bookings = useMemo(() => {
    if (!placeholder) return loaded;
    const byDate = groupByDate(loaded, business.timezone);
    return [...new Set(days.flatMap((d) => byDate.get(d) ?? []))];
  }, [placeholder, loaded, days, business.timezone]);
  const columnResources = useMemo(() => {
    if (selected) return [selected];
    const booked = new Set(bookings.flatMap((b) => b.resources.map((x) => x.id)));
    return [...resources, ...inactive.filter((r) => booked.has(r.id))];
  }, [selected, resources, inactive, bookings]);
  const {
    openFor,
    timeOffFor,
    pending: hoursPending,
  } = useOpenHours(business.id, resources, overridesFrom(from, todayInTz(business.timezone)));

  const columns = useMemo((): CalendarColumn[] => {
    if (view === "day") {
      return columnResources.map((r) => ({
        key: r.id,
        date,
        resource: r,
        bookings: bookings.filter((b) => b.resources.some((x) => x.id === r.id)),
        open: openFor([r.id], date),
        timeOff: timeOffFor([r.id], date),
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
      bookings: byDate.get(d) ?? NO_BOOKINGS,
      open: openFor(ids, d),
      timeOff: selected ? timeOffFor(ids, d) : timeOffFor([], d),
    }));
  }, [
    view,
    columnResources,
    resources,
    date,
    bookings,
    openFor,
    timeOffFor,
    selected,
    business.timezone,
    days,
  ]);

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
    firstOpen: Math.min(...columns.flatMap((c) => c.open.map((i) => i.start)), 24 * 60),
    count,
    resourcesQ,
    bookingsQ,
    ready: !resourcesQ.isPending && !bookingsQ.isPending && !hoursPending && !placeholder,
    loading: resourcesQ.isPending || bookingsQ.isPending || hoursPending,
    updating: placeholder,
    error: resourcesQ.error ?? bookingsQ.error,
    refetch: async () => {
      await Promise.all([resourcesQ.refetch(), bookingsQ.refetch()]);
    },
  };
}
