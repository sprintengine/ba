import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ChartColumn } from "lucide-react-native";
import type { ReportSummary } from "@shared/api/types";
import { isEmptyReport } from "@shared/dashboard/reports";
import { useVocabulary } from "@shared/vocabulary";
import { EmptyState, Section, SegmentedControl, Skeleton } from "~/ui";
import { space } from "~/ui/tokens";
import { BarChart } from "./chart/BarChart";
import { DataTable } from "./DataTable";
import { useBusinessFormat } from "./format";

export type Measure = "bookings" | "revenue";

const CHART_HEIGHT = 256;
/** Room for the y-axis labels: counts are short, money longer (the website's widths). */
const AXIS_WIDTH: Record<Measure, number> = { bookings: 32, revenue: 56 };

/** Bookings or revenue per day, as a chart or a table (the website's PerDayCard). */
export function PerDayCard({ data, loading }: { data: ReportSummary | undefined; loading: boolean }) {
  const { v } = useVocabulary();
  const fmt = useBusinessFormat();
  const [measure, setMeasure] = useState<Measure>("bookings");
  const [asTable, setAsTable] = useState(false);
  const series = useMemo(
    () =>
      (data?.byDay ?? []).map((d) => ({
        key: d.date,
        value: measure === "bookings" ? d.bookings : d.revenueCents,
      })),
    [data, measure],
  );
  const valueText = (value: number) =>
    measure === "bookings" ? `${value} ${v("booking", { count: value })}` : fmt.money(value);
  const title = measure === "bookings" ? `${v("bookings", { title: true })} per day` : "Revenue per day";

  return (
    <Section title={title} description={`By the date of the ${v("booking")}.`} testID="reports-per-day">
      <View style={styles.controls}>
        <View style={styles.control}>
          <SegmentedControl
            accessibilityLabel="Measure"
            value={measure}
            onChange={setMeasure}
            segments={[
              { value: "bookings", label: v("bookings", { title: true }) },
              { value: "revenue", label: "Revenue" },
            ]}
          />
        </View>
        <View style={styles.control}>
          <SegmentedControl
            accessibilityLabel="Display"
            value={asTable ? "table" : "chart"}
            onChange={(x) => setAsTable(x === "table")}
            segments={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        </View>
      </View>
      {loading || !data ? (
        <Skeleton height={CHART_HEIGHT} radius="lg" />
      ) : isEmptyReport(data.totals) ? (
        <EmptyState
          icon={ChartColumn}
          title="Nothing in this period"
          description={`Try a longer range once ${v("bookings")} start coming in.`}
          testID="reports-empty"
        />
      ) : asTable ? (
        <DataTable
          testID="reports-table"
          columns={[
            { key: "date", label: "Date" },
            { key: "bookings", label: v("bookings", { title: true }), align: "right" },
            { key: "revenue", label: "Revenue", align: "right" },
          ]}
          rows={data.byDay.map((d) => {
            const date = fmt.date(d.date, "dayMonthYear");
            const bookings = `${d.bookings} ${v("booking", { count: d.bookings })}`;
            return {
              key: d.date,
              cells: [date, String(d.bookings), fmt.money(d.revenueCents)],
              accessibilityLabel: `${date}: ${bookings}, ${fmt.money(d.revenueCents)}`,
            };
          })}
        />
      ) : (
        <BarChart
          testID="reports-chart"
          data={series}
          height={CHART_HEIGHT}
          axisWidth={AXIS_WIDTH[measure]}
          formatTick={(value) => (measure === "bookings" ? String(value) : fmt.moneyTick(value))}
          formatLabel={(date) => fmt.date(date, "short")}
          describe={(d) => ({ title: fmt.date(d.key, "dayMonthYear"), value: valueText(d.value) })}
          accessibilityLabel={`${measure === "bookings" ? v("bookings", { title: true }) : "Revenue"} per day, ${series.length} days. Switch to the table for exact values.`}
        />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  control: { flexGrow: 1, flexBasis: space[16] * 3 },
});
