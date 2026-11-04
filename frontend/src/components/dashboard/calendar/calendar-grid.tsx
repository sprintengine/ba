"use client";

import { memo, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { minutesToTime, type PlainDate } from "@/lib/format/datetime";
import { layoutDay, snapMinute, type MinuteInterval } from "@/lib/dashboard/calendar-layout";
import { EventBlock } from "./event-block";
import { HOUR_PX, PX_PER_MIN } from "./grid-scale";

/** Hour labels down the left edge. */
export function TimeGutter({
  startHour,
  endHour,
  formatHour,
}: {
  startHour: number;
  endHour: number;
  formatHour: (h: number) => string;
}) {
  return (
    <div className="relative w-14 shrink-0" style={{ height: (endHour - startHour) * HOUR_PX }} aria-hidden>
      {Array.from({ length: endHour - startHour }, (_, i) => (
        <span
          key={i}
          className="tnum absolute right-2 -translate-y-1/2 text-2xs font-medium text-subtle-foreground"
          style={{ top: i * HOUR_PX }}
        >
          {i === 0 ? "" : formatHour(startHour + i)}
        </span>
      ))}
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
  const positioned = useMemo(() => layoutDay(bookings, date, timeZone), [bookings, date, timeZone]);
  const [hover, setHover] = useState<number | null>(null);
  const top = (m: number) => (m - startHour * 60) * PX_PER_MIN;
  const height = (endHour - startHour) * HOUR_PX;

  return (
    // Click-to-create on an empty slot is a pointer shortcut; keyboard users create bookings with the
    // "New booking" button, which opens the same sheet.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group"
      aria-label={label}
      className="relative min-w-0 flex-1 border-l border-border bg-muted/70 dark:bg-background"
      style={{ height }}
      onMouseMove={(e) => {
        if (!onCreate || (e.target as HTMLElement).closest("[data-event]")) return setHover(null);
        const rect = e.currentTarget.getBoundingClientRect();
        setHover(snapMinute(e.clientY - rect.top, PX_PER_MIN, startHour * 60));
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        if (!onCreate || (e.target as HTMLElement).closest("[data-event]")) return;
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

      {positioned.map((p) => (
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

      {nowMinute !== null && nowMinute >= startHour * 60 && nowMinute <= endHour * 60 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-20"
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
