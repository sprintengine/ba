"use client";

import Link from "next/link";
import { useBilling } from "@/lib/api/hooks";
import { useBusinessContext } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";

/** On the first page anyone sees: online bookings have stopped, which a business needs to know the day it happens. */
export function PlanLimitNotice() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const usage = useBilling(business.id).data?.usage;
  if (!usage || usage.limit === null || usage.bookingsThisMonth < usage.limit) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
      <p>
        <span className="font-medium">
          You&rsquo;ve used all {usage.limit} {v("bookings")} this month.
        </span>{" "}
        New online {v("bookings")} are paused until next month or an upgrade.
      </p>
      <Button asChild size="sm" variant="secondary">
        <Link href={dashboardHref(business.slug, "settings/billing")}>See plans</Link>
      </Button>
    </div>
  );
}
