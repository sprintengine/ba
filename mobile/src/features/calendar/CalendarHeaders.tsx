import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { PlainDate } from "@shared/format";
import { Skeleton, Text, useTheme } from "~/ui";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";
import type { Fmt } from "~/features/bookings/fmt";
import { ColorDot } from "~/features/bookings/parts";
import { GUTTER } from "./TimeGrid";
import type { CalendarColumn } from "./useCalendarData";

const shown = (c: CalendarColumn) => c.bookings.filter((b) => b.status !== "cancelled").length;

/** One header per column: a resource (its colour, name, how booked) or a day (tap to open it). */
export const CalendarHeaderRow = memo(function CalendarHeaderRow({
  columns,
  today,
  loading,
  fmt,
  onOpenDay,
}: {
  columns: CalendarColumn[];
  today: PlainDate;
  loading: boolean;
  fmt: Fmt;
  onOpenDay: (date: PlainDate) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.gutter} />
      {loading
        ? [0, 1, 2].map((i) => (
            <View key={i} style={[styles.cell, { borderLeftColor: colors.border }]}>
              <Skeleton height={14} width="70%" />
            </View>
          ))
        : columns.map((c) =>
            c.resource ? (
              <View
                key={c.key}
                accessible
                accessibilityRole="header"
                accessibilityLabel={`${c.resource.name}, ${
                  !c.resource.isActive ? "inactive, " : c.open.length === 0 ? "not working, " : ""
                }${shown(c)} booked`}
                style={[styles.cell, { borderLeftColor: colors.border }]}
              >
                <View style={styles.line}>
                  <ColorDot color={c.resource.color} />
                  <Text variant="callout" weight="semibold" numberOfLines={1} style={styles.flex}>
                    {c.resource.name}
                  </Text>
                </View>
                <Text variant="caption" tone="muted" numeric numberOfLines={1}>
                  {!c.resource.isActive
                    ? `Inactive · ${shown(c)} booked`
                    : c.open.length === 0
                      ? "Not working"
                      : `${shown(c)} booked`}
                </Text>
              </View>
            ) : (
              <Pressable
                key={c.key}
                testID={`day-header-${c.date}`}
                accessibilityRole="button"
                accessibilityLabel={`${fmt.date(c.date, "long")}${c.date === today ? ", today" : ""}, ${shown(c)} booked`}
                accessibilityHint="Opens the day"
                onPress={() => onOpenDay(c.date)}
                style={({ pressed }) => [
                  styles.cell,
                  styles.dayCell,
                  { borderLeftColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent" },
                ]}
              >
                <Text
                  variant="caption"
                  tone={c.date === today ? "brand" : "muted"}
                  maxFontSizeMultiplier={1.3}
                >
                  {fmt.date(c.date, "weekday")}
                </Text>
                <View style={[styles.dayNumber, c.date === today ? { backgroundColor: colors.brand } : null]}>
                  <Text
                    variant="callout"
                    weight="semibold"
                    numeric
                    tone={c.date === today ? "brandForeground" : "default"}
                    maxFontSizeMultiplier={1.3}
                  >
                    {Number(c.date.slice(8))}
                  </Text>
                </View>
                <Text variant="caption" tone="subtle" numeric maxFontSizeMultiplier={1.3}>
                  {shown(c) > 0 ? shown(c) : "—"}
                </Text>
              </Pressable>
            ),
          )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  gutter: { width: GUTTER },
  cell: {
    flex: 1,
    minHeight: MIN_TOUCH + space[2],
    justifyContent: "center",
    paddingHorizontal: space[2],
    paddingVertical: space[1.5],
    borderLeftWidth: StyleSheet.hairlineWidth,
    gap: space[0.5],
  },
  dayCell: { alignItems: "center", paddingHorizontal: space[0.5] },
  dayNumber: {
    width: space[8],
    height: space[8],
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { flexDirection: "row", alignItems: "center", gap: space[1.5] },
  flex: { flex: 1 },
});
