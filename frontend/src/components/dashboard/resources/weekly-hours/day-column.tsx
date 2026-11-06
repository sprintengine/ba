"use client";

import { useRef, useState } from "react";
import { Users } from "lucide-react";
import type { CustomerGroup, DayOfWeek } from "@/lib/api/types";
import {
  moveRangeEdge,
  rangeAt,
  TIMELINE_STEP,
  validateDay,
  type TimeRange,
} from "@/lib/availability/weekly-hours";
import { endMinutes } from "@/lib/availability/windows";
import { timeToMinutes } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DayEditor } from "./day-editor";

export type Axis = { start: number; end: number };

/** What's different on one date of the week on show: drawn over the regular hours, and listed under them. */
export type DayException = { kind: "off" | "partial" | "extra"; start: number; end: number };

/** An hour on the grid: small enough to show a working day whole, to scale, like the calendar. */
export const HOUR_PX = 17;

/** Hours in a calendar's colour: as fill only, the tint its tile and bookings use. */
export const hoursFill = (color: string): React.CSSProperties => ({
  backgroundColor: `color-mix(in oklab, ${color} var(--event-tint), var(--event-base))`,
});

const HATCH = "repeating-linear-gradient(135deg, var(--border-strong) 0 1px, transparent 1px 5px)";

const summary = (ranges: readonly TimeRange[]) =>
  ranges.length === 0 ? "Closed" : ranges.map((r) => `${r.startTime}–${r.endTime}`).join(", ");

/** Tall enough for a time at each end, clear of the grips; otherwise the bar shows its start alone, or nothing. */
const BOTH_TIMES_PX = 46;
const ONE_TIME_PX = 22;

/**
 * One weekday as a column of the week, on the calendar's hours. Each bar carries its own times, as a calendar card does,
 * so there's no row of numbers to read across. The day's name opens its editor, which is all you need by keyboard or
 * touch; on the grid a bar opens it too, its ends drag (or step with the arrow keys) by a quarter hour, and clicking a
 * free part of the day adds a stretch.
 */
export function DayColumn({
  day,
  label,
  short,
  date,
  today,
  ranges,
  exceptions,
  axis,
  groups,
  editable,
  color,
  onChange,
  onCopy,
}: {
  day: DayOfWeek;
  label: string;
  short: string;
  /** The day of the month, on a dated week. */
  date?: number;
  today?: boolean;
  ranges: TimeRange[];
  exceptions: DayException[];
  axis: Axis;
  groups: CustomerGroup[];
  editable: boolean;
  color?: string;
  onChange: (ranges: TimeRange[]) => void;
  onCopy: (targets: DayOfWeek[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const errors = validateDay(ranges);
  const firstError = errors.find(Boolean);
  const closed = ranges.length === 0;
  const heading = (
    <span
      className={cn(
        "flex items-center gap-x-1 text-sm font-medium max-sm:flex-col",
        closed && "text-muted-foreground",
      )}
    >
      <span aria-hidden>{short}</span>
      {date !== undefined && (
        <span
          aria-hidden
          className={cn(
            "tnum flex size-5 items-center justify-center rounded-full text-xs",
            today ? "bg-brand font-semibold text-brand-foreground" : "font-normal text-muted-foreground",
          )}
        >
          {date}
        </span>
      )}
    </span>
  );
  return (
    <div role="group" aria-label={label} className="contents" data-day={day}>
      <div className="flex min-w-0 flex-col items-center pb-1 text-center">
        {editable ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                size="xs"
                variant="ghost"
                aria-label={`Edit ${label}: ${summary(ranges)}`}
                className="h-auto min-h-7 max-w-full px-1 py-0.5 text-foreground"
              >
                {heading}
                <span className="sr-only">{summary(ranges)}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="center"
              aria-label={`${label} hours`}
              className="w-[22rem] max-w-[calc(100vw-2rem)]"
            >
              <DayEditor label={label} ranges={ranges} groups={groups} onChange={onChange} onCopy={onCopy} />
            </PopoverContent>
          </Popover>
        ) : (
          <>
            <span className="py-0.5">{heading}</span>
            <span className="sr-only">{summary(ranges)}</span>
          </>
        )}
      </div>
      <Track
        label={label}
        ranges={ranges}
        exceptions={exceptions}
        errors={errors}
        axis={axis}
        editable={editable}
        color={color}
        onChange={onChange}
        onOpen={() => setOpen(true)}
      />
      {firstError && (
        <p
          role="alert"
          style={{ gridRow: 3, gridColumn: "2 / -1" }}
          className="pt-1 text-xs font-medium text-danger-soft-foreground"
        >
          {label}: {firstError}
        </p>
      )}
    </div>
  );
}

function Track({
  label,
  ranges,
  exceptions,
  errors,
  axis,
  editable,
  color,
  onChange,
  onOpen,
}: {
  label: string;
  ranges: TimeRange[];
  exceptions: DayException[];
  errors: (string | null)[];
  axis: Axis;
  editable: boolean;
  color?: string;
  onChange: (ranges: TimeRange[]) => void;
  onOpen: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const span = axis.end - axis.start;
  const percent = (minute: number) => ((minute - axis.start) / span) * 100;
  const minuteAt = (clientY: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return axis.start;
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return axis.start + ratio * span;
  };
  const hours = Array.from({ length: Math.floor(span / 60) + 1 }, (_, i) => i);
  return (
    // A pointer shortcut for what the day's editor does, hence exempt from the touch-size rule: the times above it
    // open that editor at full size, and keyboard users have them too.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={track}
      data-touch-exempt
      style={{ height: (span / 60) * HOUR_PX, gridRow: 2 }}
      className={cn(
        "relative min-w-0 overflow-hidden border-l border-border-subtle bg-surface-sunken first-of-type:border-l-0",
        editable && "cursor-copy",
      )}
      onClick={(e) => {
        if (!editable || (e.target as HTMLElement).closest("[data-range]")) return;
        const added = rangeAt(ranges, minuteAt(e.clientY));
        if (added) onChange([...ranges, added]);
      }}
    >
      {hours.map((i) => (
        <span
          key={i}
          aria-hidden
          className="absolute inset-x-0 h-px bg-border-subtle"
          style={{ top: `${(i * 60 * 100) / span}%` }}
        />
      ))}
      {ranges.length === 0 && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-2 text-center text-2xs font-medium text-muted-foreground"
        >
          Closed
        </span>
      )}
      {ranges.map((r, i) => {
        const start = timeToMinutes(r.startTime);
        const end = endMinutes(r.endTime);
        const time = `${r.startTime}–${r.endTime}`;
        const invalid = !!errors[i] || end <= start;
        const restricted = r.audienceGroupIds.length > 0;
        const style = {
          top: `${Math.max(0, percent(start))}%`,
          height: `${Math.max(0, percent(Math.max(end, start)) - Math.max(0, percent(start)))}%`,
        };
        const px = ((end - start) / 60) * HOUR_PX;
        const body = (
          <>
            {px >= ONE_TIME_PX && <span>{r.startTime}</span>}
            {restricted && <Users aria-hidden className="size-3 shrink-0" />}
            {px >= BOTH_TIMES_PX && <span>{r.endTime}</span>}
          </>
        );
        const look = cn(
          "flex h-full w-full min-w-0 flex-col items-center gap-1 overflow-hidden rounded-[inherit] border py-2 text-2xs leading-3.5 font-medium",
          px >= BOTH_TIMES_PX ? "justify-between" : "justify-center py-0",
          invalid
            ? "border-danger-border bg-danger-soft text-danger-soft-foreground"
            : color
              ? "border-transparent text-foreground"
              : "border-transparent bg-foreground/16 text-foreground dark:bg-foreground/22",
        );
        // The same fill as this calendar's tile, so the bar reads as this person's time, not as a disabled control.
        const fill = !invalid && color ? hoursFill(color) : undefined;
        return (
          <div
            key={i}
            data-range=""
            className="group/bar absolute inset-x-0.5 rounded-md bg-surface"
            style={style}
          >
            {editable ? (
              <>
                <button
                  type="button"
                  aria-label={`Edit ${label} ${time}`}
                  onClick={onOpen}
                  style={fill}
                  className={cn(
                    look,
                    "tnum cursor-pointer transition-colors outline-none hover:border-brand focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  {body}
                </button>
                <EdgeHandle
                  edge="start"
                  label={`${label} ${time} start`}
                  minute={start}
                  time={r.startTime}
                  axis={axis}
                  onMove={(m) => onChange(moveRangeEdge(ranges, i, "start", m))}
                  minuteAt={minuteAt}
                />
                <EdgeHandle
                  edge="end"
                  label={`${label} ${time} end`}
                  minute={end}
                  time={r.endTime}
                  axis={axis}
                  onMove={(m) => onChange(moveRangeEdge(ranges, i, "end", m))}
                  minuteAt={minuteAt}
                />
              </>
            ) : (
              <span className={cn(look, "tnum")} style={fill}>
                {body}
              </span>
            )}
          </div>
        );
      })}
      {exceptions.map((x, i) => (
        <span
          key={i}
          aria-hidden
          data-exception={x.kind}
          className={cn(
            "pointer-events-none absolute inset-x-0.5 rounded-md",
            x.kind === "extra" ? "border border-dashed border-success" : "bg-surface/60",
          )}
          style={{
            top: `${Math.max(0, percent(x.start))}%`,
            height: `${Math.min(100, percent(x.end)) - Math.max(0, percent(x.start))}%`,
            ...(x.kind === "extra" ? {} : { backgroundImage: HATCH }),
          }}
        />
      ))}
    </div>
  );
}

/** A bar's start or end: drag it, or step it by a quarter hour with the arrow keys. */
function EdgeHandle({
  edge,
  label,
  minute,
  time,
  axis,
  onMove,
  minuteAt,
}: {
  edge: "start" | "end";
  label: string;
  minute: number;
  time: string;
  axis: Axis;
  onMove: (minute: number) => void;
  minuteAt: (clientY: number) => number;
}) {
  const dragging = useRef(false);
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={1439}
      aria-valuenow={Math.min(minute, 1439)}
      aria-valuetext={time}
      className={cn(
        "group/edge absolute inset-x-0 h-2.5 cursor-ns-resize rounded-sm outline-none hover:bg-brand/40 focus-visible:bg-brand/60 focus-visible:ring-2 focus-visible:ring-ring",
        edge === "start" ? "top-0" : "bottom-0",
      )}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        // Stays on the axis while dragging, so the day doesn't rescale under the pointer.
        onMove(Math.min(axis.end, Math.max(axis.start, minuteAt(e.clientY))));
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onKeyDown={(e) => {
        const delta = e.key === "ArrowUp" ? -TIMELINE_STEP : e.key === "ArrowDown" ? TIMELINE_STEP : 0;
        if (delta === 0) return;
        e.preventDefault();
        onMove(minute + delta);
      }}
    >
      {/* The grip: shows on the bar under the pointer or the keyboard, and always on a touch screen. */}
      <span
        aria-hidden
        className="absolute inset-x-[35%] top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface opacity-0 shadow-[0_0_0_1px_var(--border-strong)] transition-opacity group-focus-within/bar:opacity-100 group-hover/bar:opacity-100 group-hover/edge:bg-brand pointer-coarse:opacity-100"
      />
    </div>
  );
}
