import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MapPin, Tag } from "lucide-react-native";
import type { Listing, NextSlot } from "@shared/api/types";
import { formatDistance, formatPriceFrom, formatSlotLabel } from "@shared/explore/format";
import { wasNowText } from "@shared/offers/display";
import { BusinessAvatar, Icon, Skeleton, Text, useTheme } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";
import { DealPrice } from "~/features/booking/deals";
import { categoryIcon } from "./explore";

const MAX_DEALS_SHOWN = 2;

/** One result: who, what, where, from what price, deals and the next free times. The whole card opens the business. */
export const ListingCard = memo(function ListingCard({
  listing,
  onOpen,
}: {
  listing: Listing;
  onOpen: (listing: Listing) => void;
}) {
  const { colors } = useTheme();
  const { business, category, currency } = listing;
  const price = formatPriceFrom(listing.priceFromCents, currency);
  const place = [
    business.address.city,
    listing.distanceKm !== null ? formatDistance(listing.distanceKm) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const label = [
    business.name,
    category.label,
    place,
    price,
    listing.deals.length > 0 ? `Deals: ${listing.deals.map((d) => d.label).join(", ")}` : null,
    listing.nextSlots.length > 0
      ? `Next free times: ${listing.nextSlots.map((s) => slotWords(s, business.timezone, currency)).join("; ")}`
      : "No free times in the next few days",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <Pressable
      testID={`listing-${business.slug}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the business"
      onPress={() => onOpen(listing)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.muted : colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.top}>
        <BusinessAvatar
          name={business.name}
          logoUrl={business.branding.logoUrl}
          color={business.branding.primaryColor}
          size={52}
        />
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text variant="headline" numberOfLines={2} style={styles.flex}>
              {business.name}
            </Text>
            {price ? (
              <Text variant="callout" weight="semibold" numeric>
                {price}
              </Text>
            ) : null}
          </View>
          <View style={styles.meta}>
            <Icon icon={categoryIcon(category.key)} size={14} color="brand" />
            <Text variant="callout" tone="muted">
              {category.label}
            </Text>
            {place ? (
              <>
                <Icon icon={MapPin} size={14} color="subtleForeground" />
                <Text variant="callout" tone="muted" numeric style={styles.flex} numberOfLines={1}>
                  {place}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </View>

      {business.description ? (
        <Text variant="callout" tone="muted" numberOfLines={2}>
          {business.description}
        </Text>
      ) : null}

      {listing.deals.length > 0 ? (
        <View style={styles.deals}>
          <View style={[styles.dealsBadge, { backgroundColor: colors.successSoft }]}>
            <Icon icon={Tag} size={12} color="successSoftForeground" />
            <Text variant="caption" style={{ color: colors.successSoftForeground, letterSpacing: 0 }}>
              Deals
            </Text>
          </View>
          {listing.deals.slice(0, MAX_DEALS_SHOWN).map((deal) => (
            <Text key={deal.id} variant="footnote" tone="muted" numeric>
              <Text variant="footnote" tone="success">
                {deal.label}
              </Text>
              {deal.summary ? ` · ${deal.summary}` : ""}
            </Text>
          ))}
          {listing.deals.length > MAX_DEALS_SHOWN ? (
            <Text variant="footnote" tone="subtle">
              +{listing.deals.length - MAX_DEALS_SHOWN} more
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.slots}>
        <Text variant="footnote" tone="subtle">
          {listing.nextSlots.length > 0 ? "Next free times" : "No free times in the next few days"}
        </Text>
        {listing.nextSlots.length > 0 ? (
          <View style={styles.chips}>
            {listing.nextSlots.map((slot) => (
              <SlotChip
                key={`${slot.start}-${slot.serviceId}-${slot.optionId ?? ""}`}
                slot={slot}
                timeZone={business.timezone}
                currency={currency}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

function slotWords(slot: NextSlot, timeZone: string, currency: string) {
  const service = slot.optionName ? `${slot.serviceName}, ${slot.optionName}` : slot.serviceName;
  const offer = slot.offer
    ? `, ${slot.offer.label}, ${wasNowText(slot.offer.originalPriceCents, slot.offer.priceCents, currency)}`
    : "";
  return `${formatSlotLabel(slot.start, timeZone)}, ${service}${offer}`;
}

function SlotChip({ slot, timeZone, currency }: { slot: NextSlot; timeZone: string; currency: string }) {
  const { colors } = useTheme();
  const offer = slot.offer;
  return (
    <View
      style={[
        styles.chip,
        offer
          ? { backgroundColor: colors.successSoft, borderColor: colors.successSoft }
          : { backgroundColor: colors.surfaceSunken, borderColor: colors.border },
      ]}
    >
      <Text variant="footnote" numeric style={offer ? { color: colors.successSoftForeground } : undefined}>
        {formatSlotLabel(slot.start, timeZone)}
      </Text>
      {offer ? (
        <DealPrice
          originalCents={offer.originalPriceCents}
          priceCents={offer.priceCents}
          currency={currency}
          variant="footnote"
        />
      ) : null}
    </View>
  );
}

/** A result's shape while results load. */
export function ListingCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.top}>
        <Skeleton width={52} height={52} radius="lg" />
        <View style={[styles.flex, styles.skeletonText]}>
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={14} />
        </View>
      </View>
      <Skeleton width="85%" height={14} />
      <View style={styles.chips}>
        <Skeleton width={96} height={28} radius="full" />
        <Skeleton width={110} height={28} radius="full" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, borderWidth: borderWidth.hairline, padding: space[4], gap: space[3] },
  top: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  flex: { flex: 1 },
  titleRow: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  meta: { flexDirection: "row", alignItems: "center", gap: space[1.5], marginTop: space[0.5] },
  deals: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  dealsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderRadius: radius.full,
    paddingHorizontal: space[2],
    paddingVertical: space[0.5],
  },
  slots: { gap: space[2] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[1.5] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1.5],
    borderRadius: radius.full,
    borderWidth: borderWidth.hairline,
    paddingHorizontal: space[2.5],
    paddingVertical: space[1],
  },
  skeletonText: { gap: space[2], paddingTop: space[1] },
});
