import {
  DEFAULT_LOCALE,
  diffPlainDates,
  formatDate,
  formatPrice,
  formatRelativeDay,
  formatTime,
  todayInTz,
  toPlainDate,
} from "@/lib/format";

/** 0.35 → "350 m"; 4.23 → "4.2 km"; 23.4 → "23 km". */
export function formatDistance(km: number, locale = DEFAULT_LOCALE): string {
  const safe = Math.max(0, km);
  const metres = Math.max(10, Math.round((safe * 1000) / 10) * 10);
  if (metres < 1000) return `${metres} m`;
  const digits = safe < 10 ? 1 : 0;
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
    Number(safe.toFixed(digits)),
  );
  return `${value} km`;
}

/**
 * A next free time as a short chip label in the business timezone:
 * "Today 14:00", "Tomorrow 09:30", "Fri 10:00" (this week), "Tue 13 Oct 10:00" (later).
 */
export function formatSlotLabel(
  start: string,
  timeZone: string,
  now: Date = new Date(),
  locale = DEFAULT_LOCALE,
): string {
  const date = toPlainDate(start, timeZone);
  const days = diffPlainDates(date, todayInTz(timeZone, now));
  const time = formatTime(start, timeZone, locale);
  if (days === 0 || days === 1) return `${formatRelativeDay(date, timeZone, locale, now)} ${time}`;
  const style = days > 1 && days < 7 ? "weekday" : "dayMonth";
  return `${formatDate(start, timeZone, style, locale)} ${time}`;
}

/** "Today" or "Tomorrow" when every one of these times falls on it, so a card can say the day once. */
export function sharedSlotDay(
  starts: readonly string[],
  timeZone: string,
  now: Date = new Date(),
  locale = DEFAULT_LOCALE,
): string | null {
  const dates = new Set(starts.map((s) => toPlainDate(s, timeZone)));
  const [date] = dates;
  if (dates.size !== 1 || !date) return null;
  const days = diffPlainDates(date, todayInTz(timeZone, now));
  return days === 0 || days === 1 ? formatRelativeDay(date, timeZone, locale, now) : null;
}

/** "from €45", "Free", or null when the business has no priced services. */
export function formatPriceFrom(cents: number | null, currency: string): string | null {
  if (cents === null) return null;
  return cents === 0 ? formatPrice(0, currency) : `from ${formatPrice(cents, currency)}`;
}

/** "1 business", "12 businesses", "No businesses yet". */
export function formatListingCount(count: number): string {
  if (count <= 0) return "No businesses yet";
  return count === 1 ? "1 business" : `${count} businesses`;
}
