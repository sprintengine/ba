"use client";

import { useState } from "react";
import { useReportSummary } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { parseReportParams } from "@/lib/dashboard/reports";
import { diffPlainDates, todayInTz } from "@/lib/format/datetime";
import { useUrlParams } from "@/lib/hooks/use-url-params";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState, NoAccess } from "@/components/common/feedback";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useFmt } from "../common";
import { ServiceBars, UtilisationBars } from "./breakdowns";
import type { Measure } from "./day-chart";
import { PerDayCard } from "./per-day-card";
import { ReportRangePicker } from "./report-range-picker";
import { ReportTotals } from "./report-totals";

export function ReportsView() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const [measure, setMeasure] = useState<Measure>("bookings");
  const { params, setParams } = useUrlParams();
  const { preset, range } = parseReportParams(params, todayInTz(business.timezone));
  const report = useReportSummary(business.id, range, { enabled: perms.viewReports });

  if (!perms.viewReports) {
    return (
      <NoAccess
        title="Reports are for admins"
        description="Ask an owner or admin for the numbers."
        backHref={dashboardHref(business.slug)}
        backLabel="Back to Today"
      />
    );
  }

  const data = report.data;
  const days = diffPlainDates(range.to, range.from) + 1;

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Reports"
        description={`${fmt.date(range.from, range.from.slice(0, 4) === range.to.slice(0, 4) ? "short" : "medium")} – ${fmt.date(range.to, "medium")} · ${days} days`}
        actions={<ReportRangePicker preset={preset} range={range} setParams={setParams} />}
      />
      {report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <ReportTotals
            totals={data?.totals}
            days={days}
            loading={report.isPending}
            measure={measure}
            onMeasure={setMeasure}
          />
          <PerDayCard data={data} loading={report.isPending} measure={measure} />
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>By service</CardTitle>
                <CardDescription>{v("bookings", { title: true })} and revenue per service.</CardDescription>
              </CardHeader>
              <CardContent>
                {report.isPending || !data ? <Skeleton className="h-40" /> : <ServiceBars data={data} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Utilisation</CardTitle>
                <CardDescription>Booked time as a share of open hours.</CardDescription>
              </CardHeader>
              <CardContent>
                {report.isPending || !data ? <Skeleton className="h-40" /> : <UtilisationBars data={data} />}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
