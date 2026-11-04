import { keepPreviousData } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Lock } from "lucide-react-native";
import { useReportSummary } from "@shared/api/hooks/use-reports";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import {
  REPORT_RANGE_LABEL,
  REPORT_RANGES,
  reportRangeDates,
  type ClosedDateRange,
  type ReportRange,
} from "@shared/dashboard/date-ranges";
import { diffPlainDates, todayInTz } from "@shared/format";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { HeaderActions } from "~/shell/HeaderActions";
import {
  DateField,
  EmptyState,
  ErrorState,
  Screen,
  ScreenScroll,
  Section,
  Select,
  Skeleton,
  Text,
  useLayout,
} from "~/ui";
import { space } from "~/ui/tokens";
import { ServiceBars, UtilisationBars } from "./Breakdowns";
import { useBusinessFormat } from "./format";
import { PerDayCard } from "./PerDayCard";
import { ReportTotals } from "./ReportTotals";

/**
 * `/dashboard/[slug]/reports` (the website's ReportsView, admins): a period (preset or custom From/To in the
 * business's timezone), the headline numbers, bookings or revenue per day (chart or table), and the breakdowns by
 * service and by resource. While another period loads, the last one stays on screen, dimmed.
 */
export function ReportsScreen() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const header = (
    <Stack.Screen
      options={{
        title: "Reports",
        headerLargeTitle: true,
        headerRight: () => <HeaderActions business={business.slug} />,
      }}
    />
  );
  if (!perms.viewReports) {
    return (
      <Screen testID="reports-no-access">
        {header}
        <EmptyState
          icon={Lock}
          title="Reports are for admins"
          description="Ask an owner or admin for the numbers."
        />
      </Screen>
    );
  }
  return (
    <>
      {header}
      <ReportsView />
    </>
  );
}

function ReportsView() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const fmt = useBusinessFormat();
  const { isWide } = useLayout();
  const today = todayInTz(business.timezone);
  const [preset, setPreset] = useState<ReportRange>("30d");
  const [custom, setCustom] = useState<ClosedDateRange | null>(null);
  const raw = reportRangeDates(preset, today, custom ?? {});
  const range = raw.from <= raw.to ? raw : { from: raw.to, to: raw.from };
  const report = useReportSummary(business.id, range, { placeholderData: keepPreviousData });
  const refetch = report.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);

  const data = report.data;
  const loading = report.isPending;
  const days = diffPlainDates(range.to, range.from) + 1;

  const pick = (next: ReportRange) => {
    if (next === "custom") setCustom(range);
    setPreset(next);
  };

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={() => void onRefresh()} testID="reports">
      <Text variant="callout" tone="muted" testID="reports-period">
        {fmt.date(range.from, "medium")} – {fmt.date(range.to, "medium")} · {days} days
      </Text>
      <View style={styles.range}>
        <Select<ReportRange>
          label="Date range"
          testID="reports-range"
          value={preset}
          options={REPORT_RANGES.map((p) => ({ value: p, label: REPORT_RANGE_LABEL[p] }))}
          onChange={pick}
        />
        {preset === "custom" ? (
          <View>
            <DateField
              label="From"
              testID="reports-from"
              value={range.from}
              max={range.to}
              locale={fmt.locale}
              onChange={(d) => d && setCustom({ from: d, to: d > range.to ? d : range.to })}
            />
            <DateField
              label="To"
              testID="reports-to"
              value={range.to}
              min={range.from}
              locale={fmt.locale}
              onChange={(d) => d && setCustom({ from: d < range.from ? d : range.from, to: d })}
            />
          </View>
        ) : null}
      </View>

      {report.isError && !data ? (
        <ErrorState error={report.error} onRetry={() => void refetch()} />
      ) : (
        <View
          style={[styles.body, report.isPlaceholderData ? styles.stale : null]}
          accessibilityState={{ busy: report.isFetching }}
        >
          <ReportTotals totals={data?.totals} days={days} loading={loading} />
          <PerDayCard data={data} loading={loading} />
          <View style={isWide ? styles.pair : styles.body}>
            <View style={isWide ? styles.half : null}>
              <Section
                title="By service"
                description={`${v("bookings", { title: true })} and revenue per service.`}
                testID="reports-by-service"
              >
                {loading || !data ? <Skeleton height={160} /> : <ServiceBars data={data} />}
              </Section>
            </View>
            <View style={isWide ? styles.half : null}>
              <Section
                title="Utilisation"
                description="Booked time as a share of open hours."
                testID="reports-utilisation"
              >
                {loading || !data ? <Skeleton height={160} /> : <UtilisationBars data={data} />}
              </Section>
            </View>
          </View>
        </View>
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  range: { gap: space[2] },
  body: { gap: space[4] },
  stale: { opacity: 0.6 },
  pair: { flexDirection: "row", alignItems: "flex-start", gap: space[4] },
  half: { flex: 1, minWidth: 0 },
});
