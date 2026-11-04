/**
 * Date and time fields with the platform's own pickers (@react-native-community/datetimepicker): the compact
 * UIDatePicker on iOS and iPadOS (a button that opens the system calendar or time wheel), the Material dialog on
 * Android. Values are plain strings, never instants: a date is "YYYY-MM-DD" and a time "HH:MM", in the business's
 * timezone by construction (the picker works in the phone's local time, and we only read the fields back).
 */
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { CalendarDays, Clock, X } from "lucide-react-native";
import { formatDate } from "@shared/format";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { borderWidth, MIN_TOUCH, radius, space } from "./tokens";

type MinuteInterval = 1 | 5 | 10 | 15 | 30;

type Common = {
  label: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  /** Also the testID of the native picker (`${testID}-picker`) for tests. */
  testID?: string;
};

export type DateFieldProps = Common & {
  /** "YYYY-MM-DD", or null when the field is empty (only with `clearable`). */
  value: string | null;
  onChange: (value: string | null) => void;
  min?: string | null;
  max?: string | null;
  /** May be left empty: shows "Add" when empty and a clear button when set. */
  clearable?: boolean;
  /** The date an empty field starts at when opened. */
  defaultDate?: string;
  /** Formats the value on Android and for screen readers (default: "1 Oct 2026"). */
  locale?: string;
};

export type TimeFieldProps = Common & {
  /** "HH:MM" (24-hour). */
  value: string;
  onChange: (value: string) => void;
  minuteInterval?: MinuteInterval;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-01" → a local Date at noon (a day's middle is never in a DST gap). */
export function plainDateToLocal(value: string): Date {
  const [y = 1970, m = 1, d = 1] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function localToPlainDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "09:30" → a local Date on a day without DST changes. */
export function timeToLocal(value: string): Date {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return new Date(2001, 0, 1, h, m, 0, 0);
}

export function localToTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function today(): string {
  return localToPlainDate(new Date());
}

export function DateField({
  label,
  hint,
  error,
  disabled,
  testID,
  value,
  onChange,
  min,
  max,
  clearable,
  defaultDate,
  locale,
}: DateFieldProps) {
  const shown = value ? formatDate(value, "UTC", "medium", locale) : null;
  const start = value ?? defaultDate ?? today();
  const open = () =>
    DateTimePickerAndroid.open({
      value: plainDateToLocal(start),
      mode: "date",
      minimumDate: min ? plainDateToLocal(min) : undefined,
      maximumDate: max ? plainDateToLocal(max) : undefined,
      onValueChange: (_event, date) => onChange(localToPlainDate(date)),
    });
  return (
    <FieldRow label={label} hint={hint} error={error}>
      {value === null ? (
        <Button
          testID={testID}
          label="Add"
          variant="secondary"
          size="sm"
          icon={CalendarDays}
          accessibilityLabel={`${label}: not set. Add`}
          disabled={disabled}
          onPress={() => (Platform.OS === "android" ? open() : onChange(start))}
        />
      ) : Platform.OS === "ios" ? (
        <DateTimePicker
          testID={testID ? `${testID}-picker` : undefined}
          accessibilityLabel={`${label}: ${shown}`}
          value={plainDateToLocal(value)}
          mode="date"
          display="compact"
          locale={locale}
          minimumDate={min ? plainDateToLocal(min) : undefined}
          maximumDate={max ? plainDateToLocal(max) : undefined}
          disabled={disabled}
          onValueChange={(_event, date) => onChange(localToPlainDate(date))}
        />
      ) : (
        <AndroidButton
          testID={testID}
          label={label}
          text={shown ?? ""}
          icon="date"
          disabled={disabled}
          onPress={open}
        />
      )}
      {clearable && value !== null ? (
        <IconButton
          icon={X}
          size={18}
          color="mutedForeground"
          accessibilityLabel={`Clear ${label}`}
          disabled={disabled}
          onPress={() => onChange(null)}
        />
      ) : null}
    </FieldRow>
  );
}

export function TimeField({
  label,
  hint,
  error,
  disabled,
  testID,
  value,
  onChange,
  minuteInterval = 5,
}: TimeFieldProps) {
  const open = () =>
    DateTimePickerAndroid.open({
      value: timeToLocal(value),
      mode: "time",
      is24Hour: true,
      onValueChange: (_event, date) => onChange(localToTime(date)),
    });
  return (
    <FieldRow label={label} hint={hint} error={error}>
      {Platform.OS === "ios" ? (
        <DateTimePicker
          testID={testID ? `${testID}-picker` : undefined}
          accessibilityLabel={`${label}: ${value}`}
          value={timeToLocal(value)}
          mode="time"
          display="compact"
          // 24-hour like the website's time inputs (en-GB writes 09:30).
          locale="en-GB"
          minuteInterval={minuteInterval}
          disabled={disabled}
          onValueChange={(_event, date) => onChange(localToTime(date))}
        />
      ) : (
        <AndroidButton
          testID={testID}
          label={label}
          text={value}
          icon="time"
          disabled={disabled}
          onPress={open}
        />
      )}
    </FieldRow>
  );
}

/** Label (and hint or error) on the left, the control on the right, like a Settings row. */
function FieldRow({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  const help = error ?? hint;
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <View style={styles.label}>
          <Text variant="callout" weight="medium">
            {label}
          </Text>
        </View>
        <View style={styles.control}>{children}</View>
      </View>
      {help ? (
        <Text
          variant="footnote"
          tone={error ? "danger" : "subtle"}
          accessibilityLiveRegion={error ? "polite" : "none"}
        >
          {help}
        </Text>
      ) : null}
    </View>
  );
}

function AndroidButton({
  testID,
  label,
  text,
  icon,
  disabled,
  onPress,
}: {
  testID?: string;
  label: string;
  text: string;
  icon: "date" | "time";
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${text}`}
      accessibilityHint="Opens a picker"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? colors.muted : colors.surface,
          borderColor: colors.input,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Icon icon={icon === "date" ? CalendarDays : Clock} size={16} color="mutedForeground" />
      <Text numeric>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[1] },
  row: { minHeight: MIN_TOUCH, flexDirection: "row", alignItems: "center", gap: space[3] },
  label: { flex: 1 },
  control: { flexDirection: "row", alignItems: "center", gap: space[1] },
  button: {
    minHeight: MIN_TOUCH - space[1],
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    paddingHorizontal: space[3],
  },
});
