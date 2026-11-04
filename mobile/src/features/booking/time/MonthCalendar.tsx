import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react-native";
import {
  addDaysToPlainDate,
  addMonths,
  daysInMonth,
  formatDate,
  isoWeekday,
  type PlainDate,
  type PlainMonth,
} from "@shared/format";
import { Icon, IconButton, Text, useTheme } from "~/ui";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";

export type DayMarks = {
  /** The day has free times. */
  hasMarker: (date: PlainDate) => boolean;
  /** Loaded and nothing bookable (not a day that opens later). */
  isDateDisabled: (date: PlainDate) => boolean;
  /** Closed by a release schedule; still selectable, it says when it opens. */
  isDateLocked: (date: PlainDate) => boolean;
};

/** Monday-first weeks of a month: dates, with null before the 1st and after the last day. */
export function monthGrid(month: PlainMonth): (PlainDate | null)[][] {
  const first = `${month}-01`;
  const lead = isoWeekday(first) - 1;
  const total = daysInMonth(month);
  const cells: (PlainDate | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => addDaysToPlainDate(first, i)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (PlainDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A month of days with availability dots, for choosing a date (iPad, and the phone's month view). */
export function MonthCalendar({
  month,
  onMonthChange,
  value,
  onSelect,
  min,
  max,
  timeZone,
  locale,
  marks,
}: {
  month: PlainMonth;
  onMonthChange: (month: PlainMonth) => void;
  value: PlainDate | null;
  onSelect: (date: PlainDate) => void;
  min: PlainDate;
  max: PlainDate;
  timeZone: string;
  locale?: string;
  marks: DayMarks;
}) {
  const [width, setWidth] = useState(0);
  // Seven across the width (44pt or more from a 308pt-wide column, which every phone but the smallest has).
  const cell = width > 0 ? Math.min(Math.floor(width / 7), MIN_TOUCH + space[4]) : MIN_TOUCH;
  const canBack = `${month}-01` > min;
  const canForward = `${addMonths(month, 1)}-01` <= max;
  const title = formatDate(`${month}-01`, "UTC", "monthYear", locale);
  return (
    <View testID="month-calendar" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header" accessibilityLiveRegion="polite">
          {title}
        </Text>
        <View style={styles.arrows}>
          <IconButton
            icon={ChevronLeft}
            accessibilityLabel="Previous month"
            disabled={!canBack}
            accessibilityState={{ disabled: !canBack }}
            color={canBack ? "foreground" : "subtleForeground"}
            onPress={() => onMonthChange(addMonths(month, -1))}
          />
          <IconButton
            icon={ChevronRight}
            accessibilityLabel="Next month"
            disabled={!canForward}
            accessibilityState={{ disabled: !canForward }}
            color={canForward ? "foreground" : "subtleForeground"}
            onPress={() => onMonthChange(addMonths(month, 1))}
          />
        </View>
      </View>
      <View style={styles.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {WEEKDAYS.map((d) => (
          <View key={d} style={[styles.weekday, { width: cell }]}>
            <Text variant="caption" tone="subtle" maxFontSizeMultiplier={1.3}>
              {d}
            </Text>
          </View>
        ))}
      </View>
      {monthGrid(month).map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((date, j) =>
            date ? (
              <DayCell
                key={date}
                date={date}
                size={cell}
                selected={date === value}
                outOfRange={date < min || date > max}
                marks={marks}
                timeZone={timeZone}
                locale={locale}
                onSelect={onSelect}
              />
            ) : (
              <View key={`blank-${j}`} style={{ width: cell, height: cell }} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function DayCell({
  date,
  size,
  selected,
  outOfRange,
  marks,
  timeZone,
  locale,
  onSelect,
}: {
  date: PlainDate;
  size: number;
  selected: boolean;
  outOfRange: boolean;
  marks: DayMarks;
  timeZone: string;
  locale?: string;
  onSelect: (date: PlainDate) => void;
}) {
  const { colors } = useTheme();
  const locked = marks.isDateLocked(date);
  const disabled = outOfRange || marks.isDateDisabled(date);
  const marker = marks.hasMarker(date);
  const label = [
    formatDate(date, timeZone, "long", locale),
    locked ? "not open for booking yet" : marker ? "free times" : disabled ? "no free times" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Pressable
      testID={`day-${date}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => onSelect(date)}
      style={({ pressed }) => [
        styles.day,
        {
          width: size,
          height: size,
          backgroundColor: selected ? colors.brand : pressed ? colors.muted : "transparent",
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <Text
        variant="callout"
        weight={selected || marker ? "semibold" : "regular"}
        numeric
        style={{ color: selected ? colors.brandForeground : colors.foreground }}
        maxFontSizeMultiplier={1.4}
      >
        {Number(date.slice(8))}
      </Text>
      {locked ? (
        <Icon icon={Lock} size={10} color={selected ? "brandForeground" : "mutedForeground"} />
      ) : (
        <View
          style={[
            styles.dot,
            { backgroundColor: marker ? (selected ? colors.brandForeground : colors.brand) : "transparent" },
          ]}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: space[2],
  },
  arrows: { flexDirection: "row" },
  week: { flexDirection: "row" },
  weekday: { alignItems: "center", paddingVertical: space[1] },
  day: { alignItems: "center", justifyContent: "center", borderRadius: radius.full, gap: space[0.5] },
  dot: { width: space[1], height: space[1], borderRadius: radius.full },
});
