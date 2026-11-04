/**
 * Morning / afternoon / evening grouping for a day's times, so a long list of slots scans quickly. Pure; the
 * times are "HH:mm" wall-clock times in the business timezone. Used by the public slot picker; the dashboard's
 * picker can reuse it.
 */

export type DayPeriod = "morning" | "afternoon" | "evening";

export const DAY_PERIODS: readonly { key: DayPeriod; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Evening" },
];

/** Before 12:00 is morning, before 17:00 afternoon, the rest evening. */
export function dayPeriod(time: string): DayPeriod {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return "morning";
  return hour < 17 ? "afternoon" : "evening";
}

export type PeriodGroup<T> = { key: DayPeriod | "all"; label: string | null; items: T[] };

/**
 * Items grouped by period of day, in day order, without empty periods. Lists of at most `groupAbove` items
 * stay one untitled group (`key: "all"`): headings would only add noise.
 */
export function groupByDayPeriod<T>(
  items: readonly T[],
  timeOf: (item: T) => string,
  groupAbove = 8,
): PeriodGroup<T>[] {
  if (items.length <= groupAbove) return [{ key: "all", label: null, items: [...items] }];
  return DAY_PERIODS.map((p) => ({
    key: p.key,
    label: p.label,
    items: items.filter((item) => dayPeriod(timeOf(item)) === p.key),
  })).filter((g) => g.items.length > 0);
}
