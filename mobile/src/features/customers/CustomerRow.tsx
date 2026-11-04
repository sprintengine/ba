import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Customer } from "@shared/api/types";
import { Badge, Text, useTheme } from "~/ui";
import { MIN_TOUCH, space } from "~/ui/tokens";
import type { Fmt } from "~/features/bookings/fmt";
import { PersonAvatar } from "~/features/bookings/parts";

export type CustomerRowProps = {
  customer: Customer;
  fmt: Fmt;
  onOpen: (id: string) => void;
  /** "3 appointments": the business's word for bookings, counted. */
  countLabel: (n: number) => string;
  groupName?: string;
  selected?: boolean;
};

/** A customer in the list: name, how to reach them, group, how many bookings and when they last came. */
export const CustomerRow = memo(function CustomerRow({
  customer: c,
  fmt,
  onOpen,
  countLabel,
  groupName,
  selected,
}: CustomerRowProps) {
  const { colors } = useTheme();
  const contact = c.email ?? c.phone ?? "No contact details";
  const last = c.lastBookingAt ? `Last ${fmt.date(c.lastBookingAt, "medium")}` : null;
  const label = [
    c.name,
    c.hasAccount ? "Has an account" : null,
    contact,
    groupName,
    countLabel(c.bookingCount),
    last,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <Pressable
      testID={`customer-row-${c.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={() => onOpen(c.id)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: selected ? colors.brandSoft : pressed ? colors.muted : colors.surface },
      ]}
    >
      <PersonAvatar name={c.name} />
      <View style={styles.body}>
        <View style={styles.line}>
          <Text weight="medium" numberOfLines={1} style={styles.shrink}>
            {c.name}
          </Text>
          {c.hasAccount ? <Badge label="Account" tone="brand" /> : null}
        </View>
        <Text variant="callout" tone={c.email || c.phone ? "muted" : "subtle"} numberOfLines={1}>
          {contact}
        </Text>
        {groupName ? (
          <View style={styles.line}>
            <Badge label={groupName} />
          </View>
        ) : null}
      </View>
      <View style={styles.aside}>
        <Text variant="callout" weight="medium" numeric>
          {c.bookingCount}
        </Text>
        {c.lastBookingAt ? (
          <Text variant="footnote" tone="subtle" numeric>
            {fmt.date(c.lastBookingAt, "dayMonth")}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + space[4],
    flexDirection: "row",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    alignItems: "center",
  },
  body: { flex: 1, gap: space[0.5] },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  shrink: { flexShrink: 1 },
  aside: { alignItems: "flex-end", gap: space[0.5] },
});
