import { api } from "./client";
import { businessPath } from "./paths";
import type { DateRange, ReportSummary } from "./types";

/** Reports (§6.7). Admin only. */
export const reportsApi = {
  summary: (businessId: string, range: DateRange): Promise<ReportSummary> =>
    api.get<ReportSummary>(businessPath(businessId, "/reports/summary"), range),
};
