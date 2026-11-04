import { StyleSheet, View } from "react-native";
import { Tag } from "lucide-react-native";
import { formatPrice } from "@shared/format";
import { wasNowText } from "@shared/offers/display";
import { Icon, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";

/**
 * A discounted price (the website's DealPrice): the original struck through, then the new price. Screen readers hear
 * "was €70, now €56" instead of two bare numbers.
 */
export function DealPrice({
  originalCents,
  priceCents,
  currency,
  locale,
}: {
  originalCents: number;
  priceCents: number;
  currency: string;
  locale?: string;
}) {
  return (
    <View
      style={styles.price}
      accessible
      accessibilityLabel={wasNowText(originalCents, priceCents, currency, locale)}
    >
      <Text variant="footnote" tone="muted" numeric style={styles.was}>
        {formatPrice(originalCents, currency, { locale })}
      </Text>
      <Text variant="footnote" weight="semibold" numeric>
        {formatPrice(priceCents, currency, { locale })}
      </Text>
    </View>
  );
}

/** The deal's label ("20% off") as a brand badge with a tag. */
export function DealBadge({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.brandSoft }]}>
      <Icon icon={Tag} size={12} color="brandSoftForeground" />
      <Text
        variant="footnote"
        weight="semibold"
        numberOfLines={1}
        style={{ color: colors.brandSoftForeground }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  price: { flexDirection: "row", alignItems: "baseline", gap: space[1.5], flexShrink: 0 },
  was: { textDecorationLine: "line-through" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: space[2],
    paddingVertical: space[0.5],
  },
});
