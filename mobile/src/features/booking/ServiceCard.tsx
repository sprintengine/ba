import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight, Clock } from "lucide-react-native";
import type { PublicService } from "@shared/api/types";
import { durationLabel, priceSummary } from "@shared/booking/quote";
import { formatMoney } from "@shared/format";
import { Badge, Icon, Text, useTheme } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";

/** What a service's card says about paying (the website's PaymentBadge); null when there's nothing to say. */
export function paymentBadge(s: PublicService, currency: string, locale?: string): string | null {
  if (s.requiresApproval) return "Request to book";
  if (priceSummary(s).kind === "free") return null;
  if (s.paymentMode === "at_venue") return "Pay at venue";
  if (s.paymentMode === "deposit" && s.depositCents) {
    const deposit = `${formatMoney(s.depositCents, currency, { locale })} deposit`;
    return s.allowPayAtVenue ? `${deposit} or pay at venue` : deposit;
  }
  if (s.allowPayAtVenue) return "Pay online or at venue";
  return null;
}

/** "45 min · 3 options · Group · up to 8 · Online". */
export function serviceMeta(s: PublicService): string[] {
  const meta = [durationLabel(s)];
  if (s.options.length > 1) meta.push(`${s.options.length} options`);
  if (s.capacity > 1) meta.push(`Group · up to ${s.capacity}`);
  if (s.locationType === "online") meta.push("Online");
  if (s.locationType === "customer") meta.push("At your address");
  return meta;
}

/** "Free", "€45" or "from €45" in parts (the website's ServiceCard price). */
function priceParts(s: PublicService, currency: string, locale?: string) {
  const price = priceSummary(s);
  if (price.kind === "free") return { from: false, value: "Free" };
  return { from: price.kind === "from", value: formatMoney(price.cents, currency, { locale }) };
}

/** A service to choose: name, price, length, options, how it's paid; the whole card is one button. */
export const ServiceCard = memo(function ServiceCard({
  service: s,
  currency,
  locale,
  selected = false,
  onSelect,
}: {
  service: PublicService;
  currency: string;
  locale?: string;
  selected?: boolean;
  onSelect: (service: PublicService) => void;
}) {
  const { colors } = useTheme();
  const price = priceParts(s, currency, locale);
  const badge = paymentBadge(s, currency, locale);
  const meta = serviceMeta(s);
  const label = [s.name, `${price.from ? "from " : ""}${price.value}`, ...meta, badge, s.description]
    .filter(Boolean)
    .join(", ");
  return (
    <Pressable
      testID={`service-${s.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => onSelect(s)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.muted : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? borderWidth.focus : borderWidth.hairline,
        },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: s.color }]} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="headline" style={styles.flex}>
            {s.name}
          </Text>
          <Text variant="headline" numeric>
            {price.from ? (
              <Text variant="footnote" tone="muted">
                from{" "}
              </Text>
            ) : null}
            {price.value}
          </Text>
        </View>
        {s.description ? (
          <Text variant="callout" tone="muted" numberOfLines={2}>
            {s.description}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <Icon icon={Clock} size={14} color="mutedForeground" />
          <Text variant="footnote" tone="muted" style={styles.flex}>
            {meta.join(" · ")}
          </Text>
        </View>
        {badge ? <Badge label={badge} tone={s.requiresApproval ? "info" : "neutral"} /> : null}
      </View>
      <Icon icon={ChevronRight} size={18} color="subtleForeground" />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderRadius: radius.xl,
    padding: space[4],
    paddingLeft: space[5],
    overflow: "hidden",
  },
  bar: {
    position: "absolute",
    left: 0,
    top: space[4],
    bottom: space[4],
    width: space[1],
    borderRadius: radius.full,
  },
  body: { flex: 1, gap: space[1] },
  titleRow: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  flex: { flex: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: space[1.5] },
});
