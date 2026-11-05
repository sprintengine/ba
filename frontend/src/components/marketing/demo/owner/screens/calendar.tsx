"use client";

import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, DoorOpen, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useDemoTarget } from "../../engine/demo-context";
import { CALENDAR_RESOURCES, type CalendarBooking } from "../state";

const START = 9;
const END = 18;
const HOUR_PX = 60;
const PX_PER_MIN = HOUR_PX / 60;
/** Each column's open hours, in minutes (the rest is shaded, as in the app). */
const OPEN = [
  [9 * 60, 17.5 * 60],
  [10 * 60, 17.5 * 60],
  [9 * 60, 18 * 60],
  [9 * 60, 18 * 60],
] as const;
const NOW = 11 * 60 + 5;

const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const top = (m: number) => (m - START * 60) * PX_PER_MIN;

function EventBlock({ b, column }: { b: CalendarBooking; column: number }) {
  const t = useDemoTarget(column === b.columns[0] ? `event-${b.id}` : `event-${b.id}-${String(column)}`);
  return (
    <span
      {...t.props}
      className={cn(
        "absolute inset-x-0.5 z-[5] flex overflow-hidden rounded-md border border-black/5 text-left shadow-xs transition-[box-shadow,transform] dark:border-white/10",
        t.hovered && "z-30 shadow-md",
        b.fresh && "animate-pop-in ring-2 ring-brand/50",
      )}
      style={{
        top: top(b.start) + 1,
        height: (b.end - b.start) * PX_PER_MIN - 2,
        backgroundColor: `color-mix(in oklab, ${b.color} 14%, var(--surface))`,
      }}
    >
      <span className="flex min-w-0 flex-1 flex-col px-1.5 py-1">
        <span className="truncate pr-2 text-xs leading-4 font-semibold text-foreground">{b.customer}</span>
        <span className="truncate text-2xs leading-4 text-muted-foreground">
          <span className="tnum">
            {fmt(b.start)}–{fmt(b.end)}
          </span>{" "}
          · {b.service}
        </span>
      </span>
    </span>
  );
}

function Column({ index, bookings }: { index: number; bookings: CalendarBooking[] }) {
  const [open, close] = OPEN[index] ?? [0, 0];
  return (
    <div className="relative min-w-0 flex-1 border-l border-border bg-muted/70 dark:bg-background">
      <div
        className="absolute inset-x-0 bg-surface dark:bg-surface-raised"
        style={{ top: top(open), height: (Math.min(close, END * 60) - open) * PX_PER_MIN }}
      />
      {bookings
        .filter((b) => b.columns.includes(index))
        .map((b) => (
          <EventBlock key={b.id} b={b} column={index} />
        ))}
      <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: top(NOW) }}>
        <div className="relative h-px bg-danger">
          {index === 0 && <span className="absolute -top-[3.5px] -left-1 size-2 rounded-full bg-danger" />}
        </div>
      </div>
    </div>
  );
}

/** Calendar, day view across the four resources, with the hour grid and the now line. */
export function CalendarScreen({ bookings }: { bookings: CalendarBooking[] }) {
  const hours = END - START;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-2">
          <Button tabIndex={-1} size="sm">
            Today
          </Button>
          <span className="flex text-muted-foreground">
            <span className="flex size-8 items-center justify-center">
              <ChevronLeft className="size-4" />
            </span>
            <span className="flex size-8 items-center justify-center">
              <ChevronRight className="size-4" />
            </span>
          </span>
          <span className="px-1.5 text-lg font-semibold tracking-tight">
            Thursday, 1 October <span className="ml-2 text-sm font-normal text-muted-foreground">Today</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-8 min-w-40 items-center justify-between gap-2 rounded-lg border border-input bg-surface px-2.5 text-sm shadow-xs">
            All therapists <ChevronDown className="size-4 text-subtle-foreground" />
          </span>
          <span className="flex h-8 items-center gap-2 px-2 text-sm text-muted-foreground">
            <Switch size="sm" checked={false} tabIndex={-1} /> Cancelled
          </span>
          <span className="flex h-8 items-center rounded-lg bg-muted p-0.5 text-xs font-medium">
            <span className="rounded-md bg-surface px-2.5 py-1 shadow-xs">Day</span>
            <span className="px-2.5 py-1 text-muted-foreground">Week</span>
          </span>
          <Button tabIndex={-1} size="sm" variant="primary">
            <CalendarPlus /> New appointment
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="flex border-b border-border bg-surface/95">
          <div className="w-14 shrink-0" />
          {CALENDAR_RESOURCES.map((r, i) => (
            <div key={r.name} className="flex h-14 flex-1 items-center gap-2.5 border-l border-border px-3">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-white"
                style={{ backgroundColor: r.color }}
              >
                {r.kind === "person" ? <User className="size-4" /> : <DoorOpen className="size-4" />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <span className="tnum text-2xs text-muted-foreground">
                  {bookings.filter((b) => b.columns.includes(i)).length} booked
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="relative flex" style={{ height: hours * HOUR_PX }}>
          <div className="relative w-14 shrink-0">
            {Array.from({ length: hours }, (_, i) => (
              <span
                key={i}
                className="tnum absolute right-2 -translate-y-1/2 text-2xs font-medium text-subtle-foreground"
                style={{ top: i * HOUR_PX }}
              >
                {i === 0 ? "" : `${String(START + i).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          <div
            className="pointer-events-none absolute inset-0 left-14 z-[1]"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, var(--border) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border-subtle) 70%, transparent) 1px, transparent 1px)",
              backgroundSize: `100% ${String(HOUR_PX)}px, 100% ${String(HOUR_PX / 2)}px`,
            }}
          />
          {CALENDAR_RESOURCES.map((r, i) => (
            <Column key={r.name} index={i} bookings={bookings} />
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-border-subtle bg-surface-sunken/60 px-4 py-2 text-xs text-muted-foreground">
          <span className="tnum">{bookings.length} appointments · Europe/Dublin</span>
          <span>click an empty slot to book</span>
        </div>
      </div>
    </div>
  );
}
