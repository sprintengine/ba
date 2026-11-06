"use client";

import type { Resource } from "@/lib/api/types";
import type { CalendarMode } from "@/lib/dashboard/calendar";
import type { PlainDate } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceKindIcon, resourceTile, useFmt } from "../common";
import type { CalendarColumn, ColumnOff } from "./use-calendar-data";

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
        : columns.map((c, i) =>
            c.resource ? (
              <ResourceHeader
                key={c.key}
                resource={c.resource}
                count={shownCount(c)}
                off={c.off}
                position={columns.length > 1 ? `${i + 1} of ${columns.length}` : null}
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

const OFF_LABEL: Record<ColumnOff, string> = {
  closed: "Closed",
  "time-off": "Time off",
  "not-working": "Not working",
};

/** What the header says beside the name; bookings that remain on a day off are still counted. */
function columnNote(resource: Resource, count: number, off: ColumnOff | null): string {
  if (!resource.isActive) return `Inactive · ${count} booked`;
  if (!off) return `${count} booked`;
  return count > 0 ? `${OFF_LABEL[off]} · ${count} booked` : OFF_LABEL[off];
}

function ResourceHeader({
  resource,
  count,
  off,
  position,
  className,
}: {
  resource: Resource;
  count: number;
  off: ColumnOff | null;
  /** "1 of 4": a phone shows one column at a time, so it says there are more. */
  position: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex h-11 flex-1 items-center gap-2 border-l border-border px-3", className)}>
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md"
        style={resourceTile(resource.color)}
      >
        <ResourceKindIcon kind={resource.kind} className="size-3.5" />
      </span>
      <span className="min-w-0 truncate text-sm font-semibold">{resource.name}</span>
      {position && <span className="tnum shrink-0 text-xs text-muted-foreground sm:hidden">{position}</span>}
      <span
        data-tally="column"
        className="tnum ml-auto shrink-0 text-xs text-muted-foreground transition-opacity"
      >
        {columnNote(resource, count, off)}
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
      <span className="flex min-w-0 flex-col">
        <span
          className={cn("text-sm leading-5 font-medium", isToday ? "text-brand" : "text-muted-foreground")}
        >
          {fmt.date(date, "weekday")}
        </span>
        <span
          data-tally="column"
          className="tnum text-xs leading-4 whitespace-nowrap text-muted-foreground transition-opacity"
        >
          {count > 0 ? `${count} booked` : "\u00a0"}
        </span>
      </span>
    </button>
  );
}
