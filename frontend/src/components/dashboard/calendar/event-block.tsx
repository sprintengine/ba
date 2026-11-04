"use client";

import type { Booking } from "@/lib/api/types";
import { eventAppearance } from "@/lib/dashboard/calendar";
import { cn } from "@/lib/utils";
import type { PositionedEvent } from "@/lib/dashboard/calendar-layout";
import { PX_PER_MIN } from "./grid-scale";

const TONE_DOT = {
  neutral: "bg-subtle-foreground",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
} as const;

const TONE_BORDER = {
  neutral: "border-border-strong",
  brand: "border-brand-border",
  success: "border-success-border",
  warning: "border-warning",
  danger: "border-danger-border",
  info: "border-info",
} as const;

const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--border-strong) 80%, transparent) 0 1px, transparent 1px 5px)";

type Position = { left: string; width: string };

/** A booking on the grid: its buffers (hatched), and the event itself, clipped to the visible hours. */
export function EventBlock({
  p,
  top,
  startHour,
  endHour,
  compact,
  formatTime,
  onSelect,
}: {
  p: PositionedEvent<Booking>;
  top: (m: number) => number;
  startHour: number;
  endHour: number;
  compact?: boolean;
  formatTime: (iso: string) => string;
  onSelect: (id: string) => void;
}) {
  const b = p.item;
  const lo = startHour * 60;
  const hi = endHour * 60;
  const s = Math.max(p.startMin, lo);
  const e = Math.min(p.endMin, hi);
  if (e <= lo || s >= hi) return null;
  const h = Math.max((e - s) * PX_PER_MIN - 2, 18);
  const width = 100 / p.lanes;
  const pos: Position = { left: `calc(${p.lane * width}% + 2px)`, width: `calc(${width}% - 4px)` };
  const bufferBefore = Math.max(p.blockStartMin, lo);
  const bufferAfter = Math.min(p.blockEndMin, hi);

  return (
    <>
      {p.blockStartMin < p.startMin && (
        <BufferHatch pos={pos} top={top(bufferBefore)} height={(s - bufferBefore) * PX_PER_MIN} edge="top" />
      )}
      {p.blockEndMin > p.endMin && (
        <BufferHatch pos={pos} top={top(e)} height={(bufferAfter - e) * PX_PER_MIN} edge="bottom" />
      )}
      <EventButton
        booking={b}
        pos={pos}
        top={top(s) + 1}
        height={h}
        compact={compact}
        formatTime={formatTime}
        onSelect={onSelect}
      />
    </>
  );
}

/** Preparation time blocked before or after a booking. */
function BufferHatch({
  pos,
  top,
  height,
  edge,
}: {
  pos: Position;
  top: number;
  height: number;
  edge: "top" | "bottom";
}) {
  return (
    <div
      aria-hidden
      className={cn("absolute opacity-70", edge === "top" ? "rounded-t-md" : "rounded-b-md")}
      style={{ ...pos, top, height, backgroundImage: HATCH }}
    />
  );
}

function EventButton({
  booking: b,
  pos,
  top,
  height: h,
  compact,
  formatTime,
  onSelect,
}: {
  booking: Booking;
  pos: Position;
  top: number;
  height: number;
  compact?: boolean;
  formatTime: (iso: string) => string;
  onSelect: (id: string) => void;
}) {
  const look = eventAppearance(b.status);
  const short = h < 40;
  return (
    <button
      type="button"
      data-event=""
      onClick={() => onSelect(b.id)}
      title={`${formatTime(b.start)}–${formatTime(b.end)} · ${b.customer.name} · ${b.service.name} · ${look.label}`}
      className={cn(
        "group @container absolute z-[5] flex overflow-hidden rounded-md border text-left shadow-xs transition-[box-shadow,transform] outline-none hover:z-30 hover:shadow-md focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-ring",
        look.tentative ? cn("border-dashed", TONE_BORDER[look.tone]) : "border-black/5 dark:border-white/10",
        look.inactive && "opacity-55",
      )}
      style={{
        ...pos,
        top,
        height: h,
        backgroundColor: `color-mix(in oklab, ${b.service.color} ${look.inactive ? 6 : 14}%, var(--surface))`,
      }}
    >
      <span aria-hidden className="w-[3px] shrink-0" style={{ backgroundColor: b.service.color }} />
      <span className={cn("flex min-w-0 flex-1 gap-x-1.5 px-1.5", short ? "items-center" : "flex-col py-1")}>
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-xs leading-4 font-semibold text-foreground",
            // Clear of the status dot in the corner.
            look.showDot ? "pr-3" : "pr-1",
            look.inactive && "line-through decoration-foreground/40",
          )}
        >
          {/* In a narrow block (a phone's week view, overlapping lanes) the name matters more: the block's place on
              the grid gives the time. */}
          {short && (
            <span className="tnum shrink-0 font-medium text-muted-foreground @max-[8rem]:sr-only">
              {formatTime(b.start)}
            </span>
          )}
          <span className="truncate">{b.customer.name}</span>
        </span>
        {!short && (
          <span className="truncate text-2xs leading-4 text-muted-foreground">
            <span className="tnum">
              {formatTime(b.start)}–{formatTime(b.end)}
            </span>
            {!compact && ` · ${b.service.name}${b.option ? ` (${b.option.name})` : ""}`}
          </span>
        )}
        {compact && h >= 58 && (
          <span className="truncate text-2xs leading-4 text-muted-foreground">{b.service.name}</span>
        )}
      </span>
      <span
        className={cn(
          "absolute top-1.5 right-1.5 size-1.5 rounded-full",
          TONE_DOT[look.tone],
          !look.showDot && "opacity-0",
        )}
        aria-hidden
      />
      <span className="sr-only">{look.label}</span>
    </button>
  );
}
