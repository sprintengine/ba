/**
 * Date/time helpers. Rules (architecture §2):
 *  - Instants are ISO-8601 strings with offset. ALWAYS display them in the
 *    business timezone (`business.timezone`), never the browser's.
 *  - Dates are "YYYY-MM-DD" plain dates interpreted in the business timezone.
 *  - Times of day are "HH:mm".
 * Formatting uses Intl (locale-aware); arithmetic in a zone uses @date-fns/tz. date-fns' `format` (and the
 * en-US locale it brings) is deliberately not used: the fixed "yyyy-MM-dd"/"HH:mm" shapes below are read off
 * the instant shifted by the zone's UTC offset.
 */
import { tzOffset } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { DEFAULT_LOCALE } from "./locale";

export type PlainDate = string; // "YYYY-MM-DD"
export type TimeOfDay = string; // "HH:mm"

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone, ...options });
    fmtCache.set(key, f);
  }
  return f;
}

const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isPlainDate(value: string): value is PlainDate {
  return PLAIN_DATE_RE.test(value);
}

/** A plain date as a UTC-noon Date — safe for calendar maths and Intl formatting with timeZone "UTC". */
function plainDateToUtcDate(date: PlainDate): Date {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function utcDateToPlainDate(date: Date): PlainDate {
  return date.toISOString().slice(0, 10);
}

export function addDaysToPlainDate(date: PlainDate, days: number): PlainDate {
  return utcDateToPlainDate(addDays(plainDateToUtcDate(date), days));
}
export function diffPlainDates(a: PlainDate, b: PlainDate): number {
  return differenceInCalendarDays(plainDateToUtcDate(a), plainDateToUtcDate(b));
}
/** ISO weekday of a plain date: Mon=1 … Sun=7 (matches AvailabilityRule.dayOfWeek). */
export function isoWeekday(date: PlainDate): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const d = plainDateToUtcDate(date).getUTCDay();
  return (d === 0 ? 7 : d) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

// ---- Calendar months and ISO weeks (plain dates, no timezone involved) ----

/** "YYYY-MM" */
export type PlainMonth = string;

export function monthOf(date: PlainDate): PlainMonth {
  return date.slice(0, 7);
}

/** The month [delta] months after [month] (negative goes back). */
export function addMonths(month: PlainMonth, delta: number): PlainMonth {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: PlainMonth): number {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The first day of [date]'s month. */
export function monthStart(date: PlainDate): PlainDate {
  return `${monthOf(date)}-01`;
}

/** The last day of [date]'s month. */
export function monthEnd(date: PlainDate): PlainDate {
  const month = monthOf(date);
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

/** The same day [delta] months later, clamped to the end of a shorter month (31 Jan + 1 → 28/29 Feb). */
export function addMonthsKeepingDay(date: PlainDate, delta: number): PlainDate {
  const target = addMonths(monthOf(date), delta);
  const day = Math.min(Number(date.slice(8)), daysInMonth(target));
  return `${target}-${String(day).padStart(2, "0")}`;
}

/** Monday of the ISO week containing [date]. */
export function startOfIsoWeek(date: PlainDate): PlainDate {
  return addDaysToPlainDate(date, 1 - isoWeekday(date));
}

/** The seven days (Monday first) of the ISO week containing [date]. */
export function isoWeekDates(date: PlainDate): PlainDate[] {
  const monday = startOfIsoWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDaysToPlainDate(monday, i));
}

/** Today's date in a timezone. */
export function todayInTz(timeZone: string, now: Date = new Date()): PlainDate {
  return toPlainDate(now, timeZone);
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** The zone's UTC offset in minutes (east positive) at an epoch time; tzOffset caches its Intl formatter. */
function offsetAt(timeZone: string, epochMs: number): number {
  return tzOffset(timeZone, new Date(epochMs));
}

/** The wall clock of an instant in a zone as "YYYY-MM-DDTHH:mm:ss": the instant shifted by the zone's offset. */
function wallClock(epochMs: number, offset: number): string {
  return new Date(epochMs + offset * MINUTE_MS).toISOString().slice(0, 19);
}

/** The calendar date of an instant in a timezone. */
export function toPlainDate(instant: string | Date, timeZone: string): PlainDate {
  const t = (typeof instant === "string" ? parseISO(instant) : instant).getTime();
  return wallClock(t, offsetAt(timeZone, t)).slice(0, 10);
}

/** The wall-clock time of an instant in a timezone ("HH:mm"). */
export function toTimeOfDay(instant: string | Date, timeZone: string): TimeOfDay {
  const t = (typeof instant === "string" ? parseISO(instant) : instant).getTime();
  return wallClock(t, offsetAt(timeZone, t)).slice(11, 16);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Wall-clock date + time in a zone → ISO-8601 with that zone's offset, e.g. "2026-10-01T09:00:00+01:00".
 * Resolved as java.time does, independent of the browser's own zone: a time repeated by a fall-back takes the
 * earlier, summer-time offset; a time skipped by a spring-forward moves on by the gap (01:30 → 02:30 in Dublin).
 */
export function zonedToIso(date: PlainDate, time: TimeOfDay, timeZone: string): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const local = Date.UTC(y, m - 1, d, hh, mm);
  // The offsets either side of any transition near this wall clock; the first is the one in force before it.
  const before = offsetAt(timeZone, local - DAY_MS);
  const after = offsetAt(timeZone, local + DAY_MS);
  const valid = [before, after].find((o) => offsetAt(timeZone, local - o * MINUTE_MS) === o);
  // In a gap, the instant the wall clock would be under the old offset is already past the transition.
  const offset = valid ?? offsetAt(timeZone, local - before * MINUTE_MS);
  const wall = valid === undefined ? wallClock(local - before * MINUTE_MS, offset) : wallClock(local, 0);
  const abs = Math.abs(offset);
  return `${wall}${offset < 0 ? "-" : "+"}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** "09:00" (locale-aware 12/24h). */
export function formatTime(instant: string | Date, timeZone: string, locale = DEFAULT_LOCALE): string {
  const d = typeof instant === "string" ? parseISO(instant) : instant;
  return dtf(locale, timeZone, { hour: "2-digit", minute: "2-digit" }).format(d);
}

/** "09:00–09:45" */
export function formatTimeRange(
  start: string,
  end: string,
  timeZone: string,
  locale = DEFAULT_LOCALE,
): string {
  return `${formatTime(start, timeZone, locale)}–${formatTime(end, timeZone, locale)}`;
}

export type DateStyle =
  "short" | "medium" | "long" | "full" | "weekday" | "monthYear" | "dayMonth" | "dayMonthYear";
const DATE_STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: "numeric", month: "short" }, // 1 Oct
  dayMonth: { weekday: "short", day: "numeric", month: "short" }, // Thu 1 Oct
  medium: { day: "numeric", month: "short", year: "numeric" }, // 1 Oct 2026
  dayMonthYear: { weekday: "short", day: "numeric", month: "short", year: "numeric" }, // Thu, 1 Oct 2026
  long: { weekday: "long", day: "numeric", month: "long" }, // Thursday 1 October
  full: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  weekday: { weekday: "short" }, // Thu
  monthYear: { month: "long", year: "numeric" }, // October 2026
};

/**
 * Format a plain date ("2026-10-01") or an instant (ISO with offset) as a date.
 * Plain dates are formatted as-is; instants are converted to `timeZone` first.
 */
export function formatDate(
  value: PlainDate | Date,
  timeZone: string,
  style: DateStyle = "medium",
  locale = DEFAULT_LOCALE,
): string {
  // English drops the comma once a year is added; keep one way of writing a day.
  const steady = (text: string) => (style === "dayMonthYear" ? text.replace(/^(\p{L}+) /u, "$1, ") : text);
  if (typeof value === "string" && isPlainDate(value)) {
    return steady(dtf(locale, "UTC", DATE_STYLES[style]).format(plainDateToUtcDate(value)));
  }
  const d = typeof value === "string" ? parseISO(value) : value;
  return steady(dtf(locale, timeZone, DATE_STYLES[style]).format(d));
}

/** "Thu, 1 Oct, 09:00" */
export function formatDateTime(instant: string | Date, timeZone: string, locale = DEFAULT_LOCALE): string {
  return `${formatDate(instant, timeZone, "dayMonth", locale)}, ${formatTime(instant, timeZone, locale)}`;
}

/**
 * The app's way of writing a day in a line: "Thu, 1 Oct", with the year only when it isn't this year: "Thu, 1 Oct 2025".
 */
export function formatDay(
  value: PlainDate | Date,
  timeZone: string,
  locale = DEFAULT_LOCALE,
  now: Date = new Date(),
): string {
  const date = typeof value === "string" && isPlainDate(value) ? value : toPlainDate(value, timeZone);
  const thisYear = date.slice(0, 4) === todayInTz(timeZone, now).slice(0, 4);
  return formatDate(value, timeZone, thisYear ? "dayMonth" : "dayMonthYear", locale);
}

/** "Today" / "Tomorrow" / "Yesterday" / "Thu, 1 Oct" relative to now in the zone. */
export function formatRelativeDay(
  value: PlainDate,
  timeZone: string,
  locale = DEFAULT_LOCALE,
  now: Date = new Date(),
): string {
  const date = isPlainDate(value) ? value : toPlainDate(value, timeZone);
  const diff = diffPlainDates(date, todayInTz(timeZone, now));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDate(date, timeZone, "dayMonth", locale);
}

/** 45 → "45 min"; 90 → "1 h 30 min"; 120 → "2 h". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Short zone label for the UI, e.g. "Europe/Dublin" → "IST" / "GMT+1". */
export function timeZoneLabel(timeZone: string, at: Date = new Date(), locale = DEFAULT_LOCALE): string {
  const part = dtf(locale, timeZone, { timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** "HH:mm" → minutes since midnight. */
export function timeToMinutes(time: TimeOfDay): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}
export function minutesToTime(minutes: number): TimeOfDay {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Lenient time parser for inputs: "9" → "09:00", "930" → "09:30", "9.30" → "09:30",
 * "2pm" → "14:00", "14:05" → "14:05". Returns null when invalid.
 */
export function parseTimeInput(raw: string): TimeOfDay | null {
  let s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let meridiem: "a" | "p" | null = null;
  const mer = /(a|p)m?$/.exec(s);
  if (mer) {
    meridiem = mer[1] as "a" | "p";
    s = s.slice(0, mer.index);
  }
  let hours: number;
  let minutes: number;
  const sep = /^(\d{1,2})[:.h](\d{2})$/.exec(s);
  if (sep) {
    hours = Number(sep[1]);
    minutes = Number(sep[2]);
  } else if (/^\d{1,4}$/.test(s)) {
    if (s.length <= 2) {
      hours = Number(s);
      minutes = 0;
    } else {
      hours = Number(s.slice(0, s.length - 2));
      minutes = Number(s.slice(-2));
    }
  } else {
    return null;
  }
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "p" && hours !== 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59) return null;
  return minutesToTime(hours * 60 + minutes);
}

/** "Good morning" / "Good afternoon" / "Good evening" for the time of day in [timeZone] (the small hours are evening). */
export function greetingAt(now: Date, timeZone: string): string {
  const hour = Math.floor(timeToMinutes(toTimeOfDay(now, timeZone)) / 60);
  if (hour < 5 || hour >= 18) return "Good evening";
  return hour < 12 ? "Good morning" : "Good afternoon";
}
