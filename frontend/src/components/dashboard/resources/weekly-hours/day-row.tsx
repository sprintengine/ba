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

/** Day, timeline, times: on phones the times sit beside the day, with the timeline full width below. */
export const ROW_GRID =
  "grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[3rem_minmax(0,1fr)_10rem]";

const summary = (ranges: readonly TimeRange[]) =>
  ranges.length === 0 ? "Closed" : ranges.map((r) => `${r.startTime}–${r.endTime}`).join(", ");

/** Each stretch on its own line, so a split day never breaks a time in two. */
const Times = ({ ranges }: { ranges: readonly TimeRange[] }) =>
  ranges.length === 0
    ? "Closed"
    : ranges.map((r) => (
        <span key={r.startTime} className="block whitespace-nowrap">
          {r.startTime}–{r.endTime}
        </span>
      ));

/**
 * One weekday on the shared time axis: a bar per working stretch, its times in words beside it. The times open the
 * day's editor, which is all you need by keyboard or touch; on the timeline a bar opens it too, its edges drag (or
 * step with the arrow keys) by a quarter hour, and clicking a free part of the day adds a stretch.
 */
export function DayRow({
  day,
  label,
  short,
  ranges,
  axis,
  groups,
  editable,
  onChange,
  onCopy,
}: {
  day: DayOfWeek;
  label: string;
  short: string;
  ranges: TimeRange[];
  axis: Axis;
  groups: CustomerGroup[];
  editable: boolean;
  onChange: (ranges: TimeRange[]) => void;
  onCopy: (targets: DayOfWeek[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const errors = validateDay(ranges);
  const firstError = errors.find(Boolean);
  const closed = ranges.length === 0;
  return (
    <div role="group" aria-label={label} className={cn(ROW_GRID, "gap-y-1 py-1")} data-day={day}>
      <span className={cn("text-sm font-medium", closed && "text-muted-foreground")}>
        <span aria-hidden>{short}</span>
      </span>
      <Timeline
        label={label}
        ranges={ranges}
        errors={errors}
        axis={axis}
        editable={editable}
        onChange={onChange}
        onOpen={() => setOpen(true)}
      />
      {editable ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Edit ${label}: ${summary(ranges)}`}
              className={cn(
                "tnum h-auto min-h-8 justify-start px-2 py-1 text-left font-normal whitespace-normal max-sm:col-start-2 max-sm:row-start-1 sm:justify-end sm:text-right",
                closed && "text-muted-foreground",
              )}
            >
              <span>
                <Times ranges={ranges} />
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            aria-label={`${label} hours`}
            className="w-[22rem] max-w-[calc(100vw-2rem)]"
          >
            <DayEditor label={label} ranges={ranges} groups={groups} onChange={onChange} onCopy={onCopy} />
          </PopoverContent>
        </Popover>
      ) : (
        <span
          className={cn(
            "tnum text-sm max-sm:col-start-2 max-sm:row-start-1 sm:text-right",
            closed && "text-muted-foreground",
          )}
        >
          <Times ranges={ranges} />
        </span>
      )}
      {firstError && (
        <p role="alert" className="col-span-full text-xs font-medium text-danger-soft-foreground">
          {firstError}
        </p>
      )}
    </div>
  );
}

function Timeline({
  label,
  ranges,
  errors,
  axis,
  editable,
  onChange,
  onOpen,
}: {
  label: string;
  ranges: TimeRange[];
  errors: (string | null)[];
  axis: Axis;
  editable: boolean;
  onChange: (ranges: TimeRange[]) => void;
  onOpen: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const span = axis.end - axis.start;
  const percent = (minute: number) => ((minute - axis.start) / span) * 100;
  const minuteAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return axis.start;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return axis.start + ratio * span;
  };
  const hours = Array.from({ length: Math.floor(span / 60) + 1 }, (_, i) => i);
  return (
    // A pointer shortcut for what the day's editor does, hence exempt from the touch-size rule: the times beside it
    // open that editor at full size, and keyboard users have them too.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={track}
      data-touch-exempt
      className={cn(
        "relative h-7 overflow-hidden rounded-md bg-muted ring-1 ring-border-subtle ring-inset max-sm:col-span-full max-sm:row-start-2",
        editable && "cursor-copy",
      )}
      onClick={(e) => {
        if (!editable || (e.target as HTMLElement).closest("[data-range]")) return;
        const added = rangeAt(ranges, minuteAt(e.clientX));
        if (added) onChange([...ranges, added]);
      }}
    >
      {hours.map((i) => (
        <span
          key={i}
          aria-hidden
          className="absolute inset-y-0 w-px bg-border-subtle"
          style={{ left: `${(i * 60 * 100) / span}%` }}
        />
      ))}
      {ranges.map((r, i) => {
        const start = timeToMinutes(r.startTime);
        const end = endMinutes(r.endTime);
        const time = `${r.startTime}–${r.endTime}`;
        const invalid = !!errors[i] || end <= start;
        const restricted = r.audienceGroupIds.length > 0;
        const style = {
          left: `${Math.max(0, percent(start))}%`,
          width: `${Math.max(0, percent(Math.max(end, start)) - Math.max(0, percent(start)))}%`,
        };
        // The times are in words beside the timeline: the bar is the shape, marked only when it's restricted.
        const body = restricted ? <Users aria-hidden className="size-3 shrink-0" /> : null;
        const look = cn(
          "flex h-full w-full min-w-0 items-center justify-center gap-1 overflow-hidden rounded-[inherit] border px-2 text-2xs font-medium",
          invalid
            ? "border-danger-border bg-danger-soft text-danger-soft-foreground"
            : "border-transparent bg-foreground/16 text-foreground dark:bg-foreground/22",
        );
        return (
          <div key={i} data-range="" className="absolute inset-y-0.5 rounded-sm bg-surface" style={style}>
            {editable ? (
              <>
                <button
                  type="button"
                  aria-label={`Edit ${label} ${time}`}
                  onClick={onOpen}
                  className={cn(
                    look,
                    "tnum cursor-pointer transition-colors outline-none hover:border-brand hover:bg-brand/25 focus-visible:ring-2 focus-visible:ring-ring",
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
              <span className={cn(look, "tnum")}>{body}</span>
            )}
          </div>
        );
      })}
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
  minuteAt: (clientX: number) => number;
}) {
  const dragging = useRef(false);
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={1439}
      aria-valuenow={Math.min(minute, 1439)}
      aria-valuetext={time}
      className={cn(
        "group/edge absolute inset-y-0 w-2.5 cursor-ew-resize rounded-sm outline-none hover:bg-brand/40 focus-visible:bg-brand/60 focus-visible:ring-2 focus-visible:ring-ring",
        edge === "start" ? "left-0" : "right-0",
      )}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        // Stays on the axis while dragging, so the day doesn't rescale under the pointer.
        onMove(Math.min(axis.end, Math.max(axis.start, minuteAt(e.clientX))));
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onKeyDown={(e) => {
        const delta = e.key === "ArrowLeft" ? -TIMELINE_STEP : e.key === "ArrowRight" ? TIMELINE_STEP : 0;
        if (delta === 0) return;
        e.preventDefault();
        onMove(minute + delta);
      }}
    >
      {/* The grip: a bar's ends show they can be moved before anyone hovers. */}
      <span
        aria-hidden
        className="absolute inset-y-1.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-foreground/35 group-hover/edge:bg-brand"
      />
    </div>
  );
}
