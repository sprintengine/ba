/**
 * Opening windows, shared by the calendar (business-hours shading) and the weekly-hours editor. Mirrors the
 * backend's window maths (SlotEngine `localWindows`): weekly rules valid on the date − unavailable overrides
 * + available overrides − whole-business closures, merged into disjoint intervals of wall-clock minutes.
 */
import type { AvailabilityOverride, AvailabilityRule } from "@/lib/api/types";
import { isoWeekday, timeToMinutes, type PlainDate } from "@/lib/format/datetime";

/** Wall-clock minutes since midnight, `start` inclusive, `end` exclusive. */
export type MinuteInterval = { start: number; end: number };

/** "24:00" is read as the end of the day (the API never sends it; see `rangeError`). */
export function endMinutes(time: string): number {
  return time === "24:00" ? 1440 : timeToMinutes(time);
}

/**
 * The latest time a range can end. The backend keeps a range within one day (times are 00:00–23:59 and the end
 * must be after the start), so a range can't end at midnight.
 */
export const LATEST_END = "23:59";

/** Why a start–end time range can't be saved, or null when it can. */
export function rangeError(startTime: string, endTime: string): string | null {
  if (endTime === "00:00" || endTime === "24:00") return `Ends at midnight: use ${LATEST_END}`;
  return timeToMinutes(endTime) <= timeToMinutes(startTime) ? "Ends before it starts" : null;
}

export function mergeIntervals(intervals: readonly MinuteInterval[]): MinuteInterval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: MinuteInterval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export function subtractInterval(
  intervals: readonly MinuteInterval[],
  cut: MinuteInterval,
): MinuteInterval[] {
  const out: MinuteInterval[] = [];
  for (const i of intervals) {
    if (cut.end <= i.start || cut.start >= i.end) {
      out.push(i);
      continue;
    }
    if (cut.start > i.start) out.push({ start: i.start, end: cut.start });
    if (cut.end < i.end) out.push({ start: cut.end, end: i.end });
  }
  return out;
}

function ruleAppliesOn(
  rule: Pick<AvailabilityRule, "dayOfWeek" | "validFrom" | "validUntil">,
  date: PlainDate,
) {
  return (
    rule.dayOfWeek === isoWeekday(date) &&
    (!rule.validFrom || rule.validFrom <= date) &&
    (!rule.validUntil || date <= rule.validUntil)
  );
}

/**
 * Opening windows for one resource on one date (all audiences — the calendar
 * shows when the resource works, regardless of who may book those hours).
 */
export function openIntervalsForDate(
  rules: readonly AvailabilityRule[],
  overrides: readonly AvailabilityOverride[],
  closures: readonly AvailabilityOverride[],
  date: PlainDate,
): MinuteInterval[] {
  let windows = mergeIntervals(
    rules
      .filter((r) => ruleAppliesOn(r, date))
      .map((r) => ({ start: timeToMinutes(r.startTime), end: endMinutes(r.endTime) })),
  );
  const own = overrides.filter((o) => o.date === date);
  for (const o of own.filter((o) => !o.isAvailable)) {
    windows =
      o.startTime && o.endTime
        ? subtractInterval(windows, { start: timeToMinutes(o.startTime), end: endMinutes(o.endTime) })
        : [];
  }
  const extra = own
    .filter((o) => o.isAvailable && o.startTime && o.endTime)
    .map((o) => ({ start: timeToMinutes(o.startTime!), end: endMinutes(o.endTime!) }));
  windows = mergeIntervals([...windows, ...extra]);
  for (const c of closures.filter((c) => c.date === date && !c.isAvailable)) {
    windows =
      c.startTime && c.endTime
        ? subtractInterval(windows, { start: timeToMinutes(c.startTime), end: endMinutes(c.endTime) })
        : [];
  }
  return windows;
}
