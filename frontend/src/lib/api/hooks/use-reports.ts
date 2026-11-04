"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "../query-keys";
import { reportsApi } from "../reports";
import type { DateRange, ReportSummary } from "../types";
import { enabledWhen, type QueryOptions } from "./shared";

/** Admin only. `range` is `YYYY-MM-DD` inclusive dates in the business timezone. */
export function useReportSummary(
  businessId: string,
  range: DateRange,
  options?: QueryOptions<ReportSummary>,
) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).reports(range),
    queryFn: () => reportsApi.summary(businessId, range),
    enabled: enabledWhen(!!businessId && !!range.from && !!range.to, options),
  });
}
