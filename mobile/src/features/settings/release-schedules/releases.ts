/**
 * Pure helpers for Settings › Release schedules (the website's release-settings.tsx and release-controls.tsx rules,
 * which live in components there and so can't be imported).
 */
import type { ReleaseDay, ReleaseSchedule, Service } from "@shared/api/types";
import { addDaysToPlainDate, toPlainDate, toTimeOfDay, zonedToIso, type PlainDate } from "@shared/format";
import { liveDay } from "@shared/releases/text";

/** Days of releases the page lists ahead. */
export const UPCOMING_DAYS = 14;
/** Releases listed at most. */
export const UPCOMING_ROWS = 8;
/** Days the editor's preview shows. */
export const PREVIEW_DAYS = 8;

/** The services a schedule can cover: the business's active, public ones. */
export function bookableServices(services: readonly Service[] | undefined): Service[] {
  return (services ?? []).filter((s) => s.isActive && s.isPublic);
}

/**
 * "Blood test isn't in an active schedule: …" for the bookable services no active schedule covers (they open as far
 * ahead as the policies allow); null when every one is covered.
 */
export function uncoveredNote(
  schedules: readonly ReleaseSchedule[],
  services: readonly Service[],
): string | null {
  const covered = new Set(schedules.filter((s) => s.status === "active").flatMap((s) => s.serviceIds));
  const names = services.filter((s) => !covered.has(s.id)).map((s) => s.name);
  if (names.length === 0) return null;
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? "isn't" : "aren't"} in an active schedule: they can be booked as far ahead as your policies allow.`;
}

/** What's still to come and anything changed by hand, as of `now`; days with nothing to open are left out. */
export function upcomingDays(days: readonly ReleaseDay[], now: Date): ReleaseDay[] {
  return days
    .map((d) => liveDay(d, now))
    .filter((d) => (d.state !== "open" || d.changed) && (d.times > 0 || d.changed))
    .slice(0, UPCOMING_ROWS);
}

/** "Moved from 17:00 by Demo Owner" / "Opened early by …" / "Held by …", or null for an unchanged release. */
export function changeNote(day: ReleaseDay, scheduledLabel: string): string | null {
  if (!day.changed) return null;
  const by = day.changedBy ? ` by ${day.changedBy}` : "";
  if (day.state === "held") return `Held${by}`;
  if (day.state === "open") return `Opened early${by} · scheduled ${scheduledLabel}`;
  return `Moved from ${scheduledLabel}${by}`;
}

/** Where the move fields start: the release's current opening (or its scheduled one when held). */
export function moveStart(day: ReleaseDay, timeZone: string): { date: PlainDate; time: string } {
  const current = day.opensAt ?? day.scheduledAt;
  return { date: toPlainDate(current, timeZone), time: toTimeOfDay(current, timeZone) };
}

/** The new opening for a move, and why it can't be (it has to open before the day ends). */
export function moveTarget(
  day: ReleaseDay,
  date: PlainDate,
  time: string,
  timeZone: string,
): { opensAt: string; error: string | null } {
  const opensAt = zonedToIso(date, time, timeZone);
  const dayEnds = zonedToIso(addDaysToPlainDate(day.date, 1), "00:00", timeZone);
  return {
    opensAt,
    error: Date.parse(opensAt) >= Date.parse(dayEnds) ? "It has to open before the day ends" : null,
  };
}

/** "12 times" / "1 time". */
export const timesLabel = (n: number) => `${n} ${n === 1 ? "time" : "times"}`;
