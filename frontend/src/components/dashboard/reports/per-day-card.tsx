"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { BarChart3, Table2 } from "lucide-react";
import type { ReportSummary } from "@/lib/api/types";
import { isEmptyReport } from "@/lib/dashboard/reports";
import { useVocabulary } from "@/lib/vocabulary";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import type { Measure } from "./day-chart";
import { DayTable } from "./day-table";

/** Recharts only loads when a chart is shown (it is most of the reports page's JavaScript). */
const DayChart = dynamic(() => import("./day-chart").then((m) => m.DayChart), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-lg" />,
});

/** Bookings or revenue per day, as a chart or a table. */
export function PerDayCard({ data, loading }: { data: ReportSummary | undefined; loading: boolean }) {
  const { v } = useVocabulary();
  const [measure, setMeasure] = useState<Measure>("bookings");
  const [asTable, setAsTable] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {measure === "bookings" ? `${v("bookings", { title: true })} per day` : "Revenue per day"}
        </CardTitle>
        <CardDescription>By the day the {v("booking")} takes place.</CardDescription>
        <CardAction wrap className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="sm"
            aria-label="Measure"
            value={measure}
            onValueChange={setMeasure}
            options={[
              { value: "bookings", label: v("bookings", { title: true }) },
              { value: "revenue", label: "Revenue" },
            ]}
          />
          <SegmentedControl
            size="sm"
            aria-label="Display"
            value={asTable ? "table" : "chart"}
            onValueChange={(x) => setAsTable(x === "table")}
            options={[
              { value: "chart", label: "Chart", icon: <BarChart3 aria-hidden /> },
              { value: "table", label: "Table", icon: <Table2 aria-hidden /> },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : isEmptyReport(data.totals) ? (
          <EmptyState
            size="sm"
            icon={<BarChart3 />}
            title="Nothing in this period"
            description={`Try a longer range once ${v("bookings")} start coming in.`}
          />
        ) : asTable ? (
          <DayTable data={data} />
        ) : (
          <DayChart data={data} measure={measure} />
        )}
      </CardContent>
    </Card>
  );
}
