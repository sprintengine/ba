/** "Next available time only" businesses: where to look for the next time, and finding a chosen one again. Pure. */
import { toPlainDate, zonedToIso, type PlainDate, type TimeOfDay } from "@/lib/format/datetime";
import { monthWindows, type DateWindow } from "./windows";

/** Slots start at least 5 minutes apart, so a minute before a time finds that time and nothing earlier. */
const REFIND_LEAD_MS = 60_000;

/**
 * The windows to search for the next free time after `after`: from today (or the day of `after`, when later) to
 * `max`, a calendar month at a time (the API takes ≤31 days), searched in order until one has a time.
 */
export function nextSlotWindows(
  today: PlainDate,
  max: PlainDate,
  after: string | null,
  timeZone: string,
): DateWindow[] {
  const afterDay = after ? toPlainDate(after, timeZone) : today;
  const start = afterDay > today ? afterDay : today;
  return monthWindows(start, max, start, max);
}

/** The `after` whose next free time is the chosen `date` and `time` (while it is still free). */
export function afterToRefind(date: PlainDate, time: TimeOfDay, timeZone: string): string {
  return new Date(new Date(zonedToIso(date, time, timeZone)).getTime() - REFIND_LEAD_MS).toISOString();
}
