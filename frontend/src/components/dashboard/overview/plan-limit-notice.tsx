"use client";

import Link from "next/link";
import { useBilling } from "@/lib/api/hooks";
import { useBusinessContext } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";

/** The month's bookings, once the plan's limit is reached; else null. */
export function usePlanLimitReached(businessId: string, enabled = true) {
  const usage = useBilling(businessId, { enabled }).data?.usage;
  return usage && usage.limit !== null && usage.bookingsThisMonth >= usage.limit ? usage.limit : null;
}

/** On the first page anyone sees: online bookings have stopped, which a business needs to know the day it happens. */
export function PlanLimitNotice() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const limit = usePlanLimitReached(business.id);
  if (limit === null) return null;
  return (
    <div className="flex items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
      <p>
        <span className="font-medium">
          You&rsquo;ve used all {limit} {v("bookings")} this month.
        </span>{" "}
        New online {v("bookings")} are paused until next month or an upgrade.
      </p>
      <Button asChild size="sm" variant="secondary" className="dark:bg-surface-raised dark:text-foreground">
        <Link href={dashboardHref(business.slug, "settings/billing")}>See plans</Link>
      </Button>
    </div>
  );
}
