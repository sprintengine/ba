"use client";

import type { ReportSummary } from "@/lib/api/types";
import { useState } from "react";
import { percentOf } from "@/lib/dashboard/reports";
import { useVocabulary } from "@/lib/vocabulary";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/ui/stat";
import { useFmt } from "../common";
import type { Measure } from "./day-chart";

/** A number that drives the chart below it: choosing it is how the chart changes. */
function ChartNumber({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "focus-ring rounded-xl p-3 text-left transition-colors [&_*]:cursor-pointer",
        selected ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      {children}
    </button>
  );
}

/** The period's headline numbers. Bookings and revenue pick what the chart shows; the rest are the quiet context. */
export function ReportTotals({
  totals: t,
  days,
  loading,
  measure,
  onMeasure,
}: {
  totals: ReportSummary["totals"] | undefined;
  /** Days in the period (for the revenue per day). */
  days: number;
  loading: boolean;
  measure: Measure;
  onMeasure: (measure: Measure) => void;
}) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const [more, setMore] = useState(false);
  const share = (n: number) => {
    const pct = t ? percentOf(n, t.bookings) : null;
    return pct === null ? undefined : `${pct}% of ${v("bookings")}`;
  };
  return (
    <div
      className={cn(
        "grid grid-cols-2 items-start gap-2 sm:grid-cols-3 lg:grid-cols-6",
        // A phone keeps the two that drive the chart, so the chart is on the first screen.
        !more && "max-sm:[&>*:nth-child(n+3)]:hidden max-sm:[&>button:last-child]:block",
      )}
    >
      <ChartNumber selected={measure === "bookings"} onSelect={() => onMeasure("bookings")}>
        <StatCard
          label={v("bookings", { title: true })}
          value={t?.bookings ?? 0}
          loading={loading}
          hint={t ? `${t.confirmed} confirmed` : undefined}
        />
      </ChartNumber>
      <ChartNumber selected={measure === "revenue"} onSelect={() => onMeasure("revenue")}>
        <StatCard
          label="Revenue"
          value={fmt.money(t?.revenueCents ?? 0)}
          loading={loading}
          hint={t && days > 0 ? `${fmt.money(Math.round(t.revenueCents / days))} a day` : undefined}
        />
      </ChartNumber>
      <StatCard
        className="p-3"
        label="Cancelled"
        value={t?.cancelled ?? 0}
        loading={loading}
        hint={share(t?.cancelled ?? 0)}
      />
      <StatCard
        className="p-3"
        label="No-shows"
        value={t?.noShows ?? 0}
        loading={loading}
        hint={share(t?.noShows ?? 0)}
      />
      <StatCard
        className="p-3"
        label={`New ${v("customers")}`}
        value={t?.newCustomers ?? 0}
        loading={loading}
        hint="First visit in this period"
      />
      <StatCard
        className="p-3"
        label="Refunded"
        value={fmt.money(t?.refundedCents ?? 0)}
        loading={loading}
        hint="Back to customers"
      />
      <button
        type="button"
        aria-expanded={more}
        onClick={() => setMore((m) => !m)}
        className="focus-ring col-span-2 min-h-11 rounded-lg text-left text-sm font-medium text-muted-foreground sm:hidden"
      >
        {more ? "Fewer figures" : "More figures"}
      </button>
    </div>
  );
}
