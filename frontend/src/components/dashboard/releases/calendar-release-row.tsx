"use client";

import { useMemo, useState } from "react";
import { Lock, LockOpen, Pause } from "lucide-react";
import type { ReleaseDay, ReleaseSchedule, Releases } from "@/lib/api/types";
import { useReleases, useReleaseSchedules } from "@/lib/api/hooks";
import { useCurrentBusiness, usePermissions } from "@/lib/business/business-context";
import type { CalendarMode } from "@/lib/dashboard/calendar";
import {
  addDaysToPlainDate,
  formatDate,
  formatRelativeDay,
  formatTime,
  toPlainDate,
  type PlainDate,
} from "@/lib/format/datetime";
import { DEFAULT_LOCALE } from "@/lib/format/locale";
import { useNow } from "@/lib/hooks/use-now";
import { sameRelease } from "@/lib/releases/calendar";
import { liveDay } from "@/lib/releases/text";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReleasePanel, type ReleaseTarget } from "./release-controls";

/**
 * The calendar's release row (§21), under the day headers: for each day shown, a chip per active schedule saying
 * whether it's open or when it opens; a chip opens that day's release to change it. Owners and admins only; nothing
 * when the business has no schedules.
 */
export function CalendarReleaseRow({
  days,
  view,
  today,
  columnClass,
}: {
  /** The days shown (one in day view, seven in week view). */
  days: PlainDate[];
  view: CalendarMode;
  today: PlainDate;
  /** A column's width classes, so the cells line up with the grid. */
  columnClass: string;
}) {
  const business = useCurrentBusiness();
  const perms = usePermissions();
  const now = useNow(30_000);
  const schedules = useReleaseSchedules(business.id, { enabled: perms.manageSettings });
  const active = (schedules.data ?? []).filter((s) => s.status === "active");
  const first = days[0];
  const last = days[days.length - 1];
  const range = useMemo(() => (first && last ? { from: first, to: last } : null), [first, last]);
  const releases = useReleases(business.id, active.length > 0 ? range : null);
  if (!perms.manageSettings || active.length === 0 || !releases.data) return null;
  const data = releases.data;
  const locale = business.locale || DEFAULT_LOCALE;
  // The open day before a release, when it's shown: what's still to fill before the next day opens.
  const before = (scheduleId: string, date: PlainDate) => {
    const prev = dayOf(data, scheduleId, addDaysToPlainDate(date, -1), now);
    return prev?.state === "open"
      ? { label: formatRelativeDay(prev.date, business.timezone, locale).toLowerCase(), times: prev.times }
      : null;
  };

  const cell = (date: PlainDate) => (
    <div className="flex min-w-0 flex-col gap-1">
      {date >= today &&
        active.map((s) => {
          const day = dayOf(data, s.id, date, now);
          return day ? (
            <ReleaseChip
              key={s.id}
              schedule={s}
              day={day}
              today={today}
              showName={active.length > 1 || view === "day"}
              before={day.state === "open" ? null : before(s.id, date)}
            />
          ) : null;
        })}
    </div>
  );

  return (
    <div
      className="flex border-b border-border bg-background"
      role="group"
      aria-label="Online booking releases"
    >
      <div className="sticky left-0 z-10 w-14 shrink-0 bg-background" />
      {view === "day" ? (
        <div className="sticky left-14 flex flex-1 flex-wrap gap-1.5 border-l border-border px-2 py-1.5 [&>div]:flex-row [&>div]:flex-wrap">
          {first && cell(first)}
        </div>
      ) : (
        days.map((d) => (
          <div key={d} className={cn("flex-1 border-l border-border px-1.5 py-1.5", columnClass)}>
            {cell(d)}
          </div>
        ))
      )}
    </div>
  );
}

function dayOf(releases: Releases, scheduleId: string, date: PlainDate, now: Date): ReleaseDay | undefined {
  const day = releases.schedules.find((r) => r.scheduleId === scheduleId)?.days.find((d) => d.date === date);
  return day && liveDay(day, now);
}

const TONES = {
  open: "border-success-border bg-success-soft text-success-soft-foreground",
  scheduled: "border-border bg-muted text-muted-foreground",
  moved: "border-warning-border bg-warning-soft text-warning-soft-foreground",
  held: "border-danger-border bg-danger-soft text-danger-soft-foreground",
} as const;

function ReleaseChip({
  schedule,
  day,
  today,
  showName,
  before,
}: {
  schedule: ReleaseSchedule;
  day: ReleaseDay;
  today: PlainDate;
  showName: boolean;
  before: { label: string; times: number } | null;
}) {
  const business = useCurrentBusiness();
  const locale = business.locale || DEFAULT_LOCALE;
  const [open, setOpen] = useState(false);
  const label = chipLabel(day, today, business.timezone, locale);
  const target: ReleaseTarget = {
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    day,
    multiDay: sameRelease(schedule, day.date).length > 1,
  };
  const quiet = day.times === 0 && !day.changed;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${schedule.name}, ${formatDate(day.date, business.timezone, "long", locale)}: ${label}`}
          className={cn(
            "flex w-full min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left text-2xs font-medium transition-colors outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring",
            TONES[day.state],
            quiet && "opacity-60",
          )}
        >
          {day.state === "open" ? (
            <LockOpen className="size-3 shrink-0" />
          ) : day.state === "held" ? (
            <Pause className="size-3 shrink-0" />
          ) : (
            <Lock className="size-3 shrink-0" />
          )}
          <span className="truncate">
            {showName && <span className="font-semibold">{schedule.name} · </span>}
            {quiet && day.state !== "open" ? "No free times" : label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <p className="mb-2 text-xs text-muted-foreground">
          {formatDate(day.date, business.timezone, "long", locale)}
        </p>
        <ReleasePanel target={target} before={before} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** "Open", "On hold", "Opens 22:00" (today), "Wed 17:00": short enough for a week column. */
function chipLabel(day: ReleaseDay, today: PlainDate, timeZone: string, locale: string): string {
  if (day.state === "open") return "Open";
  if (day.state === "held" || day.opensAt === null) return "On hold";
  const date = toPlainDate(day.opensAt, timeZone);
  const clock = formatTime(day.opensAt, timeZone, locale);
  if (date === today) return `Opens ${clock}`;
  return `${formatDate(day.opensAt, timeZone, "weekday", locale)} ${clock}`;
}
