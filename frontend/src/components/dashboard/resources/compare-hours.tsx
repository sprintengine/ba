"use client";

import { useMemo, useState } from "react";
import type { DayOfWeek, Resource } from "@/lib/api/types";
import { useResourceAvailabilities } from "@/lib/api/hooks";
import { rulesToSchedules, WEEKDAYS, type TimeRange } from "@/lib/availability/weekly-hours";
import { endMinutes } from "@/lib/availability/windows";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { minutesToTime, timeToMinutes } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/common/feedback";
import { SectionHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceKindIcon, resourceTile } from "../common";

const summary = (ranges: readonly TimeRange[]) =>
  ranges.length === 0 ? ["Off"] : ranges.map((r) => `${r.startTime}–${r.endTime}`);

/** Whole hours from the earliest start to the latest end of the day, so every row shares one axis. */
function axisFor(days: readonly (readonly TimeRange[])[]) {
  const ranges = days.flat();
  return {
    start: Math.min(9 * 60, ...ranges.map((r) => Math.floor(timeToMinutes(r.startTime) / 60) * 60)),
    end: Math.max(17 * 60, ...ranges.map((r) => Math.ceil(endMinutes(r.endTime) / 60) * 60)),
  };
}

/** One weekday for everyone on one time axis: who overlaps, who's off, and where the gaps are. */
export function CompareHours({
  resources,
  onSelect,
}: {
  resources: Resource[];
  onSelect: (id: string) => void;
}) {
  const business = useCurrentBusiness();
  const [day, setDay] = useState<DayOfWeek>(1);
  const active = useMemo(() => resources.filter((r) => r.isActive), [resources]);
  const results = useResourceAvailabilities(
    business.id,
    active.map((r) => r.id),
  );
  const failed = results.find((r) => r.isError);
  const regular = results.map((r) => (r.data ? rulesToSchedules(r.data.rules)[0].days[day] : null));
  const axis = axisFor(regular.filter((x) => x !== null));
  const span = axis.end - axis.start;
  const percent = (minute: number) => ((minute - axis.start) / span) * 100;
  const step = span > 12 * 60 ? 4 : span > 6 * 60 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(span / 60 / step) + 1 }, (_, i) => i * step);

  return (
    <section className="flex min-w-0 flex-col">
      <SectionHeader title="Compare hours" description="Regular hours for everyone, on one timeline." />
      <SegmentedControl
        size="sm"
        aria-label="Day to compare"
        value={String(day)}
        onValueChange={(d) => setDay(Number(d) as DayOfWeek)}
        className="self-start"
        options={WEEKDAYS.map((d) => ({ value: String(d.day), label: d.short }))}
      />
      {failed ? (
        <ErrorState error={failed.error} onRetry={() => failed.refetch()} headingLevel={3} />
      ) : (
        <div className="mt-4 flex flex-col">
          <div aria-hidden className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[9rem_minmax(0,1fr)_6rem]">
            <span className="max-sm:hidden" />
            <div className="relative h-5">
              {ticks.map((h, i) => (
                <span
                  key={h}
                  className={cn(
                    "tnum absolute top-0 text-2xs text-subtle-foreground",
                    i === 0 ? "" : h * 60 === span ? "-translate-x-full" : "-translate-x-1/2",
                  )}
                  style={{ left: `${((h * 60) / span) * 100}%` }}
                >
                  {minutesToTime(axis.start + h * 60)}
                </span>
              ))}
            </div>
          </div>
          <ul aria-label="Hours by person" className="flex flex-col">
            {active.map((r, i) => {
              const ranges = regular[i] ?? null;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.id)}
                    className="focus-ring grid w-full grid-cols-[minmax(0,1fr)_6rem] items-center gap-x-3 gap-y-1 rounded-md py-1.5 text-left transition-colors hover:bg-accent/60 sm:grid-cols-[9rem_minmax(0,1fr)_6rem] sm:gap-y-0 pointer-coarse:min-h-11"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-md"
                        style={resourceTile(r.color)}
                      >
                        <ResourceKindIcon kind={r.kind} className="size-3.5" />
                      </span>
                      <span className="truncate text-sm font-medium">{r.name}</span>
                    </span>
                    <span className="tnum order-last flex flex-col text-right text-xs text-muted-foreground max-sm:order-none">
                      {ranges ? summary(ranges).map((s) => <span key={s}>{s}</span>) : null}
                    </span>
                    <span
                      className="relative h-6 overflow-hidden rounded-md bg-muted ring-1 ring-border-subtle ring-inset max-sm:col-span-full"
                      aria-hidden
                    >
                      {ranges === null ? (
                        <Skeleton className="absolute inset-0" />
                      ) : (
                        ranges.map((t) => (
                          <span
                            key={t.startTime}
                            className="absolute inset-y-0.5 rounded-sm bg-foreground/16 dark:bg-foreground/22"
                            style={{
                              left: `${percent(timeToMinutes(t.startTime))}%`,
                              width: `${percent(endMinutes(t.endTime)) - percent(timeToMinutes(t.startTime))}%`,
                            }}
                          />
                        ))
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
