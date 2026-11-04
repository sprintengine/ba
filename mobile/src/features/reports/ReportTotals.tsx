import { StyleSheet, View } from "react-native";
import { ChartColumn, CalendarX2, Receipt, TrendingUp, UserPlus, UserX } from "lucide-react-native";
import type { ReportSummary } from "@shared/api/types";
import { percentOf } from "@shared/dashboard/reports";
import { useVocabulary } from "@shared/vocabulary";
import { Card, Icon, Skeleton, Text, useLayout, type IconComponent } from "~/ui";
import { space } from "~/ui/tokens";
import { useBusinessFormat } from "./format";

type Tile = { key: string; label: string; value: string; hint?: string; icon: IconComponent };

/** The period's headline numbers as stat tiles (the website's ReportTotals): two a row on phones, three on iPad. */
export function ReportTotals({
  totals: t,
  days,
  loading,
}: {
  totals: ReportSummary["totals"] | undefined;
  /** Days in the period (for the revenue per day). */
  days: number;
  loading: boolean;
}) {
  const { v } = useVocabulary();
  const fmt = useBusinessFormat();
  const { isWide } = useLayout();
  const share = (n: number) => {
    const pct = t ? percentOf(n, t.bookings) : null;
    return pct === null ? undefined : `${pct}% of ${v("bookings")}`;
  };
  const tiles: Tile[] = [
    {
      key: "bookings",
      label: v("bookings", { title: true }),
      value: String(t?.bookings ?? 0),
      hint: t ? `${t.confirmed} confirmed` : undefined,
      icon: ChartColumn,
    },
    {
      key: "revenue",
      label: "Revenue",
      value: fmt.money(t?.revenueCents ?? 0),
      hint: t && days > 0 ? `${fmt.money(Math.round(t.revenueCents / days))} a day` : undefined,
      icon: TrendingUp,
    },
    {
      key: "cancelled",
      label: "Cancelled",
      value: String(t?.cancelled ?? 0),
      hint: share(t?.cancelled ?? 0),
      icon: CalendarX2,
    },
    {
      key: "no-shows",
      label: "No-shows",
      value: String(t?.noShows ?? 0),
      hint: share(t?.noShows ?? 0),
      icon: UserX,
    },
    {
      key: "new-customers",
      label: `New ${v("customers")}`,
      value: String(t?.newCustomers ?? 0),
      icon: UserPlus,
    },
    { key: "refunded", label: "Refunded", value: fmt.money(t?.refundedCents ?? 0), icon: Receipt },
  ];
  const columns = isWide ? 3 : 2;
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += columns) rows.push(tiles.slice(i, i + columns));
  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row[0]!.key} style={styles.row}>
          {row.map((tile) => (
            <StatTile key={tile.key} tile={tile} loading={loading} />
          ))}
        </View>
      ))}
    </View>
  );
}

function StatTile({ tile, loading }: { tile: Tile; loading: boolean }) {
  const label = loading
    ? `${tile.label}: loading`
    : [`${tile.label}: ${tile.value}`, tile.hint].filter(Boolean).join(". ");
  return (
    <View style={styles.cell}>
      <Card style={styles.card}>
        <View style={styles.tile} accessible accessibilityLabel={label} testID={`reports-total-${tile.key}`}>
          <View style={styles.labelRow}>
            <Text variant="callout" weight="medium" tone="muted" numberOfLines={1} style={styles.label}>
              {tile.label}
            </Text>
            <Icon icon={tile.icon} size={16} color="subtleForeground" />
          </View>
          {loading ? (
            <Skeleton height={32} width="60%" />
          ) : (
            // Proportional figures: a standalone number looks loose with tabular digits. A value, not a heading.
            <Text variant="title2" accessibilityRole="text" adjustsFontSizeToFit numberOfLines={1}>
              {tile.value}
            </Text>
          )}
          {tile.hint && !loading ? (
            <Text variant="footnote" tone="subtle">
              {tile.hint}
            </Text>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space[3] },
  row: { flexDirection: "row", gap: space[3] },
  cell: { flex: 1, minWidth: 0 },
  card: { flex: 1 },
  tile: { gap: space[2] },
  labelRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  label: { flex: 1 },
});
