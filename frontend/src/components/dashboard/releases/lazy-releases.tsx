"use client";

import dynamic from "next/dynamic";
import { useReleaseSchedules } from "@/lib/api/hooks";
import { useCurrentBusiness, usePermissions } from "@/lib/business/business-context";

/**
 * The release UI the calendar and the overview show (§21), loaded only when the business has an active release
 * schedule: most don't, and the panel's controls (date picker, popovers) are a chunk of script their first load
 * shouldn't carry. The schedules query is shared with the components themselves.
 */
const CalendarReleaseRowLazy = dynamic(
  () => import("./calendar-release-row").then((m) => m.CalendarReleaseRow),
  {
    ssr: false,
  },
);
const NextReleaseCardLazy = dynamic(() => import("./next-release-card").then((m) => m.NextReleaseCard), {
  ssr: false,
});

function useHasActiveSchedule(): boolean {
  const business = useCurrentBusiness();
  const perms = usePermissions();
  const schedules = useReleaseSchedules(business.id, { enabled: perms.manageSettings });
  return perms.manageSettings && (schedules.data ?? []).some((s) => s.status === "active");
}

export function CalendarReleases(props: React.ComponentProps<typeof CalendarReleaseRowLazy>) {
  return useHasActiveSchedule() ? <CalendarReleaseRowLazy {...props} /> : null;
}

export function OverviewRelease() {
  return useHasActiveSchedule() ? <NextReleaseCardLazy /> : null;
}
