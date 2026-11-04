import { browserTimeZone, diffPlainDates, formatDate, toPlainDate, todayInTz } from "@/lib/format";

/** The viewer's own time zone (connected apps belong to the person, not a business). */
export function viewerTimeZone(): string {
  return browserTimeZone() ?? "UTC";
}

/** "Connected 1 Oct 2026". */
export function formatConnectedAt(iso: string, timeZone: string): string {
  return `Connected ${formatDate(iso, timeZone, "medium")}`;
}

/** "Last used today" / "yesterday" / "3 days ago" (within a week) / "on 1 Oct 2026", or "Not used yet". */
export function formatLastUsed(iso: string | null, timeZone: string, now: Date = new Date()): string {
  if (!iso) return "Not used yet";
  const days = diffPlainDates(todayInTz(timeZone, now), toPlainDate(iso, timeZone));
  if (days <= 0) return "Last used today";
  if (days === 1) return "Last used yesterday";
  if (days < 7) return `Last used ${days} days ago`;
  return `Last used on ${formatDate(iso, timeZone, "medium")}`;
}
