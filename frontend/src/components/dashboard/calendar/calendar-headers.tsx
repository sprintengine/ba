"use client";

import type { Resource } from "@/lib/api/types";
import type { CalendarMode } from "@/lib/dashboard/calendar";
import type { PlainDate } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceKindIcon, useFmt } from "../common";
import type { CalendarColumn } from "./use-calendar-data";

/**
 * Minimum column width: wide enough to read a booking, so four people fit at 1024 and six at 1440 and the rest scroll
 * sideways. A phone shows whole columns (one person, or three days) beside the 3.5rem gutter, never a sliver of the next.
 */
export const colMin = (view: CalendarMode) =>
  cn(
    "snap-start",
    view === "day"
      ? "max-sm:min-w-[calc(100cqw-3.5rem)] sm:min-w-52"
      : "max-sm:min-w-[calc((100cqw-3.5rem)/3)] sm:min-w-28",
  );

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
    <div className="flex border-b border-border bg-background">
      <div className="sticky left-0 z-10 w-14 shrink-0 bg-background" />
      {loading
        ? Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className={cn("flex h-11 flex-1 items-center gap-2 border-l border-border px-3", colMin(view))}
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
    <div className={cn("flex h-11 flex-1 items-center gap-2 border-l border-border px-3", className)}>
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-white"
        style={{ backgroundColor: resource.color }}
      >
        <ResourceKindIcon kind={resource.kind} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{resource.name}</span>
      <span className="tnum shrink-0 text-xs text-muted-foreground">
        {/* Deactivated, but shown for the bookings it still has that day. */}
        {!resource.isActive ? `Inactive · ${count} booked` : off ? "Not working" : `${count} booked`}
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
        "flex h-11 flex-1 items-center gap-1.5 border-l border-border px-2 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        className,
      )}
    >
      <span
        className={cn(
          "tnum flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          isToday ? "bg-brand text-brand-foreground" : "text-foreground",
        )}
      >
        {Number(date.slice(8))}
      </span>
      <span className={cn("text-sm font-medium", isToday ? "text-brand" : "text-muted-foreground")}>
        {fmt.date(date, "weekday")}
      </span>
      {count > 0 && (
        <span className="tnum ml-auto text-xs whitespace-nowrap text-muted-foreground @max-[30rem]:hidden">
          {count} booked
        </span>
      )}
    </button>
  );
}
