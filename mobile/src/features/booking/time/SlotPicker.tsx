import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { AvailabilityWindows } from "@shared/api/hooks/use-public";
import type { Slot } from "@shared/api/types";
import { firstAvailableDate } from "@shared/booking/windows";
import {
  addDaysToPlainDate,
  addMonths,
  formatDate,
  formatRelativeDay,
  toTimeOfDay,
  type PlainDate,
  type PlainMonth,
} from "@shared/format";
import { Button, ErrorState, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { Callout } from "../Callout";
import { LockedDay } from "./LockedDay";
import { MonthCalendar, type DayMarks } from "./MonthCalendar";
import { nextOpening, useRefetchAt } from "./refetch";
import { SlotGrid, SlotsSkeleton } from "./SlotGrid";
import { TimezoneNote } from "./TimezoneNote";
import { WeekStrip } from "./WeekStrip";

export type SlotPickerProps = {
  timeZone: string;
  locale?: string;
  min: PlainDate;
  max: PlainDate;
  month: PlainMonth;
  onMonthChange: (month: PlainMonth) => void;
  date: PlainDate | null;
  onDateChange: (date: PlainDate, reason: "user" | "auto") => void;
  /** The phone week strip's shown week (its Monday) after the arrows; see `pickerWindows`. */
  onWeekChange?: (weekStart: PlainDate) => void;
  /** The chosen time ("HH:mm" in `timeZone`). */
  selectedTime: string | null;
  onSelectSlot: (slot: Slot, date: PlainDate, time: string) => void;
  availability: AvailabilityWindows;
  /** Above the times (e.g. "that time was just taken"). */
  notice?: ReactNode;
  /** Shows deal prices on discounted times (§19). */
  currency?: string;
};

/** From this width the month calendar sits beside the day's times. */
const SIDE_BY_SIDE = 640;
/** From this width there is room for the month calendar (above the times); narrower, the week strip. */
const MONTH_VIEW = 420;

/**
 * Date and time over availability windows, laid out by its own width like the website's picker: wide (iPad), the month
 * calendar beside the day's times; medium, the calendar above them; phones, a week strip (the month on demand). Times
 * are always in the business timezone.
 */
export function SlotPicker(props: SlotPickerProps) {
  const { timeZone, locale, min, max, month, onMonthChange, date, onDateChange, availability, notice } =
    props;
  const { days, loaded, locks } = availability;
  const [width, setWidth] = useState(0);
  const { noneAtAll } = useFirstAvailableDate(props);
  const marks: DayMarks = {
    hasMarker: (d) => (days.get(d)?.length ?? 0) > 0,
    // A day a release keeps closed stays selectable: it says when it opens.
    isDateLocked: (d) => locks.has(d),
    isDateDisabled: (d) => loaded(d) && (days.get(d)?.length ?? 0) === 0 && !locks.has(d),
  };
  // A closed day opening while the screen is open shows its times without a reload.
  useRefetchAt(nextOpening(locks), availability.refetch);

  const calendar =
    width >= MONTH_VIEW ? (
      <View style={styles.calendar}>
        <MonthCalendar
          month={month}
          onMonthChange={onMonthChange}
          value={date}
          onSelect={(d) => onDateChange(d, "user")}
          min={min}
          max={max}
          timeZone={timeZone}
          locale={locale}
          marks={marks}
        />
        <TimezoneNote timeZone={timeZone} />
      </View>
    ) : (
      <WeekStrip
        timeZone={timeZone}
        locale={locale}
        min={min}
        max={max}
        date={date}
        month={month}
        onMonthChange={onMonthChange}
        onDateChange={(d) => onDateChange(d, "user")}
        onWeekChange={props.onWeekChange}
        marks={marks}
      />
    );

  const times =
    availability.isError && availability.days.size === 0 ? (
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
      <DayTimes {...props} date={date} />
    );

  return (
    <View style={styles.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="slot-picker">
      {notice}
      <View style={width >= SIDE_BY_SIDE ? styles.side : styles.stack}>
        {width > 0 ? calendar : null}
        <View style={styles.times}>
          {times}
          {width > 0 && width < MONTH_VIEW ? <TimezoneNote timeZone={timeZone} /> : null}
        </View>
      </View>
    </View>
  );
}

/**
 * With no date chosen, picks the month's first available day once it has loaded; when the month has none, its first
 * day that opens later, else looks ahead month by month (at most 4 times, never past `max`). `noneAtAll`: nothing
 * bookable, and nothing about to open, was found. (The website's logic, unchanged.)
 */
function useFirstAvailableDate({
  availability: { days, loaded, locks },
  month,
  min,
  max,
  date,
  onDateChange,
  onMonthChange,
}: SlotPickerProps) {
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
    <Callout tone="dashed" icon={null} title="No times available right now" testID="no-times">
      Nothing is open for online booking in the coming weeks. Please check back soon or contact the business
      directly.
    </Callout>
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
}: SlotPickerProps & { date: PlainDate }) {
  const slots = availability.days.get(date) ?? [];
  const lock = availability.locks.get(date);
  const nextAvailable = firstAvailableDate(availability.days, addDaysToPlainDate(date, 1));
  const nextMonth = addMonths(month, 1);
  return (
    <View style={styles.day}>
      <View style={styles.dayHeader}>
        <Text variant="headline" accessibilityRole="header" style={styles.flex}>
          {formatDate(date, timeZone, "long", locale)}
        </Text>
        {availability.isFetching ? (
          <Text variant="footnote" tone="subtle" accessibilityLiveRegion="polite">
            Updating…
          </Text>
        ) : null}
      </View>
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
        <Callout
          tone="dashed"
          icon={null}
          title="No free times on this day"
          testID="no-times-on-day"
          action={
            nextAvailable ? (
              <Button
                variant="secondary"
                size="sm"
                icon={ChevronRight}
                label={`Next available: ${formatRelativeDay(nextAvailable, timeZone, locale)}`}
                onPress={() => onDateChange(nextAvailable, "user")}
              />
            ) : nextMonth <= max.slice(0, 7) ? (
              <Button
                variant="secondary"
                size="sm"
                icon={ChevronRight}
                label={`Check ${formatDate(`${nextMonth}-01`, "UTC", "monthYear", locale)}`}
                onPress={() => onMonthChange(nextMonth)}
              />
            ) : null
          }
        >
          {nextAvailable ? "Pick another day, or go to the next one with free times." : "Try another date."}
        </Callout>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[5] },
  side: { flexDirection: "row", gap: space[8], alignItems: "flex-start" },
  stack: { gap: space[6] },
  calendar: { gap: space[4], minWidth: 300, maxWidth: 420, flexShrink: 0 },
  times: { flex: 1, gap: space[4], minWidth: 0 },
  day: { gap: space[4] },
  dayHeader: { flexDirection: "row", alignItems: "baseline", gap: space[3] },
  flex: { flex: 1 },
});
