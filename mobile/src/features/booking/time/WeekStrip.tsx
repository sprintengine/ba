import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CalendarDays, ChevronLeft, ChevronRight, Lock } from "lucide-react-native";
import {
  addDaysToPlainDate,
  formatDate,
  isoWeekDates,
  startOfIsoWeek,
  type PlainDate,
  type PlainMonth,
} from "@shared/format";
import { Button, Icon, IconButton, Text, useTheme } from "~/ui";
import { borderWidth, MIN_TOUCH, radius, space } from "~/ui/tokens";
import { MonthCalendar, type DayMarks } from "./MonthCalendar";

/**
 * Phone date picker: a week of days with availability dots (the arrows for another week) and the month on demand,
 * as on the website's phone layout.
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
  marks,
}: {
  timeZone: string;
  locale?: string;
  min: PlainDate;
  max: PlainDate;
  date: PlainDate | null;
  month: PlainMonth;
  onMonthChange: (month: PlainMonth) => void;
  onDateChange: (date: PlainDate) => void;
  /** The week shown after the arrows (its Monday), so its days in another month get loaded too. */
  onWeekChange?: (weekStart: PlainDate) => void;
  marks: DayMarks;
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

  return (
    <View style={styles.root} testID="week-strip">
      <View style={styles.header}>
        {!showMonth ? (
          <Text variant="headline" style={styles.flex}>
            {formatDate(anchor < min ? min : anchor, "UTC", "monthYear", locale)}
          </Text>
        ) : (
          <View style={styles.flex} />
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={CalendarDays}
          label={showMonth ? "Week" : "Month"}
          accessibilityState={{ expanded: showMonth }}
          onPress={() => setShowMonth((v) => !v)}
        />
        {!showMonth ? (
          <>
            <IconButton
              icon={ChevronLeft}
              accessibilityLabel="Previous week"
              disabled={!canPrev}
              accessibilityState={{ disabled: !canPrev }}
              color={canPrev ? "foreground" : "subtleForeground"}
              onPress={() => go(-1)}
            />
            <IconButton
              icon={ChevronRight}
              accessibilityLabel="Next week"
              disabled={!canNext}
              accessibilityState={{ disabled: !canNext }}
              color={canNext ? "foreground" : "subtleForeground"}
              onPress={() => go(1)}
            />
          </>
        ) : null}
      </View>
      {showMonth ? (
        <MonthCalendar
          month={month}
          onMonthChange={onMonthChange}
          value={date}
          onSelect={(d) => {
            onDateChange(d);
            setShowMonth(false);
          }}
          min={min}
          max={max}
          timeZone={timeZone}
          locale={locale}
          marks={marks}
        />
      ) : (
        <View style={styles.days}>
          {dates.map((d) => (
            <WeekDay
              key={d}
              date={d}
              selected={d === date}
              disabled={d < min || d > max || marks.isDateDisabled(d)}
              marks={marks}
              timeZone={timeZone}
              locale={locale}
              onPress={() => onDateChange(d)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function WeekDay({
  date,
  selected,
  disabled,
  marks,
  timeZone,
  locale,
  onPress,
}: {
  date: PlainDate;
  selected: boolean;
  disabled: boolean;
  marks: DayMarks;
  timeZone: string;
  locale?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const locked = marks.isDateLocked(date);
  const marker = marks.hasMarker(date);
  const fg = selected ? colors.primaryForeground : colors.foreground;
  return (
    <Pressable
      testID={`day-${date}`}
      accessibilityRole="button"
      accessibilityLabel={[
        formatDate(date, timeZone, "long", locale),
        locked ? "not open for booking yet" : marker ? "free times" : disabled ? "no free times" : null,
      ]
        .filter(Boolean)
        .join(", ")}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.day,
        {
          backgroundColor: selected ? colors.primary : pressed ? colors.muted : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text
        variant="caption"
        style={{ color: selected ? fg : colors.subtleForeground }}
        maxFontSizeMultiplier={1.3}
      >
        {formatDate(date, timeZone, "weekday", locale)}
      </Text>
      <Text variant="headline" numeric style={{ color: fg }} maxFontSizeMultiplier={1.3}>
        {Number(date.slice(8))}
      </Text>
      {locked ? (
        <Icon icon={Lock} size={10} color={selected ? "primaryForeground" : "mutedForeground"} />
      ) : (
        <View
          style={[
            styles.dot,
            {
              backgroundColor: marker ? (selected ? colors.primaryForeground : colors.brand) : "transparent",
            },
          ]}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[2] },
  header: { flexDirection: "row", alignItems: "center", gap: space[1] },
  flex: { flex: 1 },
  days: { flexDirection: "row", gap: space[1] },
  day: {
    flex: 1,
    minHeight: MIN_TOUCH + space[6],
    alignItems: "center",
    justifyContent: "center",
    gap: space[0.5],
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
  },
  dot: { width: space[1], height: space[1], borderRadius: radius.full },
});
