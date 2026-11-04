/**
 * The dashboard calendar's pure parts: its URL state (`?date=&view=&resource=&cancelled=`), the days a view shows,
 * which statuses it loads and how an event looks for its status.
 */
import type { BookingStatus } from "@/lib/api/types";
import { addDaysToPlainDate, isPlainDate, startOfIsoWeek, type PlainDate } from "@/lib/format/datetime";
import { BOOKING_STATUS, isBlockingStatus, isReleasedStatus, type Tone } from "@/lib/status";

export type CalendarMode = "day" | "week";

export type CalendarParams = {
  date: PlainDate;
  view: CalendarMode;
  /** A resource id, or "all". */
  resourceId: string;
  showCancelled: boolean;
};

/** Read the calendar's URL state; a missing or malformed date is `today`. */
export function parseCalendarParams(params: Pick<URLSearchParams, "get">, today: PlainDate): CalendarParams {
  const date = params.get("date");
  return {
    date: date !== null && isPlainDate(date) ? date : today,
    view: params.get("view") === "week" ? "week" : "day",
    resourceId: params.get("resource") ?? "all",
    showCancelled: params.get("cancelled") === "1",
  };
}

/** The days a view shows (the date, or its Monday-to-Sunday week) and their first and last day. */
export function calendarRange(
  view: CalendarMode,
  date: PlainDate,
): { days: PlainDate[]; from: PlainDate; to: PlainDate } {
  if (view === "day") return { days: [date], from: date, to: date };
  const from = startOfIsoWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToPlainDate(from, i));
  return { days, from, to: addDaysToPlainDate(from, 6) };
}

/** How far ←/→ move: a day or a week. */
export const calendarStep = (view: CalendarMode): number => (view === "day" ? 1 : 7);

const SHOWN: BookingStatus[] = ["held", "pending_approval", "confirmed", "completed", "no_show"];

/** The statuses the calendar loads; cancelled bookings only when asked for. */
export function calendarStatuses(showCancelled: boolean): BookingStatus[] {
  return showCancelled ? [...SHOWN, "cancelled"] : SHOWN;
}

export type EventAppearance = {
  label: string;
  tone: Tone;
  /** Faded and struck through: cancelled, no-show, expired. */
  inactive: boolean;
  /** Dashed border in the status tone: not confirmed yet (held, pending approval). */
  tentative: boolean;
  /** The status dot in the corner; hidden for confirmed, the normal case. */
  showDot: boolean;
};

/** How a calendar event looks for its booking status. */
export function eventAppearance(status: BookingStatus): EventAppearance {
  const meta = BOOKING_STATUS[status];
  return {
    label: meta.label,
    tone: meta.tone,
    inactive: isReleasedStatus(status) || status === "no_show",
    tentative: isBlockingStatus(status) && status !== "confirmed",
    showDot: status !== "confirmed",
  };
}
