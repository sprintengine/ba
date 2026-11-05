"use client";

import type { Booking } from "@/lib/api/types";
import { eventAppearance } from "@/lib/dashboard/calendar";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import type { LaneOverflow, PositionedEvent, SessionEntry } from "@/lib/dashboard/calendar-layout";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PX_PER_MIN } from "./grid-scale";

export type CalendarEvent = PositionedEvent<SessionEntry<Booking>>;

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

const lanePosition = (lane: number, lanes: number): Position => {
  const width = 100 / lanes;
  return { left: `calc(${lane * width}% + 2px)`, width: `calc(${width}% - 4px)` };
};

/** A booking (or a session of several) on the grid: its buffers (hatched), and the block, clipped to the visible hours. */
export function EventBlock({
  p,
  top,
  startHour,
  endHour,
  compact,
  formatTime,
  onSelect,
}: {
  p: CalendarEvent;
  top: (m: number) => number;
  startHour: number;
  endHour: number;
  compact?: boolean;
  formatTime: (iso: string) => string;
  onSelect: (id: string) => void;
}) {
  const entry = p.item;
  const lo = startHour * 60;
  const hi = endHour * 60;
  const s = Math.max(p.startMin, lo);
  const e = Math.min(p.endMin, hi);
  if (e <= lo || s >= hi) return null;
  const h = Math.max((e - s) * PX_PER_MIN - 2, 18);
  const pos = lanePosition(p.lane, p.lanes);
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
      {entry.bookings.length === 1 ? (
        <EventButton
          booking={entry.bookings[0]}
          pos={pos}
          top={top(s) + 1}
          height={h}
          compact={compact}
          formatTime={formatTime}
          onSelect={onSelect}
        />
      ) : (
        <SessionButton
          bookings={entry.bookings}
          pos={pos}
          top={top(s) + 1}
          height={h}
          formatTime={formatTime}
          onSelect={onSelect}
        />
      )}
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
          <span className={cn(h >= 56 && !compact ? "line-clamp-2 break-words" : "truncate")}>
            {b.customer.name}
          </span>
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

/** Several bookings of one session (a class): one block with the count; it opens the list of who is booked. */
function SessionButton({
  bookings,
  pos,
  top,
  height: h,
  formatTime,
  onSelect,
}: {
  bookings: [Booking, ...Booking[]];
  pos: Position;
  top: number;
  height: number;
  formatTime: (iso: string) => string;
  onSelect: (id: string) => void;
}) {
  const { v } = useVocabulary();
  const first = bookings[0];
  const active = bookings.filter((b) => !eventAppearance(b.status).inactive);
  const waiting = bookings.some((b) => eventAppearance(b.status).tentative);
  const short = h < 40;
  const time = `${formatTime(first.start)}–${formatTime(first.end)}`;
  const count = `${active.length} booked`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-event=""
          aria-label={`${first.service.name}, ${time}, ${count}${waiting ? ", some waiting for approval" : ""}`}
          className={cn(
            "group @container absolute z-[5] flex overflow-hidden rounded-md border text-left shadow-xs transition-[box-shadow] outline-none hover:z-30 hover:shadow-md focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:z-30 data-[state=open]:ring-2 data-[state=open]:ring-ring",
            waiting ? "border-dashed border-info" : "border-black/5 dark:border-white/10",
          )}
          style={{
            ...pos,
            top,
            height: h,
            backgroundColor: `color-mix(in oklab, ${first.service.color} 14%, var(--surface))`,
          }}
        >
          <span aria-hidden className="w-[3px] shrink-0" style={{ backgroundColor: first.service.color }} />
          <span
            className={cn("flex min-w-0 flex-1 gap-x-1.5 px-1.5", short ? "items-center" : "flex-col py-1")}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4 font-semibold text-foreground">
              <span className="truncate">{first.service.name}</span>
              {short && (
                <span className="tnum shrink-0 font-medium text-muted-foreground">{active.length}</span>
              )}
            </span>
            {!short && (
              <span className="truncate text-2xs leading-4 text-muted-foreground">
                <span className="tnum">{time}</span> · <span className="tnum">{count}</span>
              </span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={`${first.service.name}, ${time}`} className="w-72 p-1.5">
        <p className="px-2 pt-1.5 pb-1 text-sm font-medium">
          {first.service.name} <span className="tnum font-normal text-muted-foreground">· {time}</span>
        </p>
        <p className="px-2 pb-1.5 text-xs text-muted-foreground">
          {active.length} {v("booking", { count: active.length })}
        </p>
        <BookingList bookings={bookings} formatTime={formatTime} onSelect={onSelect} showTime={false} />
      </PopoverContent>
    </Popover>
  );
}

/** "+N": bookings that didn't fit side by side in a narrow column; opens the list of them. */
export function OverflowMarker({
  overflow,
  top,
  startHour,
  endHour,
  formatTime,
  onSelect,
  whole,
}: {
  overflow: LaneOverflow<CalendarEvent>;
  top: (m: number) => number;
  startHour: number;
  endHour: number;
  formatTime: (iso: string) => string;
  onSelect: (id: string) => void;
  /** Stands for every booking in the overlap, so "more" would be wrong. */
  whole?: boolean;
}) {
  const { v } = useVocabulary();
  const s = Math.max(overflow.startMin, startHour * 60);
  const e = Math.min(overflow.endMin, endHour * 60);
  if (e <= s) return null;
  const bookings = overflow.events
    .flatMap((x) => x.item.bookings)
    .sort((a, b) => a.start.localeCompare(b.start) || a.customer.name.localeCompare(b.customer.name));
  const n = bookings.length;
  const from = formatTime(bookings[0]?.start ?? overflow.events[0].item.start);
  const until = formatTime(bookings.at(-1)?.end ?? overflow.events[0].item.end);
  const title = `${n}${whole ? "" : " more"} ${v("booking", { count: n })}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-event=""
          aria-label={`${title}, ${from} to ${until}`}
          className="@container absolute z-[5] overflow-hidden rounded-md border border-border bg-muted px-1.5 py-1 text-left text-xs leading-4 font-semibold text-foreground shadow-xs transition-colors outline-none hover:z-30 hover:border-border-strong focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:z-30"
          style={{
            ...lanePosition(overflow.lane, overflow.lanes),
            top: top(s) + 1,
            height: Math.max((e - s) * PX_PER_MIN - 2, 22),
          }}
        >
          {/* The whole column: what's there and when. A lane beside other blocks: the count. */}
          <span className={cn("tnum block truncate", !whole && "@max-[6rem]:hidden")}>
            {n} {v("booking", { count: n })}
          </span>
          <span
            className={cn(
              "tnum block truncate text-2xs font-normal text-muted-foreground",
              !whole && "@max-[6rem]:hidden",
            )}
          >
            {from}–{until}
          </span>
          {!whole && <span className="tnum hidden text-center @max-[6rem]:block">+{n}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={title} className="max-h-96 w-72 overflow-y-auto p-1.5">
        <p className="px-2 pt-1.5 pb-1.5 text-sm font-medium">{title}</p>
        <BookingList bookings={bookings} formatTime={formatTime} onSelect={onSelect} showTime />
      </PopoverContent>
    </Popover>
  );
}

/** Rows of bookings in a popover: time, who and what, the status when it isn't confirmed; each opens the booking. */
function BookingList({
  bookings,
  formatTime,
  onSelect,
  showTime,
}: {
  bookings: Booking[];
  formatTime: (iso: string) => string;
  onSelect: (id: string) => void;
  showTime: boolean;
}) {
  return (
    <ul className="flex flex-col">
      {bookings.map((b) => {
        const look = eventAppearance(b.status);
        return (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onSelect(b.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:bg-accent pointer-coarse:min-h-11"
            >
              <span
                aria-hidden
                className="h-6 w-[3px] shrink-0 rounded-full"
                style={{ backgroundColor: b.service.color }}
              />
              {showTime && <span className="tnum shrink-0 text-muted-foreground">{formatTime(b.start)}</span>}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  look.inactive && "text-muted-foreground line-through",
                )}
              >
                {b.customer.name}
                {showTime && <span className="text-muted-foreground"> · {b.service.name}</span>}
              </span>
              {look.showDot && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <span aria-hidden className={cn("size-1.5 rounded-full", TONE_DOT[look.tone])} />
                  {look.label}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
