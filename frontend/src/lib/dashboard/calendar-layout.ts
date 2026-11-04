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
  /** Which overlap cluster (a run of events joined by overlaps) it belongs to, in time order. */
  cluster: number;
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
 * connected overlap cluster). Overlap is judged on service time, not buffers —
 * buffers are drawn as quiet hatching.
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
      cluster: 0,
      continuesBefore: rawStart < 0,
      continuesAfter: rawEnd > DAY_MINUTES,
    });
  }
  return assignLanes(positioned);
}

/** Greedy lane assignment on already-clamped events. Exported for tests. */
export function assignLanes<
  E extends {
    startMin: number;
    endMin: number;
    lane: number;
    lanes: number;
    cluster?: number;
    item: { id: string };
  },
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
  let clusterIndex = 0;

  const flush = () => {
    for (const e of cluster) {
      e.lanes = laneEnds.length;
      e.cluster = clusterIndex;
    }
    if (cluster.length > 0) clusterIndex++;
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

/**
 * Bookings of one session drawn as one entry: a class's attendees share the service, the time and the resources, so
 * five people in a 15:00 class are one block ("5 booked"), not five slivers. Anything else stays one entry per
 * booking (two people booked on one resource at once is a clash, and still shows as two).
 */
export type SessionEntry<T> = CalendarItem & { bookings: [T, ...T[]] };

export function groupSessions<
  T extends CalendarItem & { service: { id: string }; resources: readonly { id: string }[] },
>(bookings: readonly T[]): SessionEntry<T>[] {
  const byKey = new Map<string, [T, ...T[]]>();
  const order: string[] = [];
  for (const b of bookings) {
    const key = `${b.service.id}|${b.start}|${b.end}|${b.resources
      .map((r) => r.id)
      .sort()
      .join(",")}`;
    const list = byKey.get(key);
    if (list) list.push(b);
    else {
      byKey.set(key, [b]);
      order.push(key);
    }
  }
  return order.flatMap((key) => {
    const list = byKey.get(key);
    if (!list) return [];
    const first = list[0];
    return {
      id: list.length === 1 ? first.id : `session:${key}`,
      start: first.start,
      end: first.end,
      bufferBeforeMinutes: Math.max(...list.map((b) => b.bufferBeforeMinutes ?? 0)),
      bufferAfterMinutes: Math.max(...list.map((b) => b.bufferAfterMinutes ?? 0)),
      bookings: list,
    };
  });
}

/** Events that didn't fit their column, shown as one "+N" marker in the last lane over the time they span. */
export type LaneOverflow<E> = {
  lane: number;
  lanes: number;
  startMin: number;
  endMin: number;
  events: [E, ...E[]];
};

/**
 * Keep at most `maxLanes` side by side: in a cluster that needs more, the first `maxLanes - 1` lanes stay and the
 * rest fold into "+N" markers in the last lane, one per run of overlapping hidden events. A narrow column then shows
 * a few readable blocks and a count, rather than a row of unreadable slivers.
 */
export function capLanes<
  E extends { startMin: number; endMin: number; lane: number; lanes: number; cluster: number },
>(events: readonly E[], maxLanes: number): { shown: E[]; overflow: LaneOverflow<E>[] } {
  const max = Math.max(1, Math.floor(maxLanes));
  const shown: E[] = [];
  const hiddenByCluster = new Map<number, E[]>();
  for (const e of events) {
    if (e.lanes <= max) shown.push(e);
    else if (e.lane < max - 1) shown.push({ ...e, lanes: max });
    else {
      const list = hiddenByCluster.get(e.cluster);
      if (list) list.push(e);
      else hiddenByCluster.set(e.cluster, [e]);
    }
  }
  const overflow: LaneOverflow<E>[] = [];
  for (const hidden of hiddenByCluster.values()) {
    const sorted = [...hidden].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    let run: LaneOverflow<E> | null = null;
    for (const e of sorted) {
      if (run && e.startMin < run.endMin) {
        run.events.push(e);
        run.endMin = Math.max(run.endMin, e.endMin);
      } else {
        run = { lane: max - 1, lanes: max, startMin: e.startMin, endMin: e.endMin, events: [e] };
        overflow.push(run);
      }
    }
  }
  return { shown, overflow };
}
