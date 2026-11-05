"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { useOverview } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { firstName, todaysBookings } from "@/lib/dashboard/overview";
import { greetingAt, todayInTz } from "@/lib/format/datetime";
import { useNow } from "@/lib/hooks/use-now";
import { useVocabulary } from "@/lib/vocabulary";
import { PlanLimitNotice } from "./plan-limit-notice";
import { ErrorState } from "@/components/common/feedback";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { useBookingActions } from "../booking/booking-actions-provider";
import { useFmt } from "../common";
import { OverviewRelease } from "../releases/lazy-releases";
import { OverviewStats } from "./overview-stats";
import { PendingApprovals } from "./pending-approvals";
import { SetupChecklist } from "./setup-checklist";
import { ShareCard } from "./share-card";
import { TodayCard } from "./today-card";

export function OverviewView() {
  const { business, me } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const now = useNow();
  const { openNewBooking } = useBookingActions();
  const today = todayInTz(business.timezone, now);
  const overview = useOverview(business.id, today);
  const name = firstName(me.user.name);
  const todays = useMemo(() => todaysBookings(overview.data?.today ?? []), [overview.data]);

  return (
    <PageContainer size="wide">
      <PageHeader
        title={`${greetingAt(now, business.timezone)}${name ? `, ${name}` : ""}`}
        description={fmt.date(today, "long")}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={dashboardHref(business.slug, "calendar")}>
                <CalendarDays /> Calendar
              </Link>
            </Button>
            <Button variant="primary" onClick={() => openNewBooking()}>
              <Plus /> New {v("booking")}
            </Button>
          </>
        }
      />

      {/* A failed refresh keeps the figures already loaded; the error is for when there are none. */}
      {overview.isError && !overview.data ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} headingLevel={2} />
      ) : (
        <div className="flex flex-col gap-6">
          <OverviewRelease />
          {perms.manageBilling && <PlanLimitNotice />}
          <OverviewStats overview={overview.data} todays={todays} now={now} loading={overview.isPending} />
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <TodayCard bookings={todays} loading={overview.isPending} now={now} />
            <div className="contents lg:flex lg:flex-col lg:gap-6">
              {perms.manageSettings && overview.data && <SetupChecklist items={overview.data.checklist} />}
              <PendingApprovals today={today} />
              <ShareCard />
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
