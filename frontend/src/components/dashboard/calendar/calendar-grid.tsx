"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { minutesToTime, type PlainDate } from "@/lib/format/datetime";
import {
  capLanes,
  groupSessions,
  layoutDay,
  snapMinute,
  type MinuteInterval,
} from "@/lib/dashboard/calendar-layout";
import { cn } from "@/lib/utils";
import { EventBlock, OverflowMarker } from "./event-block";
import { HOUR_PX, PX_PER_MIN } from "./grid-scale";

/** Hour labels down the left edge, and the current time where the now line crosses it. */
export function TimeGutter({
  startHour,
  endHour,
  formatHour,
  nowMinute = null,
}: {
  startHour: number;
  endHour: number;
  formatHour: (h: number) => string;
  /** Shown as a label on the gutter when today is on screen. */
  nowMinute?: number | null;
}) {
  const showNow = nowMinute !== null && nowMinute >= startHour * 60 && nowMinute <= endHour * 60;
  const nowTop = showNow ? (nowMinute - startHour * 60) * PX_PER_MIN : 0;
  return (
    <div className="relative w-14 shrink-0" style={{ height: (endHour - startHour) * HOUR_PX }} aria-hidden>
      {Array.from({ length: endHour - startHour }, (_, i) => (
        <span
          key={i}
          className={cn(
            "tnum absolute right-2 -translate-y-1/2 text-2xs font-medium text-subtle-foreground",
            // The now label takes the place of an hour label it would touch.
            showNow && Math.abs(i * HOUR_PX - nowTop) < 12 && "invisible",
          )}
          style={{ top: i * HOUR_PX }}
        >
          {i === 0 ? "" : formatHour(startHour + i)}
        </span>
      ))}
      {showNow && (
        <span
          className="tnum absolute right-1 -translate-y-1/2 rounded-full bg-danger px-1.5 text-2xs leading-4 font-semibold text-danger-foreground"
          style={{ top: nowTop }}
        >
          {minutesToTime(nowMinute)}
        </span>
      )}
    </div>
  );
}

/** Horizontal hour and quarter-hour lines, drawn once behind all columns. */
function GridLines({ startHour, endHour }: { startHour: number; endHour: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `linear-gradient(to bottom, var(--border) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border-subtle) 70%, transparent) 1px, transparent 1px)`,
        backgroundSize: `100% ${HOUR_PX}px, 100% ${HOUR_PX / 2}px`,
        height: (endHour - startHour) * HOUR_PX,
      }}
    />
  );
}

/** On the column's free space: not a booking, and not a popover opened from one (React bubbles through portals). */
const onEmptyGrid = (e: React.MouseEvent<HTMLElement>) => {
  const target = e.target as HTMLElement;
  return e.currentTarget.contains(target) && !target.closest("[data-event]");
};

/** The narrowest a block may get before overlapping bookings fold into "+N" (day view, week view). */
const MIN_LANE_PX = 72;
const MIN_LANE_PX_WEEK = 72;

type ColumnProps = {
  date: PlainDate;
  timeZone: string;
  bookings: Booking[];
  open: MinuteInterval[];
  startHour: number;
  endHour: number;
  /** Wall-clock minute for the now line (only when the column is today). */
  nowMinute: number | null;
  compact?: boolean;
  formatTime: (iso: string) => string;
  onSelectBooking: (id: string) => void;
  /** Called with the column's `resourceId`, so one stable handler serves every column (and `memo` holds). */
  onCreate?: (date: PlainDate, minute: number, resourceId: string | undefined) => void;
  /** The column's resource in day view. */
  resourceId?: string;
  label: string;
};

/**
 * One day column (for one resource or one day of the week): closed-hours
 * shading, positioned events with buffers, overlap lanes, now line and a
 * hover "+ time" affordance to create a booking.
 */
export const DayColumn = memo(function DayColumn({
  date,
  timeZone,
  bookings,
  open,
  startHour,
  endHour,
  nowMinute,
  compact,
  formatTime,
  onSelectBooking,
  onCreate,
  resourceId,
  label,
}: ColumnProps) {
  const positioned = useMemo(
    () => layoutDay(groupSessions(bookings), date, timeZone),
    [bookings, date, timeZone],
  );
  // How many blocks fit side by side: past that, overlapping bookings fold into a "+N" marker.
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const maxLanes =
    width > 0 ? Math.max(1, Math.floor(width / (compact ? MIN_LANE_PX_WEEK : MIN_LANE_PX))) : Infinity;
  const { shown, overflow } = useMemo(() => capLanes(positioned, maxLanes), [positioned, maxLanes]);
  const [hover, setHover] = useState<number | null>(null);
  const top = (m: number) => (m - startHour * 60) * PX_PER_MIN;
  const height = (endHour - startHour) * HOUR_PX;

  return (
    // Click-to-create on an empty slot is a pointer shortcut; keyboard users create bookings with the
    // "New booking" button, which opens the same sheet.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className="relative min-w-0 flex-1 border-l border-border bg-muted/70 dark:bg-background"
      style={{ height }}
      onMouseMove={(e) => {
        if (!onCreate || !onEmptyGrid(e)) return setHover(null);
        const rect = e.currentTarget.getBoundingClientRect();
        setHover(snapMinute(e.clientY - rect.top, PX_PER_MIN, startHour * 60));
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        if (!onCreate || !onEmptyGrid(e)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onCreate(date, snapMinute(e.clientY - rect.top, PX_PER_MIN, startHour * 60), resourceId);
      }}
    >
      {/* Open hours are "paper"; closed time stays sunken. */}
      {open.map((i) => {
        const s = Math.max(i.start, startHour * 60);
        const e = Math.min(i.end, endHour * 60);
        if (e <= s) return null;
        return (
          <div
            key={`${i.start}-${i.end}`}
            aria-hidden
            className="absolute inset-x-0 bg-surface dark:bg-surface-raised"
            style={{ top: top(s), height: (e - s) * PX_PER_MIN }}
          />
        );
      })}
      <GridLines startHour={startHour} endHour={endHour} />

      {hover !== null && onCreate && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1 z-10 flex items-center gap-1 rounded-md border border-dashed border-brand-border bg-brand-soft/60 px-1.5 text-2xs font-medium text-brand-soft-foreground"
          style={{ top: top(hover), height: 15 * PX_PER_MIN * 2 - 2 }}
        >
          <Plus className="size-3" /> <span className="tnum">{minutesToTime(hover)}</span>
        </div>
      )}

      {shown.map((p) => (
        <EventBlock
          key={p.item.id}
          p={p}
          top={top}
          startHour={startHour}
          endHour={endHour}
          compact={compact}
          formatTime={formatTime}
          onSelect={onSelectBooking}
        />
      ))}
      {overflow.map((o) => (
        <OverflowMarker
          key={`${o.startMin}-${o.events[0].item.id}`}
          overflow={o}
          top={top}
          startHour={startHour}
          endHour={endHour}
          formatTime={formatTime}
          onSelect={onSelectBooking}
        />
      ))}

      {nowMinute !== null && nowMinute >= startHour * 60 && nowMinute <= endHour * 60 && (
        <div
          aria-hidden
          // Under the bookings (they are opaque), over the grid: the line shows in the gaps and never crosses text.
          className="pointer-events-none absolute inset-x-0 z-[4]"
          style={{ top: top(nowMinute) }}
        >
          <div className="relative h-px bg-danger">
            <span className="absolute -top-[3.5px] -left-1 size-2 rounded-full bg-danger" />
          </div>
        </div>
      )}
    </div>
  );
});
