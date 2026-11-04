/**
 * Pure layout maths for the resource calendar (day and week views).
 *
 * Everything is expressed in **wall-clock minutes of a plain date in the
 * business timezone** (0 = 00:00, 1440 = 24:00). Using wall-clock minutes
 * (rather than elapsed time since midnight) keeps the grid labels honest on
 * DST days: a 09:00 appointment is drawn at the 09:00 line whether the day
 * has 23, 24 or 25 hours. Events that cross midnight are clamped to the day
 * and flagged with `continuesBefore` / `continuesAfter`.
 */
import {
  addDaysToPlainDate,
  diffPlainDates,
  timeToMinutes,
  toPlainDate,
  toTimeOfDay,
  type PlainDate,
} from "@/lib/format/datetime";

export const DAY_MINUTES = 24 * 60;

export type CalendarItem = {
  id: string;
  start: string;
  end: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
};

export type PositionedEvent<T extends CalendarItem> = {
  item: T;
  /** Service start/end, wall-clock minutes within the day (clamped to 0..1440). */
  startMin: number;
  endMin: number;
  /** Including buffers, clamped to the day. */
  blockStartMin: number;
  blockEndMin: number;
  /** 0-based column within its overlap cluster, and the cluster's column count. */
  lane: number;
  lanes: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Wall-clock minute of `instant` relative to the start of `date` in `timeZone`.
 * Instants on earlier days return a negative number of whole days (×1440),
 * later days a value ≥ 1440 — callers clamp.
 */
export function minuteOfDate(instant: string, date: PlainDate, timeZone: string): number {
  const day = toPlainDate(instant, timeZone);
  const offsetDays = diffPlainDates(day, date);
  return offsetDays * DAY_MINUTES + timeToMinutes(toTimeOfDay(instant, timeZone));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Position the items that intersect `date`: clamp to the day, then pack
 * overlapping items into side-by-side lanes (greedy interval partitioning per
 * connected overlap cluster, like Google/Cal.com). Overlap is judged on
 * service time, not buffers — buffers are drawn as quiet hatching.
 */
export function layoutDay<T extends CalendarItem>(
  items: readonly T[],
  date: PlainDate,
  timeZone: string,
): PositionedEvent<T>[] {
  const positioned: PositionedEvent<T>[] = [];
  for (const item of items) {
    const rawStart = minuteOfDate(item.start, date, timeZone);
    let rawEnd = minuteOfDate(item.end, date, timeZone);
    // Zero/negative duration (bad data or DST fold): give it a visible sliver.
    if (rawEnd <= rawStart) rawEnd = rawStart + 1;
    if (rawEnd <= 0 || rawStart >= DAY_MINUTES) continue;
    const before = item.bufferBeforeMinutes ?? 0;
    const after = item.bufferAfterMinutes ?? 0;
    positioned.push({
      item,
      startMin: clamp(rawStart, 0, DAY_MINUTES),
      endMin: clamp(rawEnd, 0, DAY_MINUTES),
      blockStartMin: clamp(rawStart - before, 0, DAY_MINUTES),
      blockEndMin: clamp(rawEnd + after, 0, DAY_MINUTES),
      lane: 0,
      lanes: 1,
      continuesBefore: rawStart < 0,
      continuesAfter: rawEnd > DAY_MINUTES,
    });
  }
  return assignLanes(positioned);
}

/** Greedy lane assignment on already-clamped events. Exported for tests. */
export function assignLanes<
  E extends { startMin: number; endMin: number; lane: number; lanes: number; item: { id: string } },
>(events: E[]): E[] {
  const sorted = [...events].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      b.endMin - b.startMin - (a.endMin - a.startMin) ||
      a.item.id.localeCompare(b.item.id),
  );
  let cluster: E[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const e of cluster) e.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };

  for (const e of sorted) {
    if (cluster.length > 0 && e.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= e.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e.endMin);
    } else {
      laneEnds[lane] = e.endMin;
    }
    e.lane = lane;
    cluster.push(e);
    clusterEnd = cluster.length === 1 ? e.endMin : Math.max(clusterEnd, e.endMin);
  }
  flush();
  return sorted;
}

/** Group items by the business-timezone date(s) they touch. Multi-day items appear on each day. */
export function groupByDate<T extends CalendarItem>(
  items: readonly T[],
  timeZone: string,
): Map<PlainDate, T[]> {
  const map = new Map<PlainDate, T[]>();
  for (const item of items) {
    const first = toPlainDate(item.start, timeZone);
    // An item ending exactly at midnight does not touch the next day.
    const endMinute = minuteOfDate(item.end, first, timeZone);
    const lastOffset = Math.max(0, Math.ceil(endMinute / DAY_MINUTES) - 1);
    for (let i = 0; i <= Math.min(lastOffset, 31); i++) {
      const d = addDaysToPlainDate(first, i);
      const list = map.get(d);
      if (list) list.push(item);
      else map.set(d, [item]);
    }
  }
  return map;
}

export type MinuteInterval = { start: number; end: number };

/**
 * Visible hour range for the grid: covers opening hours and every event,
 * with a default working day when there is nothing to show. Whole hours.
 */
export function visibleHourRange(
  open: readonly MinuteInterval[],
  events: readonly { blockStartMin: number; blockEndMin: number }[],
  fallback: [number, number] = [8, 18],
): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const i of open) {
    min = Math.min(min, i.start);
    max = Math.max(max, i.end);
  }
  for (const e of events) {
    min = Math.min(min, e.blockStartMin);
    max = Math.max(max, e.blockEndMin);
  }
  if (!Number.isFinite(min)) return fallback;
  // One hour of breathing room either side, within the day.
  const startHour = clamp(Math.floor(min / 60) - 1, 0, 23);
  const endHour = clamp(Math.ceil(max / 60) + 1, startHour + 1, 24);
  return [Math.min(startHour, fallback[0]), Math.max(endHour, Math.min(fallback[1], 24))];
}

/** Snap a pixel offset in the grid to a start minute on a `step`-minute grid. */
export function snapMinute(offsetPx: number, pxPerMinute: number, startMinute: number, step = 15): number {
  const raw = startMinute + offsetPx / pxPerMinute;
  return clamp(Math.floor(raw / step) * step, 0, DAY_MINUTES - step);
}
