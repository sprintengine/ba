/** Pure helpers for the reports page: chart ticks, shares and rankings of the summary's breakdowns. */
import type { ReportSummary } from "@/lib/api/types";
import { isPlainDate, type PlainDate } from "@/lib/format/datetime";
import { parseReportRange, reportRangeDates, type ClosedDateRange, type ReportRange } from "./date-ranges";

/** The reports page's `?range=&from=&to=`: the preset and the closed range it covers. */
export function parseReportParams(
  params: Pick<URLSearchParams, "get">,
  today: PlainDate,
): { preset: ReportRange; range: ClosedDateRange } {
  const date = (key: string) => {
    const value = params.get(key);
    return value !== null && isPlainDate(value) ? value : null;
  };
  const preset = parseReportRange(params.get("range"));
  const { from, to } = reportRangeDates(preset, today, { from: date("from"), to: date("to") });
  // A hand-edited (or stale) URL can end before it starts: read it the right way round rather than never loading.
  return { preset, range: from <= to ? { from, to } : { from: to, to: from } };
}

/** Recharts `interval` for the per-day axis: every label up to two weeks, then about 10 (or 12) labels. */
export function chartTickInterval(days: number): number {
  if (days > 45) return Math.ceil(days / 12) - 1;
  if (days > 14) return Math.ceil(days / 10) - 1;
  return 0;
}

/**
 * The days to label, counted back from the last with `interval` days skipped between labels: the newest day always
 * has its date, because that is where a report's activity usually is.
 */
export function chartTicks(dates: readonly string[], interval: number): string[] {
  return dates.filter((_, i) => (dates.length - 1 - i) % (interval + 1) === 0);
}

/** `part` as a whole percentage of `total`; `null` when there is no total. */
export function percentOf(part: number, total: number): number | null {
  return total ? Math.round((part / total) * 100) : null;
}

/** Nothing booked and nothing earned in the period. */
export function isEmptyReport(totals: ReportSummary["totals"]): boolean {
  return totals.bookings === 0 && totals.revenueCents === 0;
}

/** Services by bookings, then revenue (most first). */
export function rankServices(rows: ReportSummary["byService"]): ReportSummary["byService"] {
  return [...rows].sort((a, b) => b.bookings - a.bookings || b.revenueCents - a.revenueCents);
}

/** Resources by utilisation (busiest first). */
export function rankResources(rows: ReportSummary["byResource"]): ReportSummary["byResource"] {
  return [...rows].sort((a, b) => b.utilisation - a.utilisation);
}
