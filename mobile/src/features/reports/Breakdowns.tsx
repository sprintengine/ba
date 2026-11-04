import { StyleSheet, View } from "react-native";
import type { ReportSummary } from "@shared/api/types";
import { rankResources, rankServices } from "@shared/dashboard/reports";
import { useVocabulary } from "@shared/vocabulary";
import { Text } from "~/ui";
import { space } from "~/ui/tokens";
import { Meter } from "./chart/Meter";
import { useBusinessFormat } from "./format";

/** Bookings and revenue per service, with a bar relative to the busiest (the website's ServiceBars). */
export function ServiceBars({ data }: { data: ReportSummary }) {
  const fmt = useBusinessFormat();
  const { v } = useVocabulary();
  const rows = rankServices(data.byService);
  const max = Math.max(1, ...rows.map((r) => r.bookings));
  if (rows.length === 0) {
    return (
      <Text variant="callout" tone="subtle">
        No {v("bookings")} in this period.
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {rows.map((r) => (
        <View key={r.serviceId} style={styles.item} testID={`reports-service-${r.serviceId}`}>
          <View
            style={styles.line}
            accessible
            accessibilityLabel={`${r.name}: ${r.bookings} ${v("booking", { count: r.bookings })}, ${fmt.money(r.revenueCents)}`}
          >
            <Text variant="callout" weight="medium" numberOfLines={1} style={styles.name}>
              {r.name}
            </Text>
            <Text variant="callout" tone="muted" numeric>
              {r.bookings} · {fmt.money(r.revenueCents)}
            </Text>
          </View>
          <Meter percent={(r.bookings / max) * 100} />
        </View>
      ))}
    </View>
  );
}

/** Booked time as a share of open hours, per resource (the website's UtilisationBars): meters. */
export function UtilisationBars({ data }: { data: ReportSummary }) {
  const fmt = useBusinessFormat();
  const rows = rankResources(data.byResource);
  if (rows.length === 0) {
    return (
      <Text variant="callout" tone="subtle">
        Nothing to show yet.
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {rows.map((r) => {
        const pct = Math.round(r.utilisation * 100);
        const detail = `${fmt.duration(Math.round(r.bookedMinutes))} of ${fmt.duration(Math.round(r.availableMinutes))}`;
        return (
          <View key={r.resourceId} style={styles.item}>
            <View
              style={styles.line}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text variant="callout" weight="medium" numberOfLines={1} style={styles.name}>
                {r.name}
              </Text>
              <Text variant="callout" tone="muted" numeric>
                <Text variant="callout" weight="medium" numeric>
                  {pct}%
                </Text>{" "}
                · {detail}
              </Text>
            </View>
            <Meter
              testID={`reports-utilisation-${r.resourceId}`}
              percent={pct}
              accessibilityLabel={`${r.name} utilisation`}
              value={{ min: 0, max: 100, now: pct, text: `${pct}%, ${detail}` }}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[4] },
  item: { gap: space[1.5] },
  line: { flexDirection: "row", alignItems: "baseline", gap: space[3] },
  name: { flex: 1 },
});
