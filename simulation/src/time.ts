/**
 * Dates and times in a business's timezone, with Intl only (no date library): local dates (`YYYY-MM-DD`), minutes of
 * the day and ISO weekdays, and the instant of a local date and time (DST-aware, as the backend's `ZonedDateTime`).
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export type LocalParts = {
  /** `YYYY-MM-DD` */
  date: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  dayOfWeek: number;
  seconds: number;
};

/** The local date, time and weekday of [instant] in [timeZone]. */
export function localParts(instant: Date | number, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(instant))) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    dayOfWeek: WEEKDAYS[parts.weekday ?? ""] ?? 0,
    seconds: Number(parts.second),
  };
}

/** Offset of [timeZone] from UTC at [instant], in minutes (e.g. 60 for Dublin in summer). */
export function offsetMinutes(instant: number, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const [y, m, d] = p.date.split("-").map(Number) as [number, number, number];
  const asUtc = Date.UTC(y, m - 1, d, Math.floor(p.minutes / 60), p.minutes % 60, p.seconds);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

/**
 * The instant of local [date] at [minuteOfDay] in [timeZone]. In a DST gap the time moves forward by the gap and in an
 * overlap the earlier instant wins, as `ZonedDateTime.of` resolves them. 24:00 is the next day's midnight.
 */
export function zonedInstant(date: string, minuteOfDay: number, timeZone: string): Date {
  if (minuteOfDay >= 24 * 60) return zonedInstant(addDays(date, 1), minuteOfDay - 24 * 60, timeZone);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  const before = offsetMinutes(naive - 12 * 3_600_000, timeZone);
  const after = offsetMinutes(naive + 12 * 3_600_000, timeZone);
  // Try the earlier offset first (overlap: earlier instant); fall back to the later one.
  for (const offset of [Math.max(before, after), Math.min(before, after)]) {
    const candidate = naive - offset * 60_000;
    const p = localParts(candidate, timeZone);
    if (p.date === date && p.minutes === minuteOfDay) return new Date(candidate);
  }
  // A gap: the wall time doesn't exist; the backend moves it later by the gap's length.
  return new Date(naive - Math.min(before, after) * 60_000);
}

/** [date] plus [days] calendar days. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** ISO weekday (1 = Monday) of a `YYYY-MM-DD` date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** `HH:mm` → minutes of the day. */
export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Minutes of the day → `HH:mm`. */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The first of the month of a `YYYY-MM-DD` date. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** `90s`, `10m`, `2h`, `3d` (or plain milliseconds) → milliseconds. */
export function parseDuration(text: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/.exec(text.trim());
  if (!match) throw new Error(`Not a duration: '${text}' (use e.g. 90s, 10m, 2h, 3d)`);
  const value = Number(match[1]);
  const unit = match[2] ?? "ms";
  const factor = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 1;
  return Math.round(value * factor);
}

/** A duration for people: `9m 30s`, `2h 5m`, `3d 4h`. */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}
