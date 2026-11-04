"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Globe } from "lucide-react";
import { formatDate, isoWeekDates, timeZoneLabel, type PlainDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDemoTarget } from "../engine/demo-context";
import { LUMEN } from "./fixture";
import { demoDates, slotsOn } from "./state";

/*
 * The time step on a phone, as components/booking/{slot-picker,week-strip,slot-grid,timezone-note}.tsx render
 * it: a week of days with availability dots, the chosen day's times, and the timezone.
 */

const TZ = LUMEN.timezone;
const LOCALE = LUMEN.locale;

export function TimeStep({
  today,
  nextWeek,
  date,
  time,
}: {
  today: PlainDate;
  nextWeek: boolean;
  date: PlainDate;
  time: string | null;
}) {
  const d = demoDates(today);
  const anchor = nextWeek ? d.nextWeek : d.thisWeek;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-6">
        <WeekStrip today={today} anchor={anchor} date={date} />
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold tracking-tight">{formatDate(date, TZ, "long", LOCALE)}</h3>
          </div>
          <SlotGrid key={date} slots={slotsOn(date, today)} selected={time} />
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Globe className="mt-px size-3.5 shrink-0 text-subtle-foreground" aria-hidden />
            <span>
              Times in {TZ.split("/").pop()} time ({timeZoneLabel(TZ)})
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function WeekStrip({ today, anchor, date }: { today: PlainDate; anchor: PlainDate; date: PlainDate }) {
  const next = useDemoTarget("week-next");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight">
          {formatDate(anchor < today ? today : anchor, "UTC", "monthYear", LOCALE)}
        </p>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" tabIndex={-1} className="text-muted-foreground">
            <CalendarDays /> Month
          </Button>
          <Button variant="ghost" size="sm" tabIndex={-1} className="px-2" disabled={anchor <= today}>
            <ChevronLeft />
          </Button>
          <Button
            {...next.props}
            variant="ghost"
            size="sm"
            tabIndex={-1}
            className={cn("px-2", next.pressed && "scale-[0.98] bg-accent")}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {isoWeekDates(anchor).map((d) => (
          <DayButton key={d} day={d} today={today} selected={d === date} />
        ))}
      </div>
    </div>
  );
}

function DayButton({ day, today, selected }: { day: PlainDate; today: PlainDate; selected: boolean }) {
  const t = useDemoTarget(`day-${day}`);
  const available = slotsOn(day, today).length > 0;
  const on = selected || t.pressed;
  return (
    <div
      {...t.props}
      className={cn(
        "relative flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border text-center transition-[background-color,border-color,color] duration-150",
        on
          ? "border-primary bg-primary text-primary-foreground shadow-button"
          : !available
            ? "border-transparent text-subtle-foreground/50"
            : "border-border bg-surface shadow-xs dark:bg-surface-raised",
        t.pressed && "scale-95",
      )}
    >
      <span className={cn("text-2xs font-medium uppercase", !on && "text-subtle-foreground")}>
        {formatDate(day, "UTC", "weekday", LOCALE)}
      </span>
      <span className="tnum text-base leading-none font-semibold">{Number(day.slice(8))}</span>
      <span
        aria-hidden
        className={cn(
          "size-1 rounded-full",
          available ? (on ? "bg-primary-foreground" : "bg-brand") : "bg-transparent",
        )}
      />
    </div>
  );
}

function SlotGrid({ slots, selected }: { slots: string[]; selected: string | null }) {
  return (
    <div className="flex animate-fade-in flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          {slots.map((time) => (
            <Slot key={time} time={time} selected={selected === time} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Slot({ time, selected }: { time: string; selected: boolean }) {
  const t = useDemoTarget(`slot-${time}`);
  const on = selected || t.pressed;
  return (
    <div
      {...t.props}
      className={cn(
        "tnum relative flex h-11 flex-col items-center justify-center rounded-lg border text-[0.9375rem] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150",
        on
          ? "border-primary bg-primary text-primary-foreground shadow-button"
          : "border-border bg-surface text-foreground shadow-xs dark:bg-surface-raised",
        t.pressed && "scale-[0.97]",
      )}
    >
      <span>{time}</span>
    </div>
  );
}
