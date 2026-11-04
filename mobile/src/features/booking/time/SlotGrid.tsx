import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Moon, Sun, Sunrise, Tag } from "lucide-react-native";
import type { Slot } from "@shared/api/types";
import { groupByDayPeriod, type DayPeriod } from "@shared/booking/periods";
import { formatPrice, formatTime, toTimeOfDay } from "@shared/format";
import { wasNowText } from "@shared/offers/display";
import { Icon, Skeleton, Text, useTheme } from "~/ui";
import { borderWidth, MIN_TOUCH, radius, space } from "~/ui/tokens";
import { DealBadge, DealPrice } from "../deals";

const PERIOD_ICONS: Record<DayPeriod, typeof Sun> = { morning: Sunrise, afternoon: Sun, evening: Moon };
const GAP = space[2];

/** Columns for the grid's width: three on a phone, more where there is room. */
export function slotColumns(width: number): number {
  if (width >= 560) return 5;
  if (width >= 400) return 4;
  return 3;
}

/** A day's times as buttons, grouped by morning/afternoon/evening when there are many; deals highlighted. */
export function SlotGrid({
  slots,
  timeZone,
  locale,
  currency,
  selectedTime,
  onSelect,
}: {
  slots: Slot[];
  timeZone: string;
  locale?: string;
  currency?: string;
  /** "HH:mm" in the business timezone. */
  selectedTime: string | null;
  onSelect: (slot: Slot) => void;
}) {
  const [width, setWidth] = useState(0);
  const hasDeals = slots.some((s) => s.offer);
  const groups = groupByDayPeriod(
    slots.map((slot) => ({ slot, time: toTimeOfDay(slot.start, timeZone) })),
    (x) => x.time,
  );
  const cols = slotColumns(width);
  const itemWidth = width > 0 ? (width - GAP * (cols - 1)) / cols : undefined;

  return (
    <View
      style={styles.root}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel="Available times"
      testID="slot-grid"
    >
      {hasDeals ? (
        <View style={styles.legend}>
          <Icon icon={Tag} size={14} color="brand" />
          <Text variant="footnote" tone="muted">
            Highlighted times have a deal
          </Text>
        </View>
      ) : null}
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          {group.label && group.key !== "all" ? (
            <View style={styles.legend} accessibilityRole="header">
              <Icon icon={PERIOD_ICONS[group.key]} size={14} color="subtleForeground" />
              <Text variant="footnote" tone="subtle">
                {group.label}
              </Text>
            </View>
          ) : null}
          <View style={[styles.grid, hasDeals ? styles.gridDeals : null]}>
            {group.items.map(({ slot, time }) => (
              <SlotButton
                key={slot.start}
                slot={slot}
                width={itemWidth}
                timeZone={timeZone}
                locale={locale}
                currency={currency}
                selected={selectedTime === time}
                onSelect={onSelect}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const SlotButton = memo(function SlotButton({
  slot,
  width,
  timeZone,
  locale,
  currency,
  selected,
  onSelect,
}: {
  slot: Slot;
  width: number | undefined;
  timeZone: string;
  locale?: string;
  currency?: string;
  selected: boolean;
  onSelect: (slot: Slot) => void;
}) {
  const { colors } = useTheme();
  const deal = slot.offer ?? null;
  const fewSeats = slot.seatsLeft !== null && slot.seatsLeft <= 5;
  const time = formatTime(slot.start, timeZone, locale);
  const label = [
    time,
    deal ? deal.label : null,
    deal && currency ? wasNowText(deal.originalPriceCents, deal.priceCents, currency, locale) : null,
    fewSeats ? `${slot.seatsLeft} ${slot.seatsLeft === 1 ? "place" : "places"} left` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const fg = selected ? "primaryForeground" : "default";
  return (
    <Pressable
      testID={`slot-${toTimeOfDay(slot.start, timeZone)}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => onSelect(slot)}
      style={({ pressed }) => [
        styles.slot,
        { width },
        {
          backgroundColor: selected
            ? colors.primary
            : pressed
              ? colors.brandSoft
              : deal
                ? colors.brandSoft
                : colors.surface,
          borderColor: selected ? colors.primary : deal ? colors.brandBorder : colors.border,
        },
      ]}
    >
      {deal ? (
        <View style={styles.dealLabel}>
          <DealBadge label={deal.label} inverted={selected} />
        </View>
      ) : null}
      <Text variant="body" weight="medium" numeric tone={fg} maxFontSizeMultiplier={1.6}>
        {time}
      </Text>
      {deal && currency ? (
        <DealPrice
          originalCents={deal.originalPriceCents}
          priceCents={deal.priceCents}
          currency={currency}
          locale={locale}
          variant="caption"
          tone={selected ? "primaryForeground" : "brand"}
        />
      ) : null}
      {fewSeats ? (
        <Text variant="caption" tone={selected ? "primaryForeground" : "muted"} maxFontSizeMultiplier={1.6}>
          {slot.seatsLeft} {slot.seatsLeft === 1 ? "place" : "places"} left
        </Text>
      ) : null}
    </Pressable>
  );
});

/** The times' shape while they load. */
export function SlotsSkeleton() {
  return (
    <View
      style={styles.root}
      accessible
      accessibilityLabel="Loading available times"
      accessibilityRole="progressbar"
    >
      <Skeleton width="50%" height={18} />
      <View style={styles.grid}>
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} style={styles.skeletonCell}>
            <Skeleton height={MIN_TOUCH + space[1]} radius="lg" />
          </View>
        ))}
      </View>
    </View>
  );
}

/** A price for a slot without a deal (used by the next-time card). */
export function slotPrice(cents: number, currency: string, locale?: string) {
  return formatPrice(cents, currency, { locale });
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  legend: { flexDirection: "row", alignItems: "center", gap: space[1.5] },
  group: { gap: space[2] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  gridDeals: { rowGap: space[4], paddingTop: space[1] },
  slot: {
    minHeight: MIN_TOUCH + space[1],
    minWidth: space[16],
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space[1.5],
    paddingHorizontal: space[1],
  },
  dealLabel: { position: "absolute", top: -space[2.5], right: space[1] },
  skeletonCell: { width: "31%" },
});
