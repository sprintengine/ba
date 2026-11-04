/**
 * Rescheduling a customer's booking (the website's ReschedulePanel): its own free times (same service, length and
 * customer group, its current time not counted as busy, a deal's schedule respected), as a calendar or, for businesses
 * that offer only their next available time, one time at a time. Shared by My bookings and the manage link.
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@shared/api/client";
import { useMyBookingAvailabilityWindows, useRescheduleMyBooking } from "@shared/api/hooks/use-me";
import { useMyBookingNextSlot, useManagedNextSlot, type NextSlot } from "@shared/api/hooks/use-next-slot";
import {
  useManagedAvailabilityWindows,
  useRescheduleManagedBooking,
  type AvailabilityWindows,
} from "@shared/api/hooks/use-public";
import type { CustomerBooking } from "@shared/api/types";
import { isSlotUnavailable } from "@shared/booking/errors";
import { nextSlotWindows } from "@shared/booking/next-slot";
import { pickerWindows } from "@shared/booking/windows";
import {
  addDaysToPlainDate,
  formatDate,
  formatTime,
  toPlainDate,
  toTimeOfDay,
  todayInTz,
  zonedToIso,
  type PlainDate,
} from "@shared/format";
import { Button, Sheet, Text, useToast } from "~/ui";
import { space } from "~/ui/tokens";
import { Callout } from "~/features/booking/Callout";
import { NextSlotPicker } from "~/features/booking/time/NextSlotPicker";
import { SlotPicker } from "~/features/booking/time/SlotPicker";

/** Picker state for rescheduling, and the windows to load (or, next available only, where to look from). */
export function useRescheduleState(timeZone: string, maxAdvanceDays: number) {
  const [today] = useState(() => todayInTz(timeZone));
  const max = addDaysToPlainDate(today, maxAdvanceDays);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState<PlainDate | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [shownWeek, setShownWeek] = useState<PlainDate | null>(null);
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
    windows: pickerWindows(month, date, today, max, shownWeek),
    after,
    setAfter,
    nextWindows: nextSlotWindows(today, max, after, timeZone),
  };
}

export type RescheduleState = ReturnType<typeof useRescheduleState>;

/** The website's default horizon when the business's own isn't known. */
const DEFAULT_MAX_ADVANCE_DAYS = 90;

/** Reschedule one of the signed-in customer's bookings, in a sheet. */
export function MyRescheduleSheet({
  booking,
  visible,
  onClose,
}: {
  booking: CustomerBooking;
  visible: boolean;
  onClose: () => void;
}) {
  const state = useRescheduleState(booking.timezone, DEFAULT_MAX_ADVANCE_DAYS);
  const availability = useMyBookingAvailabilityWindows(booking.id, state.windows, visible);
  const next = useMyBookingNextSlot(
    booking.id,
    state.nextWindows,
    state.after,
    visible && availability.nextAvailableOnly,
  );
  const reschedule = useRescheduleMyBooking();
  return (
    <RescheduleSheet
      booking={booking}
      visible={visible}
      onClose={onClose}
      state={state}
      availability={availability}
      next={next}
      pending={reschedule.isPending}
      reschedule={(start) => reschedule.mutateAsync({ id: booking.id, input: { start } })}
    />
  );
}

/** Reschedule a booking from its manage link (signed out), in a sheet. */
export function ManageRescheduleSheet({
  token,
  booking,
  maxAdvanceDays,
  visible,
  onClose,
}: {
  token: string;
  booking: CustomerBooking;
  maxAdvanceDays: number | null;
  visible: boolean;
  onClose: () => void;
}) {
  const state = useRescheduleState(booking.timezone, maxAdvanceDays ?? DEFAULT_MAX_ADVANCE_DAYS);
  const availability = useManagedAvailabilityWindows(token, visible ? state.windows : []);
  const next = useManagedNextSlot(
    token,
    state.nextWindows,
    state.after,
    visible && availability.nextAvailableOnly,
  );
  const reschedule = useRescheduleManagedBooking(token);
  return (
    <RescheduleSheet
      booking={booking}
      visible={visible}
      onClose={onClose}
      state={state}
      availability={availability}
      next={next}
      pending={reschedule.isPending}
      reschedule={(start) => reschedule.mutateAsync({ start })}
    />
  );
}

function RescheduleSheet({
  booking,
  visible,
  onClose,
  state,
  availability,
  next,
  pending,
  reschedule,
}: {
  booking: CustomerBooking;
  visible: boolean;
  onClose: () => void;
  state: RescheduleState;
  availability: AvailabilityWindows;
  next: NextSlot;
  pending: boolean;
  reschedule: (start: string) => Promise<unknown>;
}) {
  const toast = useToast();
  const tz = booking.timezone;
  const [error, setError] = useState<string | null>(null);
  const newStart = state.date && state.time ? zonedToIso(state.date, state.time, tz) : null;
  const same = newStart !== null && new Date(newStart).getTime() === new Date(booking.start).getTime();

  const close = () => {
    if (pending) return;
    setError(null);
    onClose();
  };
  const confirm = async (start: string) => {
    setError(null);
    try {
      await reschedule(start);
      toast.show(`Moved to ${formatDate(start, tz, "dayMonth")}, ${formatTime(start, tz)}`);
      onClose();
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
    <Sheet
      visible={visible}
      onClose={close}
      title={`Reschedule ${booking.service.name}`}
      testID="reschedule-sheet"
      footer={
        <View style={styles.footer}>
          <Button
            testID="reschedule-confirm"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!newStart || same}
            loading={pending}
            label={
              newStart && state.date && !same
                ? `Move to ${formatDate(state.date, tz, "dayMonth")}, ${formatTime(newStart, tz)}`
                : "Choose a new time"
            }
            onPress={() => newStart && void confirm(newStart)}
          />
          <Button variant="ghost" fullWidth label="Keep current time" disabled={pending} onPress={close} />
        </View>
      }
    >
      <Text variant="callout" tone="muted">
        With {booking.business.name} · currently {formatDate(booking.start, tz, "dayMonth")} at{" "}
        {formatTime(booking.start, tz)}
      </Text>
      {error ? (
        <Callout tone="warning" alert testID="reschedule-error">
          {error}
        </Callout>
      ) : null}
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
          onSelectSlot={(_slot, d, t) => {
            state.setDate(d);
            state.setTime(t);
          }}
          availability={availability}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({ footer: { gap: space[1] } });
