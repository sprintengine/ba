/** Deals (architecture §19) as the website shows them: a struck-through price and the deal's label. */
import { StyleSheet, View } from "react-native";
import { Tag } from "lucide-react-native";
import { formatMoney, formatPrice } from "@shared/format";
import { wasNowText } from "@shared/offers/display";
import { Icon, Text, type TextProps, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";

/**
 * A discounted price: the original struck through, then the new one. Screen readers hear "was €50, now €40" instead
 * of two bare numbers.
 */
export function DealPrice({
  originalCents,
  priceCents,
  currency,
  locale,
  variant = "callout",
  tone = "default",
}: {
  originalCents: number;
  priceCents: number;
  currency: string;
  locale?: string;
  variant?: TextProps["variant"];
  /** On a filled background (a selected time): both prices in its foreground. */
  tone?: "default" | "brand" | "primaryForeground";
}) {
  return (
    <Text
      variant={variant}
      numeric
      accessibilityLabel={wasNowText(originalCents, priceCents, currency, locale)}
      tone={tone === "default" ? "default" : tone}
    >
      <Text
        variant={variant}
        tone={tone === "default" ? "muted" : tone}
        style={styles.struck}
        accessibilityElementsHidden
      >
        {formatPrice(originalCents, currency, { locale })}
      </Text>{" "}
      <Text variant={variant} weight="semibold" tone={tone === "default" ? "default" : tone}>
        {formatPrice(priceCents, currency, { locale })}
      </Text>
    </Text>
  );
}

/** The deal's label ("20% off") as a pill in the business's colour. */
export function DealBadge({ label, inverted = false }: { label: string; inverted?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.badge, { backgroundColor: inverted ? colors.primaryForeground : colors.brand }]}
      accessible
      accessibilityLabel={label}
    >
      <Icon icon={Tag} size={12} color={inverted ? "primary" : "brandForeground"} />
      <Text
        variant="caption"
        numberOfLines={1}
        style={{ color: inverted ? colors.primary : colors.brandForeground, letterSpacing: 0 }}
      >
        {label}
      </Text>
    </View>
  );
}

/** "Saving €15" in a price breakdown. */
export function savingText(discountCents: number, currency: string, locale?: string) {
  return formatMoney(-discountCents, currency, { locale, signed: true });
}

const styles = StyleSheet.create({
  struck: { textDecorationLine: "line-through" },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderRadius: radius.full,
    paddingHorizontal: space[2],
    paddingVertical: space[0.5],
  },
});
