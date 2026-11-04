"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { useCustomerGroups, useReleaseSchedules } from "@/lib/api/hooks";
import { useCurrentBusiness, usePermissions } from "@/lib/business/business-context";
import { DEFAULT_LOCALE } from "@/lib/format/locale";
import { scheduleSummary, whoLabel } from "@/lib/releases/text";
import { dashboardHref } from "@/components/shells/dashboard-nav";

/**
 * In the service editor: the active release schedules that decide when this service's days open (§21), so the "Book
 * up to" limit isn't the whole story. Nothing for a new service or when no schedule covers it.
 */
export function ServiceReleaseNote({ serviceId }: { serviceId: string | null }) {
  const business = useCurrentBusiness();
  const perms = usePermissions();
  const enabled = perms.manageSettings && !!serviceId;
  const schedules = useReleaseSchedules(business.id, { enabled });
  const groups = useCustomerGroups(business.id, { enabled });
  const covering = (schedules.data ?? []).filter(
    (s) => s.status === "active" && serviceId !== null && s.serviceIds.includes(serviceId),
  );
  if (covering.length === 0) return null;
  const locale = business.locale || DEFAULT_LOCALE;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-surface-sunken/60 px-3 py-2.5 text-xs text-muted-foreground">
      <CalendarClock className="mt-px size-3.5 shrink-0" />
      <div className="flex flex-col gap-1">
        {covering.map((s) => (
          <p key={s.id}>
            <span className="font-medium text-foreground">{s.name}</span> ({whoLabel(s, groups.data ?? [])}):{" "}
            {scheduleSummary(s, locale)}
          </p>
        ))}
        <Link
          href={dashboardHref(business.slug, "settings/release-schedules")}
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          Release schedules
        </Link>
      </div>
    </div>
  );
}
