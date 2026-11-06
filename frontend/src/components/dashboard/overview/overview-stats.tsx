"use client";

import type { Booking, Overview } from "@/lib/api/types";
import { usePermissions } from "@/lib/business/business-context";
import { todayHint } from "@/lib/dashboard/overview";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { StatCard } from "@/components/ui/stat";
import { useFmt } from "../common";

/** Today, the next 7 days, the last 30 days and (for those who may see it) revenue. */
export function OverviewStats({
  overview,
  todays,
  now,
  loading,
}: {
  overview: Overview | undefined;
  todays: Booking[];
  now: Date;
  loading: boolean;
}) {
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const running = todays.filter(
    (b) => new Date(b.start) <= now && new Date(b.end) > now && b.status !== "pending_approval",
  ).length;
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4",
        perms.viewRevenue ? "lg:grid-cols-4" : "sm:grid-cols-3",
      )}
    >
      <StatCard
        label="Today"
        value={todays.length}
        loading={loading}
        // Not "A quiet day" before the bookings are in; a blank line keeps the tile's height. What's waiting for a
        // decision is counted in one place, the list that holds it, so two numbers never disagree.
        hint={
          loading
            ? "\u00a0"
            : running > 0
              ? `${running} in progress`
              : todayHint(
                  todays.filter((b) => b.status !== "pending_approval"),
                  now,
                  fmt.time,
                )
        }
      />
      <StatCard
        label="Next 7 days"
        value={overview?.upcomingCount7d ?? 0}
        loading={loading}
        hint={`Upcoming ${v("bookings")}`}
      />
      {/* Labels stay short enough for a phone's half-width tile (they don't wrap); the period is in the hint. */}
      <StatCard
        label={v("bookings", { title: true })}
        value={overview?.bookings30d ?? 0}
        loading={loading}
        hint="Booked in the last 30 days"
        // Without revenue there are three tiles: the third takes the whole row rather than leaving a gap.
        className={cn(!perms.viewRevenue && "max-sm:col-span-2")}
      />
      {perms.viewRevenue && (
        <StatCard
          label="Revenue"
          value={fmt.money(overview?.revenueCents30d ?? 0)}
          loading={loading}
          hint="Last 30 days, after refunds"
        />
      )}
    </div>
  );
}
