"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import type { AvailabilityWindows, NextSlot } from "@/lib/api/hooks";
import type { CustomerBooking } from "@/lib/api/types";
import { isSlotUnavailable } from "@/lib/booking/errors";
import { nextSlotWindows } from "@/lib/booking/next-slot";
import { pickerWindows, type DateWindow } from "@/lib/booking/windows";
import {
  addDaysToPlainDate,
  formatDate,
  formatTime,
  toPlainDate,
  toTimeOfDay,
  todayInTz,
  zonedToIso,
  type PlainDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { NextSlotPicker } from "./next-slot-picker";
import { SlotPicker } from "./slot-picker";

/**
 * Picker state for rescheduling; returns the windows to load. For a business that offers its next available time
 * only, `after` and `nextWindows` drive the next-time search instead.
 */
export function useRescheduleState(timeZone: string, maxAdvanceDays: number) {
  const today = todayInTz(timeZone);
  const max = addDaysToPlainDate(today, maxAdvanceDays);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState<PlainDate | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  /** The phone week strip's week when moved away from the date's (null: the date's week). */
  const [shownWeek, setShownWeek] = useState<PlainDate | null>(null);
  const windows: DateWindow[] = pickerWindows(month, date, today, max, shownWeek);
  const nextWindows = nextSlotWindows(today, max, after, timeZone);
  return {
    today,
    max,
    month,
    setMonth,
    date,
    setDate,
    time,
    setTime,
    setShownWeek,
    windows,
    after,
    setAfter,
    nextWindows,
  };
}

export type RescheduleState = ReturnType<typeof useRescheduleState>;

/**
 * The customer's "choose a new time" picker, shared by the manage page and My bookings. Runs `reschedule`
 * with the new start and calls `onDone` after a success toast; when the time was just taken it says so,
 * clears the time and refreshes the availability.
 */
export function ReschedulePanel({
  booking,
  state,
  availability,
  next,
  reschedule,
  onDone,
  onCancel,
  pending,
  inDialog = false,
}: {
  booking: CustomerBooking;
  state: RescheduleState;
  availability: AvailabilityWindows;
  /** The next free time, shown instead of the calendar when `availability` says the business offers only that. */
  next: NextSlot;
  reschedule: (start: string) => Promise<unknown>;
  onDone: () => void;
  onCancel: () => void;
  pending: boolean;
  /** In a dialog the footer sticks to the dialog's body and the "currently" line is in the dialog header. */
  inDialog?: boolean;
}) {
  const tz = booking.timezone;
  const [error, setError] = useState<string | null>(null);
  const current = toPlainDate(booking.start, tz);
  const newStart = state.date && state.time ? zonedToIso(state.date, state.time, tz) : null;
  const same = newStart !== null && new Date(newStart).getTime() === new Date(booking.start).getTime();

  const confirm = async (start: string) => {
    setError(null);
    try {
      await reschedule(start);
      toast.success(`Moved to ${formatDate(start, tz, "dayMonth")}, ${formatTime(start, tz)}`);
      onDone();
    } catch (err) {
      if (isSlotUnavailable(err)) {
        setError("That time was just taken. We've refreshed the available times.");
        state.setTime(null);
        availability.refetch();
        next.refetch();
      } else {
        setError(errorMessage(err));
      }
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {!inDialog && (
        <p className="text-sm text-muted-foreground">
          Currently {formatDate(current, tz, "long")} at {formatTime(booking.start, tz)}. Pick a new time
          below.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-warning-border bg-warning-soft p-4 text-sm text-warning-soft-foreground"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}
      {availability.nextAvailableOnly ? (
        <NextSlotPicker
          timeZone={tz}
          next={next}
          stepped={state.after !== null}
          selected={
            !!next.slot &&
            state.date === toPlainDate(next.slot.start, tz) &&
            state.time === toTimeOfDay(next.slot.start, tz)
          }
          chooseLabel="Choose this time"
          onChoose={(slot) => {
            state.setDate(toPlainDate(slot.start, tz));
            state.setTime(toTimeOfDay(slot.start, tz));
          }}
          onLater={(slot) => {
            state.setTime(null);
            state.setAfter(slot.start);
          }}
          onEarliest={() => {
            state.setTime(null);
            state.setAfter(null);
          }}
        />
      ) : (
        <SlotPicker
          timeZone={tz}
          min={state.today}
          max={state.max}
          month={state.month}
          onMonthChange={state.setMonth}
          date={state.date}
          onDateChange={(d) => {
            state.setDate(d);
            state.setTime(null);
            state.setShownWeek(null);
            if (d.slice(0, 7) !== state.month) state.setMonth(d.slice(0, 7));
          }}
          selectedTime={state.time}
          onWeekChange={state.setShownWeek}
          onSelectSlot={(_s, d, t) => {
            state.setDate(d);
            state.setTime(t);
          }}
          availability={availability}
        />
      )}
      <div
        className={cn(
          "sticky z-10 flex flex-col-reverse gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-end",
          inDialog
            ? // At the bottom of the dialog's scrolling body, over its padding, so it stays in reach on a phone.
              "-bottom-3 -mx-6 bg-surface-raised px-6 pb-3"
            : // Above the home indicator while it sticks to the bottom of the screen.
              "bottom-0 -mx-1 bg-background/90 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur",
        )}
      >
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Keep current time
        </Button>
        <Button
          variant="primary"
          disabled={!newStart || same}
          loading={pending}
          onClick={() => newStart && void confirm(newStart)}
        >
          {newStart && state.date && !same
            ? `Move to ${formatDate(state.date, tz, "dayMonth")}, ${formatTime(newStart, tz)}`
            : "Choose a new time"}
        </Button>
      </div>
    </div>
  );
}
