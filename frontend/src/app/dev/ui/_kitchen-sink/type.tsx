"use client";

import { formatDuration, formatMoney, formatTimeRange } from "@/lib/format";
import { Section, TZ } from "./section";

export function TypeSection() {
  return (
    <Section
      id="type"
      title="Typography"
      description="Figtree, the one typeface. Tight tracking on display sizes; .tnum for times and prices."
    >
      <div className="flex flex-col gap-4">
        <p className="text-display font-semibold">Book anything.</p>
        <p className="text-4xl font-semibold">Calendar for this week</p>
        <p className="text-2xl font-semibold">Initial assessment</p>
        <p className="text-lg font-medium">Sports massage · 60 min</p>
        <p className="max-w-2xl text-base text-muted-foreground">
          Body copy at 16px. Customers can cancel up to 24 hours before their appointment for a full refund;
          later cancellations are refunded according to the business&apos;s policy.
        </p>
        <p className="text-sm text-muted-foreground">
          Small UI text at 14px — the default for dashboard controls.
        </p>
        <div className="flex flex-wrap items-baseline gap-6">
          <span className="tnum text-2xl font-semibold">{formatMoney(128450, "EUR")}</span>
          <span className="tnum text-lg">
            {formatTimeRange("2026-10-01T09:00:00+01:00", "2026-10-01T09:45:00+01:00", TZ)}
          </span>
          <span className="font-mono text-sm text-muted-foreground">BA-7K3F9Q</span>
          <span className="text-sm">{formatDuration(90)}</span>
        </div>
      </div>
    </Section>
  );
}
