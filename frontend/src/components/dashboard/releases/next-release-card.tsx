"use client";

import { useMemo } from "react";
import { CalendarClock, Pause, Undo2, Zap } from "lucide-react";
import type { ReleaseDay, Releases, ReleaseSchedule } from "@/lib/api/types";
import { useReleases, useReleaseSchedules } from "@/lib/api/hooks";
import { useCurrentBusiness, usePermissions } from "@/lib/business/business-context";
import { addDaysToPlainDate, formatRelativeDay, todayInTz, type PlainDate } from "@/lib/format/datetime";
import { DEFAULT_LOCALE } from "@/lib/format/locale";
import { useNow } from "@/lib/hooks/use-now";
import { releaseDate, sameRelease } from "@/lib/releases/calendar";
import { opensLabel } from "@/lib/releases/text";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChangeTimePopover, changeNote, useReleaseControls, type ReleaseTarget } from "./release-controls";

const DAY_MS = 86_400_000;
/** Days of releases the card looks through: far enough for a week released a week ahead. */
const LOOKAHEAD_DAYS = 14;

/** The next release worth a glance: the days one schedule opens together, with what they'll open. */
export type NextRelease = ReleaseTarget & {
  /** Every day this release opens (the target's day is the first). */
  dates: PlainDate[];
  /** Free times the release opens, over all its days. */
  times: number;
  /** The open day just before the release and its free times: what's still to fill before more opens. */
  before: { date: PlainDate; times: number } | null;
};

/**
 * The release due soonest within a day, or a held day today or tomorrow: the days a schedule opens at that moment,
 * grouped. Days with nothing to open (and no change) are left out.
 */
export function nextRelease(
  releases: Releases,
  schedules: ReleaseSchedule[],
  today: PlainDate,
  now: Date,
): NextRelease | null {
  const tomorrow = addDaysToPlainDate(today, 1);
  const due = (d: ReleaseDay) =>
    d.state === "held"
      ? d.date === today || d.date === tomorrow
      : // Not open yet, and (the data may be a minute old) not already past.
        d.state !== "open" &&
        d.opensAt !== null &&
        Date.parse(d.opensAt) > now.getTime() &&
        Date.parse(d.opensAt) - now.getTime() <= DAY_MS;
  const groups = releases.schedules.flatMap((r) => {
    const schedule = schedules.find((s) => s.id === r.scheduleId && s.status === "active");
    if (!schedule) return [];
    const byOpening = new Map<string, ReleaseDay[]>();
    for (const d of r.days.filter((d) => due(d) && (d.times > 0 || d.changed))) {
      // One release: the days the schedule opens at the same moment, and with the same opening (or both held).
      const key = `${d.opensAt ?? "held"}|${releaseDate(schedule, d.date)}`;
      byOpening.set(key, [...(byOpening.get(key) ?? []), d]);
    }
    return [...byOpening.values()].map((days) => {
      const first = days[0] as ReleaseDay;
      const prev = r.days.find((d) => d.date === addDaysToPlainDate(first.date, -1) && d.state === "open");
      return {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        day: first,
        multiDay: sameRelease(schedule, first.date).length > 1,
        dates: days.map((d) => d.date),
        times: days.reduce((sum, d) => sum + d.times, 0),
        before: prev ? { date: prev.date, times: prev.times } : null,
      };
    });
  });
  const opens = (d: ReleaseDay) => (d.opensAt === null ? Number.POSITIVE_INFINITY : Date.parse(d.opensAt));
  return groups.sort((a, b) => opens(a.day) - opens(b.day))[0] ?? null;
}

/**
 * Overview card (§21): the next release due within a day, or a held day, with the quick changes: open now, change the
 * time, back to schedule. Where "hold tomorrow so today fills first" gets decided. Owners and admins only.
 */
export function NextReleaseCard() {
  const business = useCurrentBusiness();
  const perms = usePermissions();
  const now = useNow();
  const today = todayInTz(business.timezone, now);
  const range = useMemo(() => ({ from: today, to: addDaysToPlainDate(today, LOOKAHEAD_DAYS - 1) }), [today]);
  const schedules = useReleaseSchedules(business.id, { enabled: perms.manageSettings });
  const active = (schedules.data ?? []).filter((s) => s.status === "active");
  const releases = useReleases(business.id, perms.manageSettings && active.length > 0 ? range : null);
  if (!releases.data) return null;
  const next = nextRelease(releases.data, active, today, now);
  return next ? <ReleaseCard release={next} /> : null;
}

function ReleaseCard({ release }: { release: NextRelease }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const now = useNow();
  const locale = business.locale || DEFAULT_LOCALE;
  const controls = useReleaseControls(release);
  const { day, dates } = release;
  const tz = business.timezone;
  const first = formatRelativeDay(day.date, tz, locale, now);
  const last = dates[dates.length - 1] ?? day.date;
  const what = dates.length > 1 ? `${first} to ${formatRelativeDay(last, tz, locale, now)}` : first;
  const held = day.state === "held" || day.opensAt === null;
  const title = held
    ? `${what} ${dates.length > 1 ? "are" : "is"} on hold: ${v("customers")} can't book online yet`
    : `${what} ${dates.length > 1 ? "open" : "opens"} for booking ${opensLabel(day.opensAt ?? day.scheduledAt, tz, locale, now)}`;
  const facts = [
    release.scheduleName,
    changeNote(day, opensLabel(day.scheduledAt, tz, locale, now)),
    release.before
      ? `${release.before.times} still free ${formatRelativeDay(release.before.date, tz, locale, now).toLowerCase()}`
      : null,
    `${release.times} will open`,
  ].filter(Boolean);
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 py-5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            held
              ? "bg-danger-soft text-danger-soft-foreground"
              : day.state === "moved"
                ? "bg-warning-soft text-warning-soft-foreground"
                : "bg-brand-soft text-brand-soft-foreground",
          )}
        >
          {held ? <Pause className="size-5" /> : <CalendarClock className="size-5" />}
        </span>
        {/* A floor on the text's width, so on a phone the buttons wrap below it rather than squeezing it to a word a line. */}
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-semibold tracking-tight">{title}</p>
          <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {day.changed && (
            <Button
              size="sm"
              variant="ghost"
              disabled={controls.pending}
              onClick={() => void controls.reset()}
            >
              <Undo2 /> Back to schedule
            </Button>
          )}
          <ChangeTimePopover target={release} size="sm" variant="secondary" />
          <Button
            size="sm"
            variant="brand"
            disabled={controls.pending}
            onClick={() => void controls.openNow()}
          >
            <Zap /> Open now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
