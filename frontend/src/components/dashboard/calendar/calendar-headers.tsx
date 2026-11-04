"use client";

import type { Resource } from "@/lib/api/types";
import type { CalendarMode } from "@/lib/dashboard/calendar";
import type { PlainDate } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceKindIcon, useFmt } from "../common";
import type { CalendarColumn } from "./use-calendar-data";

/** Minimum column width: resources get more room in day view than days in week view. */
export const colMin = (view: CalendarMode) =>
  view === "day" ? "min-w-36 sm:min-w-44" : "min-w-28 sm:min-w-32";

const shownCount = (c: CalendarColumn) => c.bookings.filter((b) => b.status !== "cancelled").length;

/** The sticky header row: one header per column (a resource in day view, a day in week view). */
export function CalendarHeaderRow({
  columns,
  view,
  today,
  loading,
  onOpenDay,
}: {
  columns: CalendarColumn[];
  view: CalendarMode;
  today: PlainDate;
  loading: boolean;
  onOpenDay: (date: PlainDate) => void;
}) {
  return (
    <div className="sticky top-0 z-30 flex border-b border-border bg-surface/95 backdrop-blur-sm">
      <div className="sticky left-0 z-10 w-14 shrink-0 bg-surface/95" />
      {loading
        ? Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className={cn("flex h-14 flex-1 items-center gap-2 border-l border-border px-3", colMin(view))}
            >
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))
        : columns.map((c) =>
            c.resource ? (
              <ResourceHeader
                key={c.key}
                resource={c.resource}
                count={shownCount(c)}
                off={c.open.length === 0}
                className={colMin(view)}
              />
            ) : (
              <DayHeader
                key={c.key}
                date={c.date}
                today={today}
                count={shownCount(c)}
                onClick={() => onOpenDay(c.date)}
                className={colMin(view)}
              />
            ),
          )}
    </div>
  );
}

function ResourceHeader({
  resource,
  count,
  off,
  className,
}: {
  resource: Resource;
  count: number;
  off: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex h-14 flex-1 items-center gap-2.5 border-l border-border px-3", className)}>
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-white"
        style={{ backgroundColor: resource.color }}
      >
        <ResourceKindIcon kind={resource.kind} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{resource.name}</span>
        <span className="tnum truncate text-2xs text-muted-foreground">
          {/* Deactivated, but shown for the bookings it still has that day. */}
          {!resource.isActive ? `Inactive · ${count} booked` : off ? "Not working" : `${count} booked`}
        </span>
      </span>
    </div>
  );
}

function DayHeader({
  date,
  today,
  count,
  onClick,
  className,
}: {
  date: PlainDate;
  today: PlainDate;
  count: number;
  onClick: () => void;
  className?: string;
}) {
  const fmt = useFmt();
  const isToday = date === today;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-14 flex-1 items-center gap-2 border-l border-border px-3 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        className,
      )}
    >
      <span
        className={cn(
          "tnum flex size-8 items-center justify-center rounded-full text-sm font-semibold",
          isToday ? "bg-brand text-brand-foreground" : "text-foreground",
        )}
      >
        {Number(date.slice(8))}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn("text-xs font-medium", isToday ? "text-brand" : "text-muted-foreground")}>
          {fmt.date(date, "weekday")}
        </span>
        <span className="tnum text-2xs text-subtle-foreground">{count > 0 ? `${count} booked` : "—"}</span>
      </span>
    </button>
  );
}
