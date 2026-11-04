/**
 * When a release schedule opens each day (§21): the same rules as the backend's `ReleaseCalendar`, for the editor's
 * live preview. Pure; dates are `YYYY-MM-DD` in the business timezone.
 */
import type { ReleaseScheduleInput } from "@/lib/api/types";
import {
  addDaysToPlainDate,
  isoWeekday,
  startOfIsoWeek,
  zonedToIso,
  type PlainDate,
} from "@/lib/format/datetime";

export type ReleaseTiming = Pick<
  ReleaseScheduleInput,
  "cadence" | "time" | "daysBefore" | "weekdaysOnly" | "weekday" | "weeksAhead"
>;

/** The local date on which `date` is released. */
export function releaseDate(t: ReleaseTiming, date: PlainDate): PlainDate {
  if (t.cadence === "daily") {
    const day = addDaysToPlainDate(date, -(t.daysBefore ?? 0));
    if (!t.weekdaysOnly) return day;
    const weekday = isoWeekday(day);
    return weekday === 6 ? addDaysToPlainDate(day, -1) : weekday === 7 ? addDaysToPlainDate(day, -2) : day;
  }
  return addDaysToPlainDate(startOfIsoWeek(date), -7 * (t.weeksAhead ?? 1) + (t.weekday ?? 1) - 1);
}

/** When the schedule opens `date`: an ISO instant with the zone's offset. */
export function scheduledAt(t: ReleaseTiming, date: PlainDate, timeZone: string): string {
  return zonedToIso(releaseDate(t, date), t.time, timeZone);
}

/** The dates opened at the same moment as `date` (its week, or a Friday's weekend), in order. */
export function sameRelease(t: ReleaseTiming, date: PlainDate): PlainDate[] {
  const release = releaseDate(t, date);
  return Array.from({ length: 13 }, (_, i) => addDaysToPlainDate(date, i - 6)).filter(
    (d) => releaseDate(t, d) === release,
  );
}

export type PreviewDay = { date: PlainDate; opensAt: string; open: boolean };

/** The next `count` days from `today` and when each opens under `t`, as the editor previews a schedule. */
export function previewDays(
  t: ReleaseTiming,
  today: PlainDate,
  count: number,
  timeZone: string,
  now: Date,
): PreviewDay[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDaysToPlainDate(today, i);
    const opensAt = scheduledAt(t, date, timeZone);
    return { date, opensAt, open: Date.parse(opensAt) <= now.getTime() };
  });
}
