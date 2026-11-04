import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Booking } from "@shared/api/types";
import { BOOKING_STATUS, PAYMENT_STATUS } from "@shared/status";
import { Text, useTheme } from "~/ui";
import { MIN_TOUCH, space } from "~/ui/tokens";
import type { Fmt } from "./fmt";
import { ColorDot, PersonAvatar, StatusBadges } from "./parts";

export type BookingRowProps = {
  booking: Booking;
  fmt: Fmt;
  onOpen: (id: string) => void;
  selected?: boolean;
  /** Payment status too (wide screens). */
  showPayment?: boolean;
  /** "Today, 10:00" (lists across days) or the time range only (a customer's day, Today). */
  when?: "relative" | "date";
};

/** A booking in a list: who, when, what and its status; one button that reads as a sentence. */
export const BookingRow = memo(function BookingRow({
  booking: b,
  fmt,
  onOpen,
  selected,
  showPayment,
  when = "relative",
}: BookingRowProps) {
  const { colors } = useTheme();
  const time =
    when === "relative"
      ? `${fmt.relDay(b.start)}, ${fmt.time(b.start)}`
      : `${fmt.date(b.start, "dayMonthYear")}`;
  const service = b.option ? `${b.service.name} · ${b.option.name}` : b.service.name;
  const label = [
    b.customer.name,
    `${when === "relative" ? fmt.relDay(b.start) : fmt.date(b.start, "long")}, ${fmt.range(b.start, b.end)}`,
    service,
    b.resources.length ? `with ${b.resources.map((r) => r.name).join(", ")}` : null,
    BOOKING_STATUS[b.status].label,
    showPayment ? PAYMENT_STATUS[b.paymentStatus].label : null,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <Pressable
      testID={`booking-row-${b.reference}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={() => onOpen(b.id)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: selected ? colors.brandSoft : pressed ? colors.muted : colors.surface },
      ]}
    >
      <PersonAvatar name={b.customer.name} />
      <View style={styles.body}>
        <View style={styles.line}>
          <Text weight="medium" numberOfLines={1} style={styles.flex}>
            {b.customer.name}
          </Text>
          <Text variant="footnote" tone="muted" numeric>
            {time}
          </Text>
        </View>
        <View style={styles.line}>
          <ColorDot color={b.service.color} size={space[2]} />
          <Text variant="callout" tone="muted" numberOfLines={1} style={styles.flex}>
            {when === "date" ? `${fmt.range(b.start, b.end)} · ${service}` : service}
          </Text>
        </View>
        <StatusBadges status={b.status} payment={showPayment ? b.paymentStatus : undefined} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + space[6],
    flexDirection: "row",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    alignItems: "flex-start",
  },
  body: { flex: 1, gap: space[1] },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  flex: { flex: 1 },
});
