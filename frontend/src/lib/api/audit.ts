import { api } from "./client";
import { businessPath } from "./paths";
import type { AuditEvent, AuditListQuery, Page } from "./types";

/** Audit log (§6.7). Admin only. */
export const auditApi = {
  list: (businessId: string, query: AuditListQuery = {}): Promise<Page<AuditEvent>> =>
    api.get<Page<AuditEvent>>(businessPath(businessId, "/audit"), query),
};
