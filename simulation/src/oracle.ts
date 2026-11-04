/**
 * An independent model of where a booking may start, for the configurations the simulation generates (weekly rules
 * without validity dates or audiences, time off, extra hours and closures, no customer groups or release schedules).
 * It mirrors docs/architecture.md section 5.1 without sharing the backend's code, so a booking the backend accepts at a
 * time this model rules out points at a bug in one of the two, worth a look either way.
 */
import { addDays, localParts, parseTime, weekdayOf, zonedInstant } from "./time";

export type RuleLike = { dayOfWeek: number; startTime: string; endTime: string };
export type OverrideLike = {
  date: string;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
};

/** A resource's weekly rules and its own overrides. */
export type ResourceCalendar = { id: string; active: boolean; rules: RuleLike[]; overrides: OverrideLike[] };

/** Minutes of the local day, [start, end). */
export type Interval = { start: number; end: number };

export function merge(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

export function subtract(base: Interval[], cut: Interval): Interval[] {
  return base.flatMap((iv) => {
    if (cut.end <= iv.start || cut.start >= iv.end) return [iv];
    return [
      { start: iv.start, end: cut.start },
      { start: cut.end, end: iv.end },
    ].filter((p) => p.end > p.start);
  });
}

function overrideInterval(o: OverrideLike): Interval | null {
  return o.startTime && o.endTime ? { start: parseTime(o.startTime), end: parseTime(o.endTime) } : null;
}

/** [open] minus unavailable overrides; one without times closes the whole day. */
function closeAll(open: Interval[], unavailable: OverrideLike[]): Interval[] {
  return unavailable.reduce<Interval[]>((acc, o) => {
    const iv = overrideInterval(o);
    return iv ? subtract(acc, iv) : [];
  }, open);
}

/** A resource's open hours on a local date: rules − its time off + its extra hours − business closures. */
export function localWindows(calendar: ResourceCalendar, date: string, closures: OverrideLike[]): Interval[] {
  if (!calendar.active) return [];
  const weekday = weekdayOf(date);
  const ruled = merge(
    calendar.rules
      .filter((r) => r.dayOfWeek === weekday)
      .map((r) => ({ start: parseTime(r.startTime), end: parseTime(r.endTime) })),
  );
  const own = calendar.overrides.filter((o) => o.date === date);
  const extra = own.filter((o) => o.isAvailable).flatMap((o) => overrideInterval(o) ?? []);
  const open = merge([
    ...closeAll(
      ruled,
      own.filter((o) => !o.isAvailable),
    ),
    ...extra,
  ]);
  return closeAll(
    open,
    closures.filter((c) => c.date === date && !c.isAvailable),
  );
}

export type Placement = {
  timeZone: string;
  start: Date;
  end: Date;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  /** Minutes between candidate starts: the service's slot interval, else its duration (at least 5). */
  stepMinutes: number;
  /** The resources the booking was given. */
  resourceIds: string[];
  /** Each requirement: how many resources it takes from which pool. */
  requirements: { quantity: number; resourceIds: string[] }[];
  calendars: Map<string, ResourceCalendar>;
  closures: OverrideLike[];
  /** Customers' bookings keep the notice and advance windows; staff may book any time from now on. */
  mode: "public" | "staff";
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  /** When the request was sent and its answer arrived (the server's clock read lies between them). */
  sentAt: number;
  receivedAt: number;
  /** Clock difference tolerated between the simulation and the server. */
  skewMs?: number;
};

/** Why the booking could not have been offered at its time (empty when it could). */
export function placementProblems(p: Placement): string[] {
  const problems: string[] = [];
  const skew = p.skewMs ?? 5_000;
  const before = p.bufferBeforeMinutes * 60_000;
  const after = p.bufferAfterMinutes * 60_000;
  const spanStart = p.start.getTime() - before;
  const spanEnd = p.end.getTime() + after;
  const local = localParts(spanStart, p.timeZone);
  const date = local.date;

  // The given resources: one per place, each from its requirement's pool.
  const pools = p.requirements.map((r) => new Set(r.resourceIds));
  const needed = p.requirements.reduce((n, r) => n + r.quantity, 0);
  if (p.resourceIds.length !== needed) {
    problems.push(`has ${p.resourceIds.length} resources, the service needs ${needed}`);
  }
  for (const rid of p.resourceIds) {
    if (!pools.some((pool) => pool.has(rid)))
      problems.push(`resource ${rid} is in none of the service's pools`);
  }

  // Each given resource is open for the whole span (with buffers).
  for (const rid of p.resourceIds) {
    const cal = p.calendars.get(rid);
    if (!cal) continue;
    const windows = localWindows(cal, date, p.closures).map((w) => ({
      start: zonedInstant(date, w.start, p.timeZone).getTime(),
      end: zonedInstant(date, w.end, p.timeZone).getTime(),
    }));
    if (!windows.some((w) => w.start <= spanStart && spanEnd <= w.end)) {
      problems.push(
        `resource ${rid} is not open for the whole of ${new Date(spanStart).toISOString()}..${new Date(spanEnd).toISOString()}`,
      );
    }
  }

  // The start is on the grid of some pool resource's window: window start + buffer before + k × step.
  const step = Math.max(5, p.stepMinutes) * 60_000;
  const poolIds = new Set(p.requirements.flatMap((r) => r.resourceIds));
  const aligned = [...poolIds].some((rid) => {
    const cal = p.calendars.get(rid);
    if (!cal) return true; // A resource the model doesn't know: can't judge.
    return localWindows(cal, date, p.closures).some((w) => {
      const first = zonedInstant(date, w.start, p.timeZone).getTime() + before;
      const offset = p.start.getTime() - first;
      return offset >= 0 && offset % step === 0;
    });
  });
  if (!aligned)
    problems.push(`start ${p.start.toISOString()} is off every window's ${p.stepMinutes}-minute grid`);

  if (p.start.getTime() < p.sentAt - skew) problems.push("starts in the past");
  if (p.mode === "public") {
    if (p.start.getTime() < p.sentAt + p.minNoticeMinutes * 60_000 - skew) {
      problems.push(`starts within the ${p.minNoticeMinutes}-minute notice`);
    }
    const latest = addDays(localParts(p.receivedAt + skew, p.timeZone).date, p.maxAdvanceDays);
    if (localParts(p.start, p.timeZone).date > latest)
      problems.push(`starts after the ${p.maxAdvanceDays}-day advance limit`);
  }
  return problems;
}
