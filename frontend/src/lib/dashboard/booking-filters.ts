/**
 * The bookings list's filters, as they live in the URL (`?range=&from=&to=&status=&resource=&service=&q=`), and the
 * list query they produce.
 */
import type { BookingListQuery, BookingStatus } from "@/lib/api/types";
import { isPlainDate, type PlainDate } from "@/lib/format/datetime";
import { BOOKING_STATUS } from "@/lib/status";
import { bookingRangeDates, parseBookingRange, type BookingRange } from "./date-ranges";

export type BookingFilters = {
  range: BookingRange;
  /** Only used when `range` is "custom". */
  customFrom: PlainDate | null;
  customTo: PlainDate | null;
  statuses: BookingStatus[];
  /** A resource id, or "all". */
  resourceId: string;
  /** A service id, or "all". */
  serviceId: string;
};

type ParamsReader = Pick<URLSearchParams, "get">;

const plainDateParam = (params: ParamsReader, key: string): PlainDate | null => {
  const value = params.get(key);
  return value !== null && isPlainDate(value) ? value : null;
};

const isBookingStatus = (value: string): value is BookingStatus => Object.hasOwn(BOOKING_STATUS, value);

/** Read the filters from search params; unknown or malformed values fall back to the defaults. */
export function parseBookingFilters(params: ParamsReader): BookingFilters {
  return {
    range: parseBookingRange(params.get("range")),
    customFrom: plainDateParam(params, "from"),
    customTo: plainDateParam(params, "to"),
    statuses: (params.get("status") ?? "").split(",").filter(isBookingStatus),
    resourceId: params.get("resource") ?? "all",
    serviceId: params.get("service") ?? "all",
  };
}

/** True when anything narrows the default view (upcoming, every status, resource and service, no search). */
export function isFilteredView(filters: BookingFilters, q: string): boolean {
  return (
    filters.statuses.length > 0 ||
    filters.resourceId !== "all" ||
    filters.serviceId !== "all" ||
    q !== "" ||
    filters.range !== "upcoming"
  );
}

/** The `useInfiniteBookings` query for the filters and the (debounced, trimmed) search. */
export function bookingListQuery(
  filters: BookingFilters,
  q: string,
  today: PlainDate,
): Omit<BookingListQuery, "cursor"> {
  return {
    ...bookingRangeDates(filters.range, today, { from: filters.customFrom, to: filters.customTo }),
    status: filters.statuses.length ? filters.statuses : undefined,
    resourceId: filters.resourceId !== "all" ? filters.resourceId : undefined,
    serviceId: filters.serviceId !== "all" ? filters.serviceId : undefined,
    q: q || undefined,
    limit: 50,
  };
}
