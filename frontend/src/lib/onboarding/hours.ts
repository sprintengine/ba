/**
 * Weekly opening hours of a setup resource: display helpers and the pure edits behind the hours editor. A day's
 * windows are addressed by their index in display order (`windowsForDay`).
 */
import type { DayOfWeek } from "@/lib/api/types";
import { minutesToTime, timeToMinutes } from "@/lib/format/datetime";
import type { SetupWeeklyHours } from "./types";

export const WEEKDAYS: readonly DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];
/** Monday to Friday: the days "copy to weekdays" fills. */
const WORKING_DAYS: readonly DayOfWeek[] = [1, 2, 3, 4, 5];

export const DAY_SHORT: Record<DayOfWeek, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};
export const DAY_LONG: Record<DayOfWeek, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/** The window a newly opened day gets when the resource has no hours to copy. */
const DEFAULT_WINDOW = { startTime: "09:00", endTime: "17:00" };
/** An added window starts an hour after the day's last one, lasts three hours, and must start by 22:30. */
const ADDED_WINDOW_GAP = 60;
const ADDED_WINDOW_LENGTH = 180;
const LATEST_ADDED_START = 22 * 60 + 30;
const LATEST_ADDED_END = 23 * 60 + 30;

export function isWeekday(day: number): day is DayOfWeek {
  return Number.isInteger(day) && day >= 1 && day <= 7;
}

export function sortHours(hours: SetupWeeklyHours[]): SetupWeeklyHours[] {
  return [...hours].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

/** Windows for one weekday, in display order (index = the `windowIndex` used by actions). */
export function windowsForDay(hours: SetupWeeklyHours[], day: number): SetupWeeklyHours[] {
  return sortHours(hours).filter((h) => h.dayOfWeek === day);
}

/** "Mon–Sat 08:00–18:00 · Sun 10:00–16:00" (days with identical windows are grouped). */
export function summarizeHours(hours: SetupWeeklyHours[]): string {
  if (hours.length === 0) return "No opening hours";
  const signature = (day: number) =>
    windowsForDay(hours, day)
      .map((h) => `${h.startTime}–${h.endTime}`)
      .join(", ");
  const parts: string[] = [];
  let day = 1;
  while (day <= 7) {
    const s = signature(day);
    let end = day;
    while (end < 7 && s && signature(end + 1) === s) end++;
    if (s) parts.push(`${dayRangeLabel(day, end)} ${s}`);
    day = end + 1;
  }
  return parts.join(" · ");
}

/** "Mon", "Mon, Tue" or "Mon–Fri". */
function dayRangeLabel(from: number, to: number): string {
  const first = isWeekday(from) ? DAY_SHORT[from] : "";
  const last = isWeekday(to) ? DAY_SHORT[to] : "";
  if (to === from) return first;
  return to === from + 1 ? `${first}, ${last}` : `${first}–${last}`;
}

/** Replace (or, when [fn] returns null, remove) the [windowIndex]-th window of [day] in display order. */
export function mapDayWindow(
  hours: SetupWeeklyHours[],
  day: number,
  windowIndex: number,
  fn: (h: SetupWeeklyHours) => SetupWeeklyHours | null,
): SetupWeeklyHours[] {
  const target = windowsForDay(hours, day)[windowIndex];
  if (!target) return hours;
  return hours.flatMap((h) => (h === target ? (fn(h) ?? []) : [h]));
}

/** The most common window, so opening Saturday matches the rest of the week. */
export function defaultWindowFor(hours: SetupWeeklyHours[]): { startTime: string; endTime: string } {
  const counts = new Map<string, { startTime: string; endTime: string; count: number }>();
  for (const { startTime, endTime } of hours) {
    const key = `${startTime}-${endTime}`;
    const seen = counts.get(key);
    counts.set(key, { startTime, endTime, count: (seen?.count ?? 0) + 1 });
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return best ? { startTime: best.startTime, endTime: best.endTime } : DEFAULT_WINDOW;
}

/** Opens [day] with the most common window (keeping its windows if already open) or closes it. */
export function setDayOpen(hours: SetupWeeklyHours[], day: number, open: boolean): SetupWeeklyHours[] {
  const rest = hours.filter((h) => h.dayOfWeek !== day);
  if (!open) return rest;
  if (hours.some((h) => h.dayOfWeek === day)) return hours;
  return [...rest, { dayOfWeek: day, ...defaultWindowFor(hours), audienceGroupKeys: [] }];
}

/** Adds a window an hour after [day]'s last one (09:00–12:00 on an empty day); no-op when it would start too late. */
export function addWindow(hours: SetupWeeklyHours[], day: number): SetupWeeklyHours[] {
  const windows = windowsForDay(hours, day);
  const lastEnd = windows.length
    ? Math.max(...windows.map((h) => timeToMinutes(h.endTime)))
    : timeToMinutes(DEFAULT_WINDOW.startTime) - ADDED_WINDOW_GAP;
  const start = lastEnd + ADDED_WINDOW_GAP;
  if (start > LATEST_ADDED_START) return hours;
  return [
    ...hours,
    {
      dayOfWeek: day,
      startTime: minutesToTime(start),
      endTime: minutesToTime(Math.min(start + ADDED_WINDOW_LENGTH, LATEST_ADDED_END)),
      audienceGroupKeys: [],
    },
  ];
}

/** Gives every other working day (Monday to Friday) [fromDay]'s windows. */
export function copyDayToWeekdays(hours: SetupWeeklyHours[], fromDay: number): SetupWeeklyHours[] {
  const source = windowsForDay(hours, fromDay);
  const targets: number[] = WORKING_DAYS.filter((d) => d !== fromDay);
  return [
    ...hours.filter((h) => !targets.includes(h.dayOfWeek)),
    ...targets.flatMap((d) => source.map((h) => ({ ...copyWindow(h), dayOfWeek: d }))),
  ];
}

/** A copy that shares no arrays with [h]. */
export function copyWindow(h: SetupWeeklyHours): SetupWeeklyHours {
  return { ...h, audienceGroupKeys: [...h.audienceGroupKeys] };
}
