import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { CustomerBooking } from "@shared/api/types";
import { bookingMinutes, shortAddress, showsPaymentStatus } from "@shared/booking/booking";
import { formatDate, formatDuration, formatRelativeDay, formatTimeRange, toPlainDate } from "@shared/format";
import { BOOKING_STATUS, PAYMENT_STATUS } from "@shared/status";
import { Badge, BrandScope, BusinessAvatar, DateTile, Text, useTheme } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";

export type BookingCardProps = {
  booking: CustomerBooking;
  /** Past, cancelled or expired: faded. */
  inactive: boolean;
  /** The booking open beside the list (split view). */
  selected?: boolean;
  onPress: (booking: CustomerBooking) => void;
};

/** One booking on My bookings, in its business's colour: when, what, where, and its status. */
export const BookingCard = memo(function BookingCard({
  booking: b,
  inactive,
  selected,
  onPress,
}: BookingCardProps) {
  return (
    <BrandScope color={b.business.branding.primaryColor}>
      <CardBody booking={b} inactive={inactive} selected={selected} onPress={onPress} />
    </BrandScope>
  );
});

function CardBody({ booking: b, inactive, selected, onPress }: BookingCardProps) {
  const { colors } = useTheme();
  const tz = b.timezone;
  const when = `${formatRelativeDay(b.start, tz)} · ${formatTimeRange(b.start, b.end, tz)}`;
  const place = shortAddress(b.business.address);
  const people = b.resources.map((r) => r.name).join(" · ");
  const status = BOOKING_STATUS[b.status];
  const payment = showsPaymentStatus(b) ? PAYMENT_STATUS[b.paymentStatus] : null;
  const service = b.option ? `${b.service.name}, ${b.option.name}` : b.service.name;
  const label = [
    `${service} with ${b.business.name}`,
    `${formatDate(b.start, tz, "long")}, ${formatTimeRange(b.start, b.end, tz)}`,
    status.label,
    payment?.label,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <Pressable
      testID={`booking-${b.reference}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the booking"
      accessibilityState={{ selected: !!selected }}
      onPress={() => onPress(b)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.muted : colors.surface,
          borderColor: selected ? colors.brand : colors.border,
          borderWidth: selected ? borderWidth.focus : borderWidth.hairline,
        },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: colors.brand, opacity: inactive ? 0.4 : 1 }]} />
      <DateTile date={toPlainDate(b.start, tz)} timeZone={tz} muted={inactive} />
      <View style={styles.body}>
        <View style={styles.business}>
          <BusinessAvatar
            name={b.business.name}
            logoUrl={b.business.branding.logoUrl}
            color={b.business.branding.primaryColor}
            size={20}
          />
          <Text variant="callout" tone="muted" numberOfLines={1} style={styles.flex}>
            {b.business.name}
          </Text>
        </View>
        <Text variant="headline" numberOfLines={2} tone={inactive ? "muted" : "default"}>
          {service}
        </Text>
        <Text variant="callout" tone="muted" numeric>
          {when}{" "}
          <Text variant="callout" tone="subtle">
            ({formatDuration(bookingMinutes(b))})
          </Text>
        </Text>
        {people || place ? (
          <Text variant="callout" tone="subtle" numberOfLines={1}>
            {[people, place].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        <View style={styles.badges}>
          <Badge label={status.label} tone={status.tone} />
          {payment ? <Badge label={payment.label} tone={payment.tone} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: space[3],
    padding: space[4],
    paddingLeft: space[5],
    borderRadius: radius["2xl"],
    overflow: "hidden",
  },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, width: space[1] },
  body: { flex: 1, gap: space[1] },
  business: { flexDirection: "row", alignItems: "center", gap: space[2] },
  flex: { flex: 1 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[1.5], marginTop: space[1] },
});
