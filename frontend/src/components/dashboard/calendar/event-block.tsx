"use client";

import type { Booking } from "@/lib/api/types";
import { eventAppearance } from "@/lib/dashboard/calendar";
import { cn } from "@/lib/utils";
import type { PositionedEvent, SessionEntry } from "@/lib/dashboard/calendar-layout";
import { SessionButton } from "./event-groups";
import {
  CARD,
  CARD_RAISED,
  lanePosition,
  linesFor,
  serviceTint,
  StatusWord,
  CARD_TEXT,
  STUCK_DETAIL,
  STUCK_NAME,
  type Position,
} from "./event-card";

export type CalendarEvent = PositionedEvent<SessionEntry<Booking>>;

/** The legend's neutral hatch: preparation is time taken, not more of the service's colour. */
const HATCH = "repeating-linear-gradient(135deg, var(--border-strong) 0 1px, transparent 1px 7px)";

/** A booking (or a session of several) on the grid: its buffers (hatched), and the block, clipped to the visible hours. */
export function EventBlock({
  p,
  top,
  startHour,
  endHour,
  pxPerMin,
  compact,
  columnResourceId,
  formatTime,
  onSelect,
}: {
  p: CalendarEvent;
  top: (m: number) => number;
  startHour: number;
  endHour: number;
  pxPerMin: number;
  compact?: boolean;
  /** The column's resource: a card names the others, so a person's column says the room and a room's the person. */
  columnResourceId?: string;
  formatTime: (iso: string) => string;
  onSelect: (id: string) => void;
}) {
  const entry = p.item;
  const lo = startHour * 60;
  const hi = endHour * 60;
  const s = Math.max(p.startMin, lo);
  const e = Math.min(p.endMin, hi);
  if (e <= lo || s >= hi) return null;
  const h = Math.max((e - s) * pxPerMin - 2, 20);
  const pos = lanePosition(p.lane, p.lanes);
  const bufferBefore = Math.max(p.blockStartMin, lo);
  const bufferAfter = Math.min(p.blockEndMin, hi);
  const place = placeOf(entry.bookings[0], columnResourceId);

  return (
    <>
      {p.blockStartMin < p.startMin && (
        <BufferHatch pos={pos} top={top(bufferBefore)} height={(s - bufferBefore) * pxPerMin} edge="top" />
      )}
      {p.blockEndMin > p.endMin && (
        <BufferHatch pos={pos} top={top(e)} height={(bufferAfter - e) * pxPerMin} edge="bottom" />
      )}
      {entry.bookings.length === 1 ? (
        <EventButton
          booking={entry.bookings[0]}
          pos={pos}
          top={top(s) + 1}
          height={h}
          compact={compact}
          place={place}
          formatTime={formatTime}
          onSelect={onSelect}
        />
      ) : (
        <SessionButton
          bookings={entry.bookings}
          pos={pos}
          top={top(s) + 1}
          height={h}
          place={place}
          formatTime={formatTime}
          onSelect={onSelect}
        />
      )}
    </>
  );
}

/** The booking's other resources: the room on a person's column, the person on a room's, everyone on a week's. */
function placeOf(b: Booking, columnResourceId: string | undefined): string {
  return b.resources
    .filter((r) => r.id !== columnResourceId)
    .map((r) => r.name)
    .join(", ");
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
      className={cn("absolute", edge === "top" ? "rounded-t-lg" : "rounded-b-lg")}
      style={{ ...pos, top, height, backgroundImage: HATCH }}
    />
  );
}

/** How a status changes a card. Waiting on the business is amber; cancelled is an outline; a no-show is grey. */
function cardState(status: Booking["status"], label: string) {
  const waiting = status === "pending_approval";
  const cancelled = status === "cancelled" || status === "expired";
  const noShow = status === "no_show";
  return {
    waiting,
    cancelled,
    noShow,
    status: waiting || cancelled || noShow || status === "held" ? label : null,
  };
}

type DetailRow = { kind: "detail" | "status" | "place"; text: string };

/** The lines under the name, most needed first, as many as the card holds. */
function detailRows({
  booking: b,
  lines,
  compact,
  status,
  place,
  time,
  start,
}: {
  booking: Booking;
  lines: number;
  compact?: boolean;
  status: string | null;
  place: string;
  time: string;
  start: string;
}): DetailRow[] {
  const service = `${b.service.name}${b.option ? ` (${b.option.name})` : ""}`;
  if (lines === 2) {
    if (status) return [{ kind: "status", text: `${status} · ${start}` }];
    return [{ kind: "detail", text: compact ? `${start} · ${service}` : `${time} · ${place || service}` }];
  }
  const rows: DetailRow[] = compact
    ? [
        { kind: "detail", text: time },
        { kind: "detail", text: service },
      ]
    : [{ kind: "detail", text: `${time} · ${service}` }];
  if (status) rows.push({ kind: "status", text: status });
  if (place) rows.push({ kind: "place", text: place });
  return rows.slice(0, lines - 1);
}

function EventButton({
  booking: b,
  pos,
  top,
  height: h,
  compact,
  place,
  formatTime,
  onSelect,
}: {
  booking: Booking;
  pos: Position;
  top: number;
  height: number;
  compact?: boolean;
  place: string;
  formatTime: (iso: string) => string;
  onSelect: (id: string) => void;
}) {
  const look = eventAppearance(b.status);
  const lines = linesFor(h);
  const time = `${formatTime(b.start)}–${formatTime(b.end)}`;
  const { waiting, cancelled, noShow, status } = cardState(b.status, look.label);
  const tint = b.status === "completed" ? "var(--event-tint-done)" : undefined;
  return (
    <button
      type="button"
      data-event=""
      onClick={() => onSelect(b.id)}
      title={`${time} · ${b.customer.name} · ${b.service.name} · ${look.label}`}
      className={cn(
        CARD,
        "@container",
        !cancelled && CARD_RAISED,
        waiting && "border-warning-border bg-warning-soft",
        cancelled && "border-dashed border-border-strong",
        noShow && "border-border bg-muted",
        b.status === "held" && "border-dashed",
      )}
      style={{
        ...pos,
        top,
        height: h,
        ...(waiting || cancelled || noShow ? {} : serviceTint(b.service.color, tint)),
      }}
    >
      <span className={CARD_TEXT}>
        <span
          className={cn(
            STUCK_NAME,
            "flex min-w-0 items-baseline gap-1.5 text-[0.8125rem] leading-[1.0625rem] font-semibold text-foreground",
            (cancelled || noShow) &&
              "font-medium text-muted-foreground line-through decoration-foreground/40",
          )}
        >
          {/* Only one line: the time goes first, and the name takes what is left. */}
          {lines === 1 && (
            <span className="tnum shrink-0 font-medium text-muted-foreground">{formatTime(b.start)}</span>
          )}
          <span className="truncate">{b.customer.name}</span>
        </span>
        {detailRows({ booking: b, lines, compact, status, place, time, start: formatTime(b.start) }).map(
          (row, i) => (
            <span
              key={row.text}
              className={cn(
                "block truncate text-xs leading-[1.0625rem]",
                i === 0 && STUCK_DETAIL,
                row.kind === "detail" && "text-muted-foreground",
                row.kind === "place" && "font-medium text-foreground",
              )}
            >
              {row.kind === "status" ? <StatusWord tone={look.tone}>{row.text}</StatusWord> : row.text}
            </span>
          ),
        )}
      </span>
      {/* The words above don't fit a short card; a screen reader still gets them. */}
      {(!status || lines < 2) && <span className="sr-only">{look.label}</span>}
    </button>
  );
}
