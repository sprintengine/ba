"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useAiUsage } from "@/lib/api/hooks";
import type { AiUsage } from "@/lib/api/types";
import { aiCreditUses, formatCredits } from "@/lib/ai/credits";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { CreditsMeter, CreditsNotice } from "@/components/ai/credits";
import { ErrorState } from "@/components/common/feedback";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFmt } from "../common";
import { SettingGroup, SettingRow } from "./settings-common";

/** Recharts only loads when the chart is shown (it was a third of the billing page's JavaScript). */
const DailyChart = dynamic(() => import("./ai-usage-chart").then((m) => m.DailyChart), {
  ssr: false,
  loading: () => <Skeleton className="h-48 rounded-lg" />,
});

/**
 * Settings → Billing: this month's AI credits, what used them and a daily series (with a table view). Not shown where
 * nothing on this deployment draws on them (`aiCreditUses`).
 */
export function AiUsageCard() {
  const business = useCurrentBusiness();
  const uses = aiCreditUses(business);
  return uses ? <AiUsageDetails uses={uses} /> : null;
}

function AiUsageDetails({ uses }: { uses: string }) {
  const business = useCurrentBusiness();
  const usage = useAiUsage(business.id);
  const [asTable, setAsTable] = useState(false);
  const u = usage.data;
  return (
    <SettingGroup
      title="AI credits"
      description={`One monthly allowance for ${uses}. Each AI request uses credits in line with the model work it takes; unused credits don't roll over.`}
    >
      {usage.isError ? (
        <SettingRow stacked>
          <ErrorState error={usage.error} onRetry={() => usage.refetch()} />
        </SettingRow>
      ) : !u ? (
        <SettingRow stacked>
          <Skeleton className="h-40 rounded-lg" />
        </SettingRow>
      ) : (
        <>
          <SettingRow stacked>
            <CreditsMeter credits={u.credits} />
            <CreditsNotice credits={u.credits} />
            {!u.model.configured && (
              <p className="text-sm text-muted-foreground">
                No AI model is connected on this server, so AI features use the free built-in helpers.
              </p>
            )}
          </SettingRow>
          <SettingRow stacked>
            <FeatureBreakdown usage={u} />
          </SettingRow>
          <SettingRow stacked>
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium">Credits per day</h4>
              <SegmentedControl
                size="sm"
                aria-label="Display"
                value={asTable ? "table" : "chart"}
                onValueChange={(x) => setAsTable(x === "table")}
                options={[
                  { value: "chart", label: "Chart" },
                  { value: "table", label: "Table" },
                ]}
              />
            </div>
            {asTable ? <DailyTable usage={u} /> : <DailyChart usage={u} />}
          </SettingRow>
        </>
      )}
    </SettingGroup>
  );
}

function FeatureBreakdown({ usage }: { usage: AiUsage }) {
  const business = useCurrentBusiness();
  const rows = usage.byFeature.filter((f) => f.requests > 0).sort((a, b) => b.credits - a.credits);
  const max = Math.max(0.01, ...rows.map((r) => r.credits));
  if (rows.length === 0) return <p className="text-sm text-subtle-foreground">No AI used yet this month.</p>;
  return (
    <ul className="flex flex-col gap-3.5" aria-label="Credits by feature">
      {rows.map((r) => (
        <li key={r.feature} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{r.label}</span>
            <span className="tnum shrink-0 text-muted-foreground">
              <span className="font-medium text-foreground">{formatCredits(r.credits, business.locale)}</span>{" "}
              credits · {r.requests} {r.requests === 1 ? "request" : "requests"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${(r.credits / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DailyTable({ usage }: { usage: AiUsage }) {
  const fmt = useFmt();
  const business = useCurrentBusiness();
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 bg-surface-sunken">
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead align="right">Credits</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...usage.daily].reverse().map((d) => (
            <TableRow key={d.date}>
              <TableCell className="h-9">{fmt.day(d.date)}</TableCell>
              <TableCell align="right" className="h-9">
                {formatCredits(d.credits, business.locale)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
