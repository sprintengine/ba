/**
 * Weekly-hours editor model: the flat rule list from the API grouped into schedules (one per validity
 * period) of day → time ranges, and back; plus the editor's validation and helpers.
 */
import type { AvailabilityRule, AvailabilityRuleInput, DayOfWeek } from "@/lib/api/types";
import { minutesToTime, timeToMinutes } from "@/lib/format/datetime";
import { endMinutes, LATEST_END, mergeIntervals, rangeError } from "./windows";

export const WEEKDAYS: { day: DayOfWeek; short: string; long: string }[] = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 7, short: "Sun", long: "Sunday" },
];

export type TimeRange = { startTime: string; endTime: string; audienceGroupIds: string[] };
export type WeekHours = Record<DayOfWeek, TimeRange[]>;

/** A set of weekly hours valid for a date period (null = open-ended). */
export type Schedule = {
  key: string;
  validFrom: string | null;
  validUntil: string | null;
  days: WeekHours;
};

/** Every schedule of a resource, the regular (open-ended) one first: there is always one. */
export type Schedules = readonly [Schedule, ...Schedule[]];

export function emptyWeek(): WeekHours {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
}

export const periodKey = (validFrom: string | null, validUntil: string | null) =>
  `${validFrom ?? ""}~${validUntil ?? ""}`;

const byStart = (a: TimeRange, b: TimeRange) => a.startTime.localeCompare(b.startTime);

/**
 * Rules (flat, from the API) → schedules grouped by validity period. The
 * open-ended period ("always") comes first, then dated periods by start.
 * There is always at least one schedule.
 */
export function rulesToSchedules(
  rules: readonly Pick<AvailabilityRule, keyof AvailabilityRuleInput>[],
): Schedules {
  const map = new Map<string, Schedule>();
  for (const r of rules) {
    const key = periodKey(r.validFrom, r.validUntil);
    let s = map.get(key);
    if (!s) {
      s = { key, validFrom: r.validFrom, validUntil: r.validUntil, days: emptyWeek() };
      map.set(key, s);
    }
    s.days[r.dayOfWeek].push({
      startTime: r.startTime,
      endTime: r.endTime,
      audienceGroupIds: [...r.audienceGroupIds],
    });
  }
  const always = periodKey(null, null);
  const regular = map.get(always) ?? { key: always, validFrom: null, validUntil: null, days: emptyWeek() };
  map.delete(always);
  const dated = [...map.values()].sort(
    (a, b) =>
      (a.validFrom ?? "").localeCompare(b.validFrom ?? "") ||
      (a.validUntil ?? "").localeCompare(b.validUntil ?? ""),
  );
  const schedules: Schedules = [regular, ...dated];
  for (const s of schedules) for (const d of WEEKDAYS) s.days[d.day].sort(byStart);
  return schedules;
}

/** The schedule with `key`, or the regular one. */
export function scheduleFor(schedules: Schedules, key: string): Schedule {
  return schedules.find((s) => s.key === key) ?? schedules[0];
}

/** `schedules` with the one at `key` changed. */
export function updateSchedule(
  schedules: Schedules,
  key: string,
  patch: Partial<Omit<Schedule, "key">>,
): Schedules {
  const apply = (s: Schedule) => (s.key === key ? { ...s, ...patch } : s);
  const [regular, ...dated] = schedules;
  return [apply(regular), ...dated.map(apply)];
}

/** `schedules` without the dated one at `key` (the regular hours always stay). */
export function removeSchedule(schedules: Schedules, key: string): Schedules {
  const [regular, ...dated] = schedules;
  return [regular, ...dated.filter((s) => s.key !== key)];
}

/** `schedules` with an empty one for the period, unless it already has one; and that period's key. */
export function addPeriod(
  schedules: Schedules,
  validFrom: string,
  validUntil: string | null,
): { schedules: Schedules; key: string } {
  const key = periodKey(validFrom, validUntil);
  if (schedules.some((s) => s.key === key)) return { schedules, key };
  return { schedules: [...schedules, { key, validFrom, validUntil, days: emptyWeek() }], key };
}

/** Schedules → the flat rule list for `PUT /resources/{id}/rules`. */
export function schedulesToRules(schedules: readonly Schedule[]): AvailabilityRuleInput[] {
  const out: AvailabilityRuleInput[] = [];
  for (const s of schedules) {
    for (const { day } of WEEKDAYS) {
      for (const r of [...s.days[day]].sort(byStart)) {
        out.push({
          dayOfWeek: day,
          startTime: r.startTime,
          endTime: r.endTime,
          validFrom: s.validFrom,
          validUntil: s.validUntil,
          audienceGroupIds: [...r.audienceGroupIds],
        });
      }
    }
  }
  return out;
}

/** The backend keeps at most 100 rules (time ranges) per resource (`validateRules` in AvailabilityValidation.kt). */
export const MAX_RULES_PER_RESOURCE = 100;

/** Why these schedules can't be saved as a whole, or null: too many time ranges in all. */
export function schedulesError(schedules: readonly Schedule[]): string | null {
  const count = schedulesToRules(schedules).length;
  return count > MAX_RULES_PER_RESOURCE
    ? `At most ${MAX_RULES_PER_RESOURCE} time ranges in all (there are ${count})`
    : null;
}

/** Copy one day's ranges to other days (deep copy). */
export function copyDay(week: WeekHours, from: DayOfWeek, to: readonly DayOfWeek[]): WeekHours {
  const next = { ...week };
  for (const d of to) {
    if (d === from) continue;
    next[d] = week[from].map((r) => ({ ...r, audienceGroupIds: [...r.audienceGroupIds] }));
  }
  return next;
}

/** A sensible next range for "Add hours": after the last one, or 09:00–17:00. */
export function nextRange(ranges: readonly TimeRange[]): TimeRange {
  if (ranges.length === 0) return { startTime: "09:00", endTime: "17:00", audienceGroupIds: [] };
  const lastEnd = Math.max(...ranges.map((r) => endMinutes(r.endTime)));
  const start = Math.min(lastEnd + 60, 23 * 60);
  const end = Math.min(start + 120, timeToMinutes(LATEST_END));
  return { startTime: minutesToTime(start), endTime: minutesToTime(end), audienceGroupIds: [] };
}

/** Per-day validation: an error message per range index (or null). */
export function validateDay(ranges: readonly TimeRange[]): (string | null)[] {
  const errors: (string | null)[] = ranges.map((r) => rangeError(r.startTime, r.endTime));
  const order = ranges.map((r, i) => ({ r, i })).sort((a, b) => byStart(a.r, b.r));
  let prev: (typeof order)[number] | undefined;
  for (const cur of order) {
    if (prev && timeToMinutes(cur.r.startTime) < endMinutes(prev.r.endTime) && !errors[cur.i]) {
      errors[cur.i] = `Overlaps ${prev.r.startTime}–${prev.r.endTime}`;
    }
    prev = cur;
  }
  return errors;
}

export function validateWeek(week: WeekHours): boolean {
  return WEEKDAYS.every(({ day }) => validateDay(week[day]).every((e) => e === null));
}

export function validatePeriod(s: Pick<Schedule, "validFrom" | "validUntil">): string | null {
  if (s.validFrom && s.validUntil && s.validUntil < s.validFrom)
    return "The end date is before the start date";
  return null;
}

/** Total weekly open minutes (for a quiet summary like "38 h / week"). */
export function weeklyMinutes(week: WeekHours): number {
  let total = 0;
  for (const { day } of WEEKDAYS) {
    total += mergeIntervals(
      week[day].map((r) => ({ start: timeToMinutes(r.startTime), end: endMinutes(r.endTime) })),
    ).reduce((sum, i) => sum + (i.end - i.start), 0);
  }
  return total;
}
