/**
 * Form pieces for dates, times and choices, used by the new-booking form, Reschedule, Block time, the bookings
 * filters and the calendar's date jump. Dates are plain business-timezone dates ("2026-10-15"); nothing here reads
 * the phone's clock or zone.
 */
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Check, ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  addDaysToPlainDate,
  addMonths,
  daysInMonth,
  DEFAULT_LOCALE,
  formatDate,
  isoWeekday,
  monthOf,
  parseTimeInput,
  type PlainDate,
} from "@shared/format";
import { Icon, IconButton, Text, TextField, useTheme, type IconComponent } from "~/ui";
import { borderWidth, MIN_TOUCH, radius, space } from "~/ui/tokens";
import { Chip } from "./parts";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * A month of days to pick from (Monday first), with previous/next month. Days outside `min`..`max` are disabled.
 * Each day is one button named with its full date ("Thursday 15 October 2026"), selected when chosen.
 */
export function MonthGrid({
  value,
  onChange,
  min,
  max,
  today,
  locale = DEFAULT_LOCALE,
  testID,
}: {
  value: PlainDate | null;
  onChange: (date: PlainDate) => void;
  min?: PlainDate;
  max?: PlainDate;
  today?: PlainDate;
  locale?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [month, setMonth] = useState(() => monthOf(value ?? today ?? min ?? "2026-01-01"));
  const first = `${month}-01`;
  const lead = isoWeekday(first) - 1;
  const count = daysInMonth(month);
  const cells: (PlainDate | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => addDaysToPlainDate(first, i)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const canPrev = !min || addMonths(month, -1) >= monthOf(min);
  const canNext = !max || addMonths(month, 1) <= monthOf(max);

  return (
    <View testID={testID} style={styles.month}>
      <View style={styles.monthHeader}>
        <Text variant="headline" style={styles.flex} accessibilityRole="header">
          {formatDate(first, "UTC", "monthYear", locale)}
        </Text>
        <IconButton
          icon={ChevronLeft}
          accessibilityLabel="Previous month"
          disabled={!canPrev}
          onPress={() => setMonth(addMonths(month, -1))}
        />
        <IconButton
          icon={ChevronRight}
          accessibilityLabel="Next month"
          disabled={!canNext}
          onPress={() => setMonth(addMonths(month, 1))}
        />
      </View>
      <View style={styles.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {WEEKDAY_SHORT.map((d) => (
          <Text key={d} variant="footnote" tone="subtle" align="center" style={styles.cell}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((date, i) => {
            if (!date) return <View key={i} style={styles.cell} />;
            const disabled = (!!min && date < min) || (!!max && date > max);
            const selected = date === value;
            const isToday = date === today;
            return (
              <Pressable
                key={date}
                testID={`day-${date}`}
                accessibilityRole="button"
                accessibilityLabel={`${formatDate(date, "UTC", "full", locale)}${isToday ? ", today" : ""}`}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onChange(date)}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    selected
                      ? { backgroundColor: colors.primary }
                      : isToday
                        ? { borderColor: colors.brand, borderWidth: borderWidth.focus }
                        : null,
                  ]}
                >
                  <Text
                    variant="callout"
                    weight={selected || isToday ? "semibold" : "regular"}
                    tone={selected ? "primaryForeground" : disabled ? "subtle" : "default"}
                    numeric
                    style={disabled ? styles.disabled : null}
                  >
                    {Number(date.slice(8))}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * The next fortnight as a row of day chips ("Thu 15"), scrolling sideways; "Other date…" opens a month. The quick way
 * to pick a day for a booking or a move.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  today,
  locale,
  testID,
}: {
  label: string;
  value: PlainDate;
  onChange: (date: PlainDate) => void;
  min?: PlainDate;
  today: PlainDate;
  locale?: string;
  testID?: string;
}) {
  const [monthOpen, setMonthOpen] = useState(false);
  const start = min && min > today ? min : today;
  const days = Array.from({ length: 14 }, (_, i) => addDaysToPlainDate(start, i));
  const shown = days.includes(value) ? days : [value, ...days.slice(0, 13)];
  return (
    <View style={styles.field} testID={testID}>
      <View style={styles.fieldHeader}>
        <Text variant="callout" weight="medium" style={styles.flex}>
          {label}
        </Text>
        <Text variant="callout" tone="muted">
          {formatDate(value, "UTC", "long", locale)}
        </Text>
      </View>
      <ChipRow accessibilityLabel={label}>
        {shown.map((d) => (
          <Chip
            key={d}
            role="radio"
            testID={`date-${d}`}
            label={d === today ? "Today" : `${formatDate(d, "UTC", "weekday", locale)} ${Number(d.slice(8))}`}
            accessibilityLabel={formatDate(d, "UTC", "full", locale)}
            selected={d === value}
            onPress={() => {
              setMonthOpen(false);
              onChange(d);
            }}
          />
        ))}
        <Chip
          label={monthOpen ? "Hide month" : "Other date…"}
          selected={false}
          onPress={() => setMonthOpen((o) => !o)}
          accessibilityHint="Shows a month to pick from"
        />
      </ChipRow>
      {monthOpen ? (
        <MonthGrid
          value={value}
          today={today}
          min={min}
          locale={locale}
          onChange={(d) => {
            setMonthOpen(false);
            onChange(d);
          }}
        />
      ) : null}
    </View>
  );
}

/** A horizontal row of chips (one-of choices, filters), scrolling sideways when it doesn't fit. */
export function ChipRow({
  children,
  accessibilityLabel,
  wrap = false,
}: {
  children: ReactNode;
  accessibilityLabel?: string;
  /** Wrap onto more lines instead of scrolling (a few choices on a wide screen). */
  wrap?: boolean;
}) {
  if (wrap) {
    return (
      <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.wrapRow}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.chipRow}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/**
 * A start time typed as the person likes ("930", "9.30", "2pm"), normalised to "HH:mm" when they leave the field.
 * `value` is the normalised time or null.
 */
export function TimeField({
  label,
  value,
  onChange,
  hint,
  error,
  testID,
}: {
  label: string;
  value: string | null;
  onChange: (time: string | null) => void;
  hint?: string;
  error?: string | null;
  testID?: string;
}) {
  const [text, setText] = useState(value ?? "");
  const [invalid, setInvalid] = useState(false);
  return (
    <TextField
      testID={testID}
      label={label}
      value={text}
      placeholder="09:30"
      keyboardType="numbers-and-punctuation"
      autoCorrect={false}
      returnKeyType="done"
      hint={hint}
      error={invalid ? "Enter a time like 09:30" : error}
      onChangeText={(t) => {
        setText(t);
        const parsed = parseTimeInput(t);
        setInvalid(false);
        onChange(parsed);
      }}
      onBlur={() => {
        const parsed = parseTimeInput(text);
        if (parsed) setText(parsed);
        setInvalid(!!text.trim() && !parsed);
      }}
    />
  );
}

/**
 * One choice in a list of choices (a service, an option, a payment mode): a radio row with a title, a detail line
 * and something on the right (a price), checked when chosen.
 */
export function ChoiceRow({
  title,
  detail,
  aside,
  leading,
  icon,
  selected,
  disabled,
  onPress,
  testID,
}: {
  title: string;
  detail?: string;
  aside?: string;
  leading?: ReactNode;
  icon?: IconComponent;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={[title, detail, aside].filter(Boolean).join(", ")}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected ? colors.brandSoft : pressed ? colors.muted : colors.surface,
          borderColor: selected ? colors.brand : colors.border,
          borderWidth: selected ? borderWidth.focus : borderWidth.hairline,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {leading ??
        (icon ? <Icon icon={icon} size={20} color={selected ? "brand" : "mutedForeground"} /> : null)}
      <View style={styles.flex}>
        <Text weight="medium">{title}</Text>
        {detail ? (
          <Text variant="callout" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {aside ? (
        <Text variant="callout" tone="muted" numeric>
          {aside}
        </Text>
      ) : null}
      {selected ? <Icon icon={Check} size={18} color="brand" /> : null}
    </Pressable>
  );
}

/** A labelled group of fields (a numbered step of a form, a section of a sheet). */
export function FieldGroup({
  title,
  step,
  children,
  testID,
}: {
  title: string;
  step?: number;
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.group} testID={testID}>
      <View style={styles.groupHeader}>
        {step !== undefined ? (
          <View style={[styles.step, { backgroundColor: colors.muted }]}>
            <Text variant="footnote" tone="muted" numeric>
              {step}
            </Text>
          </View>
        ) : null}
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  month: { gap: space[1] },
  monthHeader: { flexDirection: "row", alignItems: "center" },
  week: { flexDirection: "row" },
  cell: { flex: 1, minHeight: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  day: {
    width: MIN_TOUCH - space[1],
    height: MIN_TOUCH - space[1],
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  field: { gap: space[2] },
  fieldHeader: { flexDirection: "row", alignItems: "center", gap: space[2] },
  chipRow: { gap: space[2], paddingVertical: space[0.5] },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  choice: {
    minHeight: MIN_TOUCH + space[2],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2.5],
    borderRadius: radius.lg,
  },
  group: { gap: space[3] },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: space[2] },
  step: {
    width: space[6],
    height: space[6],
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
