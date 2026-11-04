/** Bookable dates and the availability windows to load for them. Pure; plain dates only. */
import type { Policies, PublicService } from "@/lib/api/types";
import {
  addDaysToPlainDate,
  addMonths,
  monthEnd,
  monthStart,
  startOfIsoWeek,
  type PlainDate,
  type PlainMonth,
} from "@/lib/format/datetime";

export type DateWindow = { from: PlainDate; to: PlainDate };

/**
 * Split [from, to] into calendar-month windows clamped to [min, max]. Each is
 * ≤31 days (the API maximum) and month-aligned so caches are shared between
 * month and week views.
 */
export function monthWindows(from: PlainDate, to: PlainDate, min: PlainDate, max: PlainDate): DateWindow[] {
  const start = from < min ? min : from;
  const end = to > max ? max : to;
  if (start > end) return [];
  const windows: DateWindow[] = [];
  let cursor = monthStart(start);
  while (cursor <= end) {
    const mEnd = monthEnd(cursor);
    const wFrom = cursor < start ? start : cursor;
    const wTo = mEnd > end ? end : mEnd;
    if (wFrom <= wTo) windows.push({ from: wFrom, to: wTo });
    cursor = addDaysToPlainDate(mEnd, 1);
  }
  return windows;
}

/**
 * The windows a date picker needs loaded: the shown month, plus the month(s) of the focused date's week (and of
 * the week the phone's week strip shows, `shownWeek`) when the week reaches outside it (a date picked in another
 * month, a week running into the next month). Whole months only, so a week never costs a request of its own and
 * its data is shared with the month view.
 */
export function pickerWindows(
  month: PlainMonth,
  focusDate: PlainDate | null,
  min: PlainDate,
  max: PlainDate,
  shownWeek: PlainDate | null = null,
): DateWindow[] {
  const monthFirst = `${month}-01`;
  const monthLast = addDaysToPlainDate(`${addMonths(month, 1)}-01`, -1);
  const windows = monthWindows(monthFirst, monthLast, min, max);
  for (const day of [focusDate, shownWeek]) {
    if (!day) continue;
    const ws = startOfIsoWeek(day);
    const weekMonths = monthWindows(monthStart(ws), monthEnd(addDaysToPlainDate(ws, 6)), min, max);
    for (const w of weekMonths) {
      if (!windows.some((x) => x.from === w.from && x.to === w.to)) windows.push(w);
    }
  }
  return windows;
}

/** Last bookable date: today + max advance days (service overrides business). */
export function maxBookableDate(
  today: PlainDate,
  service: Pick<PublicService, "maxAdvanceDays"> | null,
  policies: Pick<Policies, "maxAdvanceDays">,
): PlainDate {
  return addDaysToPlainDate(today, service?.maxAdvanceDays ?? policies.maxAdvanceDays);
}

/**
 * The chosen date and time if they can still be booked: no date (nor time) when the date is before `today` or
 * after `max`, and no time when it is earlier today than `nowTime` (HH:mm), as from a link or a tab left open.
 */
export function withBookableTime<S extends { date: PlainDate | null; time: string | null }>(
  sel: S,
  { today, max, nowTime }: { today: PlainDate; max: PlainDate; nowTime: string },
): S {
  if (!sel.date) return sel;
  if (sel.date < today || sel.date > max) return { ...sel, date: null, time: null };
  if (sel.time && sel.date === today && sel.time < nowTime) return { ...sel, time: null };
  return sel;
}

/** First date ≥ `after` that has at least one slot, from loaded data. */
export function firstAvailableDate(days: Map<PlainDate, unknown[]>, after: PlainDate): PlainDate | null {
  const dates = [...days.keys()].filter((d) => d >= after && (days.get(d)?.length ?? 0) > 0).sort();
  return dates[0] ?? null;
}
