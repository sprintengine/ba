"use client";

import type { ReportSummary } from "@/lib/api/types";
import { percentOf } from "@/lib/dashboard/reports";
import { useVocabulary } from "@/lib/vocabulary";
import { StatCard } from "@/components/ui/stat";
import { useFmt } from "../common";

/** The period's headline numbers. */
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
  const fmt = useFmt();
  const share = (n: number) => {
    const pct = t ? percentOf(n, t.bookings) : null;
    return pct === null ? undefined : `${pct}% of ${v("bookings")}`;
  };
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label={v("bookings", { title: true })}
        value={t?.bookings ?? 0}
        loading={loading}
        hint={t ? `${t.confirmed} confirmed` : undefined}
      />
      <StatCard
        label="Revenue"
        value={fmt.money(t?.revenueCents ?? 0)}
        loading={loading}
        hint={t && days > 0 ? `${fmt.money(Math.round(t.revenueCents / days))} a day` : undefined}
      />
      <StatCard
        label="Cancelled"
        value={t?.cancelled ?? 0}
        loading={loading}
        hint={share(t?.cancelled ?? 0)}
      />
      <StatCard label="No-shows" value={t?.noShows ?? 0} loading={loading} hint={share(t?.noShows ?? 0)} />
      <StatCard label={`New ${v("customers")}`} value={t?.newCustomers ?? 0} loading={loading} />
      <StatCard label="Refunded" value={fmt.money(t?.refundedCents ?? 0)} loading={loading} />
    </div>
  );
}
