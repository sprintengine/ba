"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AiUsage } from "@/lib/api/types";
import { formatCredits } from "@/lib/ai/credits";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useFmt } from "../common";

/** Room one date label ("14 Oct") needs on the x-axis, so they never run into each other on a phone. */
const TICK_SLOT_PX = 52;
const Y_AXIS_WIDTH = 40;

/**
 * AI credits per day as a bar chart. Recharts is heavy, so the billing page loads this file on demand
 * (`next/dynamic`); the table view is the accessible alternative.
 */
export function DailyChart({ usage }: { usage: AiUsage }) {
  const fmt = useFmt();
  const business = useCurrentBusiness();
  const days = usage.daily.length;
  const [width, setWidth] = useState(0);
  const fits = width > 0 ? Math.max(1, Math.floor((width - Y_AXIS_WIDTH) / TICK_SLOT_PX)) : days;
  const interval = Math.max(days > 14 ? Math.ceil(days / 10) - 1 : 0, Math.ceil(days / fits) - 1);
  return (
    <div
      className="h-48 w-full"
      role="img"
      aria-label={`AI credits used per day, ${usage.daily.length} days. Switch to the table for exact values.`}
    >
      <ResponsiveContainer width="100%" height="100%" onResize={(w) => setWidth(w)}>
        <BarChart data={usage.daily} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
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
            width={Y_AXIS_WIDTH}
            tick={{ fill: "var(--subtle-foreground)", fontSize: 11 }}
          />
          <ChartTooltip
            cursor={{ fill: "var(--accent)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const first = payload[0];
              if (!active || !first) return null;
              const row = first.payload as AiUsage["daily"][number];
              return (
                <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg">
                  <div className="text-muted-foreground">{fmt.day(row.date)}</div>
                  <div className="tnum mt-0.5 flex items-center gap-1.5 font-semibold text-foreground">
                    <span className="size-2 rounded-sm bg-chart-1" />
                    {formatCredits(row.credits, business.locale)} credits
                  </div>
                </div>
              );
            }}
          />
          <Bar
            dataKey="credits"
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
