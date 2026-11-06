"use client";

import type { Booking } from "@/lib/api/types";
import { eventAppearance } from "@/lib/dashboard/calendar";
import type { LaneOverflow } from "@/lib/dashboard/calendar-layout";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarEvent } from "./event-block";
import {
  CARD,
  CARD_RAISED,
  CARD_TEXT_TIGHT,
  isTight,
  lanePosition,
  linesFor,
  serviceTint,
  StatusWord,
  CARD_TEXT,
  STUCK_DETAIL,
  STUCK_NAME,
  TONE_DOT,
  waitingFill,
  type Position,
} from "./event-card";

/** Several bookings of one session (a class): one block with the count; it opens the list of who is booked. */
export function SessionButton({
  bookings,
  pos,
  top,
  height: h,
  place,
  formatTime,
  onSelect,
}: {
  bookings: [Booking, ...Booking[]];
  pos: Position;
  top: number;
  height: number;
  place: string;
  formatTime: (iso: string) => string;
  onSelect: (id: string) => void;
}) {
  const { v } = useVocabulary();
  const first = bookings[0];
  const active = bookings.filter((b) => !eventAppearance(b.status).inactive);
  const waiting = bookings.some((b) => eventAppearance(b.status).tentative);
  const lines = linesFor(h);
  const time = `${formatTime(first.start)}–${formatTime(first.end)}`;
  const count = `${active.length} booked`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-event=""
          className={cn(
            CARD,
            CARD_RAISED,
            "@container data-[state=open]:z-20 data-[state=open]:ring-2 data-[state=open]:ring-ring",
            waiting && "border-warning-border",
          )}
          style={{ ...pos, top, height: h, ...(waiting ? waitingFill : serviceTint(first.service.color)) }}
        >
          {/* Read as one sentence; the lines on screen would run together (WCAG 2.5.3). */}
          <span className="sr-only">
            {`${first.service.name}, ${time}, ${count}${waiting ? ", some waiting for approval" : ""}`}
          </span>
          <span aria-hidden className={isTight(h) ? CARD_TEXT_TIGHT : CARD_TEXT}>
            <span
              className={cn(
                STUCK_NAME,
                "flex min-w-0 items-baseline gap-1.5 text-[0.8125rem] leading-[1.0625rem] font-semibold text-foreground",
                isTight(h) && "mt-0 pt-0 text-xs leading-[0.9375rem]",
              )}
            >
              <span className="truncate">{first.service.name}</span>
              {lines === 1 && (
                <span className="tnum shrink-0 font-medium text-muted-foreground">{active.length}</span>
              )}
            </span>
            {lines >= 2 && (
              <span
                className={cn(
                  STUCK_DETAIL,
                  "block truncate text-xs leading-[1.0625rem] text-muted-foreground",
                )}
              >
                <span className="tnum">{time}</span> · <span className="tnum">{count}</span>
              </span>
            )}
            {lines >= 3 && waiting && (
              <span className="block truncate text-xs leading-[1.0625rem]">
                <StatusWord tone="warning">Some need approval</StatusWord>
              </span>
            )}
            {lines >= (waiting ? 4 : 3) && place && (
              <span className="block truncate text-xs leading-[1.0625rem] font-medium text-foreground">
                {place}
              </span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        aria-label={`${first.service.name}, ${time}`}
        className="w-72 p-1.5"
      >
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
  pxPerMin,
  formatTime,
  onSelect,
  whole,
}: {
  overflow: LaneOverflow<CalendarEvent>;
  top: (m: number) => number;
  startHour: number;
  endHour: number;
  pxPerMin: number;
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
  const height = Math.max((e - s) * pxPerMin - 2, 22);
  // A stack in a week names who's in it, tinted like the bookings it holds, with a card's edge showing behind.
  const stack = whole ? bookings[0] : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-event=""
          className={cn(
            CARD,
            CARD_RAISED,
            "@container text-xs leading-4 font-semibold text-foreground data-[state=open]:z-20",
            !stack && "border-border-strong bg-surface-raised",
          )}
          style={{
            ...lanePosition(overflow.lane, overflow.lanes),
            top: top(s) + 1,
            height,
            ...(stack ? stackLook(stack.service.color) : {}),
          }}
        >
          <span className="sr-only">{`${title}, ${from} to ${until}`}</span>
          {/* The whole column: what's there and when. A lane beside other blocks: the count. */}
          {/* Pinned like a booking's name: a long block scrolled to its middle must not read as an empty card. */}
          <span aria-hidden className={isTight(height) ? CARD_TEXT_TIGHT : CARD_TEXT}>
            <StackText bookings={bookings} whole={!!whole} height={height} from={from} until={until} />
            {!whole && <span className="tnum hidden text-center @max-[6rem]:block">+{n}</span>}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        aria-label={title}
        className="max-h-96 w-72 overflow-y-auto p-1.5"
      >
        <p className="px-2 pt-1.5 pb-1.5 text-sm font-medium">{title}</p>
        <BookingList bookings={bookings} formatTime={formatTime} onSelect={onSelect} showTime />
      </PopoverContent>
    </Popover>
  );
}

const stackLook = (color: string): React.CSSProperties => ({
  ...serviceTint(color),
  boxShadow: `0 2px 0 -1px var(--surface), 0 3px 0 -1px color-mix(in oklab, ${color} 28%, var(--surface))`,
});

/** What a stack or a "+N" says: who's in it and when, then what, as the height allows. */
function StackText({
  bookings,
  whole,
  height,
  from,
  until,
}: {
  bookings: Booking[];
  whole: boolean;
  height: number;
  from: string;
  until: string;
}) {
  const { v } = useVocabulary();
  const n = bookings.length;
  const first = whole ? bookings[0] : undefined;
  const lines = linesFor(height);
  const services = [...new Set(bookings.map((b) => b.service.name))];
  return (
    <>
      <span
        className={cn(
          STUCK_NAME,
          "tnum flex min-w-0 items-baseline gap-1",
          !whole && "@max-[6rem]:hidden",
          isTight(height) && "mt-0 pt-0",
        )}
      >
        {first ? (
          <>
            <span className="min-w-0 truncate">{first.customer.name}</span>
            <span className="shrink-0 font-medium text-muted-foreground">+{n - 1}</span>
          </>
        ) : (
          <span className="truncate">
            {n} {v("booking", { count: n })}
          </span>
        )}
      </span>
      {(lines >= 2 || !whole) && (
        <span
          className={cn(
            STUCK_DETAIL,
            "tnum block truncate text-xs font-normal text-muted-foreground",
            !whole && "@max-[6rem]:hidden",
          )}
        >
          {from}–{until}
        </span>
      )}
      {first && lines >= 3 && (
        <span className="block truncate text-xs font-normal text-muted-foreground">
          {services.length === 1 ? services[0] : `${services.length} services`}
        </span>
      )}
    </>
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
                className="size-2 shrink-0 rounded-full"
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
