"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportSummary } from "@/lib/api/types";
import { chartTickInterval } from "@/lib/dashboard/reports";
import { useVocabulary } from "@/lib/vocabulary";
import { useFmt } from "../common";

export type Measure = "bookings" | "revenue";
type Row = { date: string; value: number };

/** Room one date label ("14 Sept") needs on the x-axis, so they never run into each other on a phone. */
const TICK_SLOT_PX = 52;

/**
 * Bookings or revenue per day as a bar chart. Recharts is heavy, so the reports page loads this file on demand
 * (`next/dynamic`); the table view is the accessible alternative.
 */
export function DayChart({ data, measure }: { data: ReportSummary; measure: Measure }) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  const rows = useMemo(
    (): Row[] =>
      data.byDay.map((d) => ({ date: d.date, value: measure === "bookings" ? d.bookings : d.revenueCents })),
    [data, measure],
  );
  const tick = (value: number) => (measure === "bookings" ? String(value) : fmt.money(value));
  const yAxisWidth = measure === "bookings" ? 32 : 56;
  const [width, setWidth] = useState(0);
  const fits = width > 0 ? Math.max(1, Math.floor((width - yAxisWidth) / TICK_SLOT_PX)) : rows.length;
  const interval = Math.max(chartTickInterval(rows.length), Math.ceil(rows.length / fits) - 1);
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label={`${measure === "bookings" ? v("bookings", { title: true }) : "Revenue"} per day, ${rows.length} days. Switch to the table for exact values.`}
    >
      <ResponsiveContainer width="100%" height="100%" onResize={(w) => setWidth(w)}>
        <BarChart
          data={rows}
          margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          barCategoryGap={rows.length > 60 ? 1 : 2}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={{ stroke: "var(--chart-axis)" }}
            interval={interval}
            tick={{ fill: "var(--subtle-foreground)", fontSize: 11 }}
            tickFormatter={(d: string) => fmt.date(d, "short")}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={yAxisWidth}
            allowDecimals={false}
            tick={{ fill: "var(--subtle-foreground)", fontSize: 11 }}
            tickFormatter={tick}
          />
          <ChartTooltip
            cursor={{ fill: "var(--accent)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const row = payload[0]?.payload as Row | undefined;
              if (!active || !row) return null;
              return <DayTooltip row={row} measure={measure} />;
            }}
          />
          <Bar
            dataKey="value"
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DayTooltip({ row, measure }: { row: Row; measure: Measure }) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg">
      <div className="text-muted-foreground">{fmt.date(row.date, "dayMonthYear")}</div>
      <div className="tnum mt-0.5 flex items-center gap-1.5 font-semibold text-foreground">
        <span className="size-2 rounded-sm bg-chart-1" />
        {measure === "bookings" ? `${row.value} ${v("booking", { count: row.value })}` : fmt.money(row.value)}
      </div>
    </div>
  );
}
