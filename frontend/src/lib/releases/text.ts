/** Release schedule wording (§21): plain-English summaries and "opens …" labels. Pure. */
import type { ReleaseDay, ReleaseSchedule, ReleaseState } from "@/lib/api/types";
import {
  addDaysToPlainDate,
  diffPlainDates,
  formatDate,
  formatTime,
  todayInTz,
  toPlainDate,
} from "@/lib/format/datetime";
import { DEFAULT_LOCALE } from "@/lib/format/locale";
import type { ReleaseTiming } from "./calendar";

/** A wall-clock "HH:mm" in the locale's style ("17:00", "5:00 PM"). */
export function formatClock(time: string, locale = DEFAULT_LOCALE): string {
  return formatTime(`1970-01-01T${time}:00Z`, "UTC", locale);
}

/** "Monday" … "Sunday" for an ISO weekday, in the locale. */
export function weekdayName(weekday: number, locale = DEFAULT_LOCALE): string {
  // 5 October 2026 is a Monday.
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${addDaysToPlainDate("2026-10-05", weekday - 1)}T12:00:00Z`),
  );
}

/** Which week a weekly release opens: "next week (Mon–Sun)", "the week after next", "the week 3 weeks ahead". */
export function weekAheadLabel(weeksAhead: number): string {
  if (weeksAhead <= 1) return "next week (Mon–Sun)";
  if (weeksAhead === 2) return "the week after next";
  return `the week ${weeksAhead} weeks ahead`;
}

/** How far ahead of a day it opens: "the same day", "the day before", "3 days before". */
export function daysBeforeLabel(daysBefore: number): string {
  if (daysBefore === 0) return "the same day";
  if (daysBefore === 1) return "the day before";
  return `${daysBefore} days before`;
}

/** "Each day opens the day before at 17:00. Monday opens on Friday." / "Every Friday at 22:00, next week (Mon–Sun) opens." */
export function scheduleSummary(t: ReleaseTiming, locale = DEFAULT_LOCALE): string {
  const clock = formatClock(t.time, locale);
  if (t.cadence === "weekly") {
    return `Every ${weekdayName(t.weekday ?? 1, locale)} at ${clock}, ${weekAheadLabel(t.weeksAhead ?? 1)} opens.`;
  }
  const daysBefore = t.daysBefore ?? 0;
  const base = `Each day opens ${daysBeforeLabel(daysBefore)} at ${clock}.`;
  if (!t.weekdaysOnly) return base;
  return daysBefore === 1
    ? `${base} Monday opens on Friday.`
    : `${base} Releases that would fall at the weekend happen on the Friday before.`;
}

/**
 * When a release opens, from the business's point of view: "today at 17:00", "tomorrow at 09:00",
 * "Wed 14 Oct at 17:00"; past openings read the same way.
 */
export function opensLabel(
  iso: string,
  timeZone: string,
  locale = DEFAULT_LOCALE,
  now: Date = new Date(),
): string {
  const clock = formatTime(iso, timeZone, locale);
  const diff = diffPlainDates(toPlainDate(iso, timeZone), todayInTz(timeZone, now));
  if (diff === 0) return `today at ${clock}`;
  if (diff === 1) return `tomorrow at ${clock}`;
  if (diff === -1) return `yesterday at ${clock}`;
  return `${formatDate(iso, timeZone, "dayMonth", locale)} at ${clock}`;
}

/** The services a schedule covers, by name ("GP consultation, Nurse appointment"); unknown ids are skipped. */
export function servicesLabel(serviceIds: string[], services: { id: string; name: string }[]): string {
  const names = services.filter((s) => serviceIds.includes(s.id)).map((s) => s.name);
  return names.length > 0 ? names.join(", ") : "No services";
}

/** Who a schedule covers: "Everyone" or the groups by name. */
export function whoLabel(
  schedule: Pick<ReleaseSchedule, "everyone" | "groupIds">,
  groups: { id: string; name: string }[],
): string {
  if (schedule.everyone) return "Everyone";
  const names = groups.filter((g) => schedule.groupIds.includes(g.id)).map((g) => g.name);
  return names.length > 0 ? names.join(", ") : "No groups";
}

export const RELEASE_STATE: Record<
  ReleaseState,
  { label: string; tone: "success" | "neutral" | "warning" | "danger" }
> = {
  open: { label: "Open", tone: "success" },
  scheduled: { label: "Scheduled", tone: "neutral" },
  moved: { label: "Moved", tone: "warning" },
  held: { label: "On hold", tone: "danger" },
};

/**
 * The day as of `now`: a release whose time has passed is open, even if the data was fetched before it (the dashboard
 * refreshes releases every few minutes, not at each release).
 */
export function liveDay(day: ReleaseDay, now: Date): ReleaseDay {
  const passed = day.opensAt !== null && Date.parse(day.opensAt) <= now.getTime();
  return passed && (day.state === "scheduled" || day.state === "moved") ? { ...day, state: "open" } : day;
}
