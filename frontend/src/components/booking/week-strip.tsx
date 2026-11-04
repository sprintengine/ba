"use client";

import { useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { addDaysToPlainDate, formatDate, isoWeekDates, startOfIsoWeek, type PlainDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

/**
 * Phone date picker: a week of day buttons with availability dots (swipe, or the arrows, for another week), and
 * a month calendar on demand.
 */
export function WeekStrip({
  timeZone,
  locale,
  min,
  max,
  date,
  month,
  onMonthChange,
  onDateChange,
  onWeekChange,
  hasMarker,
  isDateDisabled,
  isDateLocked,
  loaded,
  className,
}: {
  timeZone: string;
  locale?: string;
  min: PlainDate;
  max: PlainDate;
  date: PlainDate | null;
  month: string;
  onMonthChange: (month: string) => void;
  onDateChange: (date: PlainDate) => void;
  /**
   * The week shown after the arrows or a swipe (its Monday), so its days in a month other than `month` get loaded
   * too (see `pickerWindows`).
   */
  onWeekChange?: (weekStart: PlainDate) => void;
  hasMarker: (d: PlainDate) => boolean;
  isDateDisabled: (d: PlainDate) => boolean;
  /** Not open for booking yet (a release schedule, §21): a lock instead of the dot, and still selectable. */
  isDateLocked?: (d: PlainDate) => boolean;
  loaded: (d: PlainDate) => boolean;
  className?: string;
}) {
  const [anchor, setAnchor] = useState(() => startOfIsoWeek(date ?? min));
  const [showMonth, setShowMonth] = useState(false);
  // Follow the selected date (e.g. "next available" jumps to another week).
  const [trackedDate, setTrackedDate] = useState(date);
  if (date !== trackedDate) {
    setTrackedDate(date);
    if (date && startOfIsoWeek(date) !== anchor) setAnchor(startOfIsoWeek(date));
  }
  const dates = isoWeekDates(anchor);
  const canPrev = anchor > min;
  const canNext = addDaysToPlainDate(anchor, 7) <= max;

  const go = (delta: number) => {
    const next = addDaysToPlainDate(anchor, delta * 7);
    setAnchor(next);
    onWeekChange?.(next);
    const m = (next < min ? min : next).slice(0, 7);
    if (m !== month) onMonthChange(m);
  };
  const swipe = useHorizontalSwipe((direction) => {
    if (direction > 0 ? canNext : canPrev) go(direction);
  });

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        {/* The month calendar has its own month heading. */}
        {!showMonth && (
          <p className="text-sm font-semibold tracking-tight">
            {formatDate(anchor < min ? min : anchor, "UTC", "monthYear", locale)}
          </p>
        )}
        {/* Thumb-sized: 44px controls (the strip also swipes between weeks). */}
        <div className="-mr-2 ml-auto flex items-center">
          <Button
            variant="ghost"
            size="lg"
            className="px-3 text-sm text-muted-foreground"
            onClick={() => setShowMonth((v) => !v)}
            aria-expanded={showMonth}
          >
            <CalendarDays /> {showMonth ? "Week" : "Month"}
          </Button>
          {!showMonth && (
            <>
              <Button
                variant="ghost"
                size="lg"
                className="w-11 px-0"
                aria-label="Previous week"
                disabled={!canPrev}
                onClick={() => go(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-11 px-0"
                aria-label="Next week"
                disabled={!canNext}
                onClick={() => go(1)}
              >
                <ChevronRight />
              </Button>
            </>
          )}
        </div>
      </div>
      {showMonth ? (
        <Calendar
          size="lg"
          className="w-full [&_table]:w-full"
          value={date}
          onValueChange={(d) => {
            onDateChange(d);
            setShowMonth(false);
          }}
          month={month}
          onMonthChange={onMonthChange}
          min={min}
          max={max}
          timeZone={timeZone}
          hasMarker={hasMarker}
          isDateDisabled={isDateDisabled}
          isDateLocked={isDateLocked}
          aria-label="Choose a date"
        />
      ) : (
        <div
          key={anchor}
          className="grid animate-fade-in touch-pan-y grid-cols-7 gap-0.5 min-[375px]:gap-1"
          role="group"
          aria-label="Choose a date"
          {...swipe}
        >
          {dates.map((d) => {
            const outOfRange = d < min || d > max;
            const disabled = outOfRange || isDateDisabled(d);
            const selected = d === date;
            const pending = !outOfRange && !loaded(d);
            const locked = !disabled && !hasMarker(d) && (isDateLocked?.(d) ?? false);
            return (
              <button
                key={d}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={`${formatDate(d, "UTC", "full", locale)}${locked ? ", not open for booking yet" : ""}`}
                onClick={() => onDateChange(d)}
                className={cn(
                  "relative flex h-[4.25rem] flex-col items-center justify-center gap-1 rounded-xl border text-center transition-[background-color,border-color,color] duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary text-primary-foreground shadow-button"
                    : disabled
                      ? "border-transparent text-subtle-foreground/50"
                      : "border-border bg-surface shadow-xs active:scale-95 dark:bg-surface-raised",
                )}
              >
                <span className={cn("text-2xs font-medium uppercase", !selected && "text-subtle-foreground")}>
                  {formatDate(d, "UTC", "weekday", locale)}
                </span>
                <span className="tnum text-base leading-none font-semibold">{Number(d.slice(8))}</span>
                {locked ? (
                  <Lock
                    aria-hidden
                    className={cn("size-3", selected ? "text-primary-foreground" : "text-subtle-foreground")}
                  />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "size-1 rounded-full",
                      pending
                        ? "animate-pulse bg-border-strong"
                        : hasMarker(d) && !outOfRange
                          ? selected
                            ? "bg-primary-foreground"
                            : "bg-brand"
                          : "bg-transparent",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Touch handlers for a horizontal swipe: `onSwipe(1)` for a swipe to the left (next), `onSwipe(-1)` to the right
 * (previous). Mostly vertical movement is left to the page's scroll.
 */
function useHorizontalSwipe(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const from = start.current;
      const t = e.changedTouches[0];
      start.current = null;
      if (!from || !t) return;
      const dx = t.clientX - from.x;
      const dy = t.clientY - from.y;
      if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
    },
  };
}
