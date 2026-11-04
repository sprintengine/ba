import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { ArrowRight, Tag } from "lucide-react-native";
import { usePublicOffers } from "@shared/api/hooks/use-offers";
import type { PublicBusiness, PublicService } from "@shared/api/types";
import { formatDate } from "@shared/format";
import { Button, Card, Icon, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { DealBadge } from "./deals";

/**
 * The business's current deals (the website's PortalDeals): each on a single service books that service. Renders
 * nothing while loading, on error or with none. `compact`: the booking flow's intro (no section heading icon).
 */
export function BusinessDeals({
  business,
  services,
  compact = false,
  onBook,
}: {
  business: PublicBusiness;
  services: PublicService[];
  compact?: boolean;
  /** Book a deal's service (the booking flow chooses it in place); else opens the booking flow with it. */
  onBook?: (serviceId: string) => void;
}) {
  const offers = usePublicOffers(business.slug, { staleTime: 60_000 });
  const list = Array.isArray(offers.data) ? offers.data : [];
  if (list.length === 0) return null;
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name;
  return (
    <View style={[styles.root, compact ? styles.compact : null]} testID="business-deals">
      <View style={styles.heading}>
        <Icon icon={Tag} size={16} color="brand" />
        <Text variant="headline" accessibilityRole="header">
          {list.length === 1 ? "Current deal" : "Current deals"}
        </Text>
      </View>
      {list.map((o) => {
        const single = o.serviceIds.length === 1 ? o.serviceIds[0] : undefined;
        const only = single ? serviceName(single) : undefined;
        const details = [
          only,
          o.summary,
          o.validUntil
            ? `until ${formatDate(o.validUntil, business.timezone, "short", business.locale)}`
            : null,
        ].filter(Boolean);
        return (
          <Card key={o.id} testID={`deal-${o.id}`}>
            <View style={styles.dealTitle}>
              <Text variant="body" weight="semibold" style={styles.flex}>
                {o.name}
              </Text>
              <DealBadge label={o.label} />
            </View>
            {o.description ? (
              <Text variant="callout" tone="muted" style={styles.line}>
                {o.description}
              </Text>
            ) : null}
            {details.length > 0 ? (
              <Text variant="callout" tone="muted" style={styles.line}>
                {details.join(" · ")}
              </Text>
            ) : null}
            {single ? (
              <View style={styles.line}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ArrowRight}
                  label={`Book ${only ?? "now"}`}
                  accessibilityLabel={`Book ${only ?? "now"} with ${o.name}`}
                  onPress={() =>
                    onBook
                      ? onBook(single)
                      : router.push({
                          pathname: "/[slug]/book",
                          params: { slug: business.slug, service: single },
                        })
                  }
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[3] },
  compact: { marginTop: space[3] },
  heading: { flexDirection: "row", alignItems: "center", gap: space[2] },
  dealTitle: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  flex: { flex: 1 },
  line: { marginTop: space[1.5] },
});
