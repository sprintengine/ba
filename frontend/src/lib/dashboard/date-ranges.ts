/**
 * Date-range presets for dashboard filters (the bookings list and reports), relative to `today` in the business
 * timezone. Ranges are inclusive plain dates; an absent bound is open-ended.
 */
import { addDaysToPlainDate, type PlainDate } from "@/lib/format/datetime";

export type DateRange = { from?: PlainDate; to?: PlainDate };
export type ClosedDateRange = { from: PlainDate; to: PlainDate };
/** A custom range picked by the user; either bound may still be unset. */
export type CustomRange = { from?: PlainDate | null; to?: PlainDate | null };

/** The last `days` days, ending today. */
const lastDays = (today: PlainDate, days: number): ClosedDateRange => ({
  from: addDaysToPlainDate(today, -(days - 1)),
  to: today,
});
const monthStartOf = (date: PlainDate): PlainDate => `${date.slice(0, 7)}-01`;

export type BookingRange = "upcoming" | "today" | "next7" | "past30" | "all" | "custom";

export const BOOKING_RANGE_LABEL: Record<BookingRange, string> = {
  upcoming: "Upcoming",
  today: "Today",
  next7: "Next 7 days",
  past30: "Past 30 days",
  all: "All time",
  custom: "Custom range",
};

export const BOOKING_RANGES = Object.keys(BOOKING_RANGE_LABEL) as BookingRange[];

/** A `?range=` value for the bookings list; anything unknown is "upcoming". */
export function parseBookingRange(value: string | null): BookingRange {
  return BOOKING_RANGES.find((r) => r === value) ?? "upcoming";
}

/** The bookings list's query bounds for a range; "custom" leaves unset bounds open. */
export function bookingRangeDates(
  range: BookingRange,
  today: PlainDate,
  custom: CustomRange = {},
): DateRange {
  switch (range) {
    case "upcoming":
      return { from: today };
    case "today":
      return { from: today, to: today };
    case "next7":
      return { from: today, to: addDaysToPlainDate(today, 6) };
    case "past30":
      return { from: addDaysToPlainDate(today, -30), to: addDaysToPlainDate(today, -1) };
    case "all":
      return {};
    case "custom":
      return { from: custom.from ?? undefined, to: custom.to ?? undefined };
  }
}

export type ReportRange = "7d" | "30d" | "90d" | "month" | "lastMonth" | "year" | "custom";

export const REPORT_RANGE_LABEL: Record<ReportRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  month: "This month",
  lastMonth: "Last month",
  year: "This year",
  custom: "Custom",
};

export const REPORT_RANGES = Object.keys(REPORT_RANGE_LABEL) as ReportRange[];

/** A `?range=` value for reports; anything unknown is "30d". */
export function parseReportRange(value: string | null): ReportRange {
  return REPORT_RANGES.find((r) => r === value) ?? "30d";
}

/** The closed range a report covers; an unset custom bound falls back to the last 30 days. */
export function reportRangeDates(
  preset: ReportRange,
  today: PlainDate,
  custom: CustomRange = {},
): ClosedDateRange {
  switch (preset) {
    case "7d":
      return lastDays(today, 7);
    case "30d":
      return lastDays(today, 30);
    case "90d":
      return lastDays(today, 90);
    case "month":
      return { from: monthStartOf(today), to: today };
    case "lastMonth": {
      const end = addDaysToPlainDate(monthStartOf(today), -1);
      return { from: monthStartOf(end), to: end };
    }
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom": {
      const fallback = lastDays(today, 30);
      return { from: custom.from ?? fallback.from, to: custom.to ?? fallback.to };
    }
  }
}
