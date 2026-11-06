"use client";

import type { ReportSummary } from "@/lib/api/types";
import { rankResources, rankServices } from "@/lib/dashboard/reports";
import { useVocabulary } from "@/lib/vocabulary";
import { useFmt } from "../common";

/** Bookings and revenue per service, with a bar relative to the busiest. */
export function ServiceBars({ data }: { data: ReportSummary }) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  const rows = rankServices(data.byService);
  const max = Math.max(1, ...rows.map((r) => r.bookings));
  if (rows.length === 0)
    return <p className="text-sm text-subtle-foreground">No {v("bookings")} in this period.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => (
        <li key={r.serviceId} className="relative isolate overflow-hidden rounded-md">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 -z-10 rounded-md bg-chart-1/15"
            style={{ width: `${(r.bookings / max) * 100}%` }}
          />
          <div className="flex items-baseline justify-between gap-3 px-2 py-1.5 text-sm">
            <span className="truncate font-medium">{r.name}</span>
            <span className="tnum shrink-0 text-muted-foreground">
              {r.bookings} · {fmt.money(r.revenueCents)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Booked time as a share of open hours, per resource. */
export function UtilisationBars({ data }: { data: ReportSummary }) {
  const fmt = useFmt();
  const rows = rankResources(data.byResource);
  if (rows.length === 0) return <p className="text-sm text-subtle-foreground">Nothing to show yet.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => {
        const pct = Math.round(r.utilisation * 100);
        return (
          <li key={r.resourceId} className="relative isolate overflow-hidden rounded-md">
            <div
              className="absolute inset-0 -z-10"
              role="meter"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${r.name} utilisation`}
            >
              <div className="h-full rounded-md bg-chart-1/15" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <div className="flex items-baseline justify-between gap-3 px-2 py-1.5 text-sm">
              <span className="truncate font-medium">{r.name}</span>
              <span className="tnum shrink-0 text-muted-foreground">
                <span className="font-medium text-foreground">{pct}%</span> ·{" "}
                {fmt.duration(Math.round(r.bookedMinutes))} of {fmt.duration(Math.round(r.availableMinutes))}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
