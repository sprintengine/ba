"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AvailabilityWindows } from "@/lib/api/hooks";
import type { Slot } from "@/lib/api/types";
import { firstAvailableDate } from "@/lib/booking/windows";
import {
  addDaysToPlainDate,
  addMonths,
  formatDate,
  formatRelativeDay,
  toTimeOfDay,
  type PlainDate,
  type PlainMonth,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { LockedDay, useRefetchAt } from "./locked-day";
import { SlotGrid, SlotsSkeleton } from "./slot-grid";
import { TimezoneNote } from "./timezone-note";
import { WeekStrip } from "./week-strip";

export type SlotPickerProps = {
  timeZone: string;
  locale?: string;
  min: PlainDate;
  max: PlainDate;
  month: string;
  onMonthChange: (month: string) => void;
  date: PlainDate | null;
  onDateChange: (date: PlainDate, reason: "user" | "auto") => void;
  /** The phone week strip's shown week (its Monday) after the arrows or a swipe; see `pickerWindows`. */
  onWeekChange?: (weekStart: PlainDate) => void;
  /** Selected slot start (ISO) — compared by wall-clock time in `timeZone`. */
  selectedTime: string | null;
  onSelectSlot: (slot: Slot, date: PlainDate, time: string) => void;
  availability: AvailabilityWindows;
  /** Rendered above the slots (e.g. "that time was just taken"). */
  notice?: React.ReactNode;
  /** Business currency; needed to show deal prices on discounted slots (§19). */
  currency?: string;
  className?: string;
};

/**
 * Date + time picker over availability windows, laid out by its own width (container queries, so it fits a
 * dialog, a side-by-side layout or a page alike). Wide: month calendar with availability dots beside the day's
 * slots; medium (iPad portrait): the calendar above them. Phone: a week strip (with a month
 * view on demand) above the slots. Times are always in the business timezone.
 */
export function SlotPicker({
  timeZone,
  locale,
  min,
  max,
  month,
  onMonthChange,
  date,
  onDateChange,
  onWeekChange,
  selectedTime,
  onSelectSlot,
  availability,
  notice,
  currency,
  className,
}: SlotPickerProps) {
  const { days, loaded, locks } = availability;
  const { noneAtAll } = useFirstAvailableDate({
    availability,
    month,
    min,
    max,
    date,
    onDateChange,
    onMonthChange,
  });
  const hasMarker = (d: PlainDate) => (days.get(d)?.length ?? 0) > 0;
  // A day a release keeps closed stays selectable: it says when it opens.
  const isDateLocked = (d: PlainDate) => locks.has(d);
  const isDateDisabled = (d: PlainDate) => loaded(d) && !hasMarker(d) && !isDateLocked(d);
  // A closed day opening while the page is open shows its times without a reload.
  useRefetchAt(nextOpening(locks), availability.refetch);

  return (
    <div className={cn("@container flex flex-col gap-5", className)}>
      {notice}
      <div className="grid gap-6 @xl:grid-cols-[auto_minmax(0,1fr)] @xl:gap-8">
        {/* Month calendar where there's room for it (iPad, desktop), beside the times when there's room for both */}
        <div className="hidden @[25rem]:block">
          <Calendar
            size="lg"
            className="@max-xl:flex @max-xl:w-full @max-xl:[&_table]:w-full"
            value={date}
            onValueChange={(d) => onDateChange(d, "user")}
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
        </div>

        {/* Phone week strip */}
        <WeekStrip
          className="@[25rem]:hidden"
          timeZone={timeZone}
          locale={locale}
          min={min}
          max={max}
          date={date}
          month={month}
          onMonthChange={onMonthChange}
          onDateChange={(d) => onDateChange(d, "user")}
          onWeekChange={onWeekChange}
          hasMarker={hasMarker}
          isDateDisabled={isDateDisabled}
          isDateLocked={isDateLocked}
          loaded={loaded}
        />

        <div className="flex min-w-0 flex-col gap-4">
          <TimezoneNote timeZone={timeZone} className="text-xs" />
          {availability.isError && !availability.days.size ? (
            <ErrorState
              error={availability.error}
              onRetry={availability.refetch}
              title="We couldn't load available times"
            />
          ) : noneAtAll ? (
            <NoTimesAtAll />
          ) : !date || !loaded(date) ? (
            <SlotsSkeleton />
          ) : (
            <DayTimes
              date={date}
              timeZone={timeZone}
              locale={locale}
              currency={currency}
              month={month}
              max={max}
              availability={availability}
              selectedTime={selectedTime}
              onSelectSlot={onSelectSlot}
              onDateChange={onDateChange}
              onMonthChange={onMonthChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The soonest time a closed day opens (held days have none), or null. */
function nextOpening(locks: Map<PlainDate, { opensAt: string | null }>): string | null {
  const times = [...locks.values()].flatMap((l) => (l.opensAt ? [l.opensAt] : []));
  return times.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

/**
 * With no date chosen, picks the month's first available day once it has loaded; when the month has none, its first
 * day that opens later (it says when), else looks ahead month by month (at most 4 times, never past `max`).
 * `noneAtAll`: nothing bookable, and nothing about to open, was found.
 */
function useFirstAvailableDate({
  availability: { days, loaded, locks },
  month,
  min,
  max,
  date,
  onDateChange,
  onMonthChange,
}: Pick<
  SlotPickerProps,
  "availability" | "month" | "min" | "max" | "date" | "onDateChange" | "onMonthChange"
>) {
  const monthFirst = `${month}-01`;
  const monthLast = addDaysToPlainDate(`${addMonths(month, 1)}-01`, -1);
  const monthLoaded =
    loaded(monthFirst < min ? min : monthFirst) && loaded(monthLast > max ? max : monthLast);
  const [lookAheads, setLookAheads] = useState(0);
  const canLookAhead = lookAheads < 4 && `${addMonths(month, 1)}-01` <= max;
  useEffect(() => {
    if (date || !monthLoaded) return;
    const from = monthFirst < min ? min : monthFirst;
    const first = firstAvailableDate(days, from);
    const firstLocked = [...locks.keys()].filter((d) => d >= from && d <= monthLast).sort()[0];
    if (first && first <= monthLast) {
      onDateChange(first, "auto");
    } else if (firstLocked) {
      onDateChange(firstLocked, "auto");
    } else if (canLookAhead) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- bounded look-ahead for the first free day
      setLookAheads((n) => n + 1);
      onMonthChange(addMonths(month, 1));
    }
  }, [
    date,
    monthLoaded,
    days,
    locks,
    month,
    monthFirst,
    monthLast,
    min,
    canLookAhead,
    onDateChange,
    onMonthChange,
  ]);
  return {
    noneAtAll: !date && monthLoaded && !canLookAhead && !firstAvailableDate(days, min) && locks.size === 0,
  };
}

export function NoTimesAtAll() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-sunken/50 px-5 py-10 text-center">
      <p className="font-medium">No times available right now</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Nothing is open for online booking in the coming weeks. Please check back soon or contact the business
        directly.
      </p>
    </div>
  );
}

/** The chosen day's heading and times, or a way on to the next day (or month) with times. */
function DayTimes({
  date,
  timeZone,
  locale,
  currency,
  month,
  max,
  availability,
  selectedTime,
  onSelectSlot,
  onDateChange,
  onMonthChange,
}: Pick<
  SlotPickerProps,
  | "timeZone"
  | "locale"
  | "currency"
  | "month"
  | "max"
  | "availability"
  | "selectedTime"
  | "onSelectSlot"
  | "onDateChange"
  | "onMonthChange"
> & { date: PlainDate }) {
  const slots = availability.days.get(date) ?? [];
  const lock = availability.locks.get(date);
  const nextAvailable = firstAvailableDate(availability.days, addDaysToPlainDate(date, 1));
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">
          {formatDate(date, timeZone, "long", locale)}
        </h3>
        {availability.isFetching && (
          <span className="text-xs text-subtle-foreground" aria-live="polite">
            Updating…
          </span>
        )}
      </div>
      {slots.length > 0 ? (
        <SlotGrid
          slots={slots}
          timeZone={timeZone}
          locale={locale}
          currency={currency}
          selectedTime={selectedTime}
          onSelect={(slot) => onSelectSlot(slot, date, toTimeOfDay(slot.start, timeZone))}
        />
      ) : lock ? (
        <LockedDay
          date={date}
          opensAt={lock.opensAt}
          timeZone={timeZone}
          locale={locale}
          nextAvailable={nextAvailable}
          onNextAvailable={(d) => onDateChange(d, "user")}
        />
      ) : (
        <NoTimesOnDay
          nextAvailable={nextAvailable}
          timeZone={timeZone}
          locale={locale}
          month={month}
          max={max}
          onDateChange={onDateChange}
          onMonthChange={onMonthChange}
        />
      )}
    </>
  );
}

function NoTimesOnDay({
  nextAvailable,
  timeZone,
  locale,
  month,
  max,
  onDateChange,
  onMonthChange,
}: {
  nextAvailable: PlainDate | null;
  timeZone: string;
  locale?: string;
  month: PlainMonth;
  max: PlainDate;
  onDateChange: SlotPickerProps["onDateChange"];
  onMonthChange: (month: PlainMonth) => void;
}) {
  const nextMonth = addMonths(month, 1);
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-surface-sunken/50 p-5">
      <div>
        {/* The day is in the heading just above. */}
        <p className="font-medium">No free times on this day</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {nextAvailable ? "Pick another day, or go to the next one with free times." : "Try another date."}
        </p>
      </div>
      {nextAvailable ? (
        <Button variant="soft" size="sm" onClick={() => onDateChange(nextAvailable, "user")}>
          Next available: {formatRelativeDay(nextAvailable, timeZone, locale)}
          <ChevronRight />
        </Button>
      ) : (
        nextMonth <= max.slice(0, 7) && (
          <Button variant="soft" size="sm" onClick={() => onMonthChange(nextMonth)}>
            Check {formatDate(`${nextMonth}-01`, "UTC", "monthYear", locale)}
            <ChevronRight />
          </Button>
        )
      )}
    </div>
  );
}
