"use client";

import { useCurrentBusiness } from "@/lib/business/business-context";
import {
  REPORT_RANGE_LABEL,
  REPORT_RANGES,
  type ClosedDateRange,
  type ReportRange,
} from "@/lib/dashboard/date-ranges";
import type { UrlParamsPatch } from "@/lib/hooks/use-url-params";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The report period: a preset, plus From/To pickers for a custom range. Writes `?range=&from=&to=`. */
export function ReportRangePicker({
  preset,
  range,
  setParams,
}: {
  preset: ReportRange;
  range: ClosedDateRange;
  setParams: (patch: UrlParamsPatch) => void;
}) {
  const business = useCurrentBusiness();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {preset === "custom" && (
        <>
          <DatePicker
            size="sm"
            value={range.from}
            onValueChange={(d) => setParams({ from: d })}
            max={range.to}
            timeZone={business.timezone}
            className="w-40"
          />
          <span className="text-subtle-foreground">–</span>
          <DatePicker
            size="sm"
            value={range.to}
            onValueChange={(d) => setParams({ to: d })}
            min={range.from}
            timeZone={business.timezone}
            className="w-40"
          />
        </>
      )}
      <Select
        value={preset}
        onValueChange={(p) =>
          setParams({
            range: p === "30d" ? null : p,
            ...(p === "custom" ? { from: range.from, to: range.to } : { from: null, to: null }),
          })
        }
      >
        <SelectTrigger size="sm" className="w-40" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {REPORT_RANGES.map((p) => (
            <SelectItem key={p} value={p}>
              {REPORT_RANGE_LABEL[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
