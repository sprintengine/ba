"use client";

import { CalendarRange, Columns3, List } from "lucide-react";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { cn } from "@/lib/utils";
import { AppLink } from "@/components/ui/app-link";
import { dashboardHref } from "@/components/shells/dashboard-nav";

const ITEM =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4 max-xl:[&_svg]:hidden";

/** Day, Week and List as the calendar's toolbar has them: the list is a third view of the same bookings. */
export function CalendarViewSwitch() {
  const business = useCurrentBusiness();
  const calendar = dashboardHref(business.slug, "calendar");
  return (
    <nav aria-label="Calendar view" className="hidden items-center rounded-lg bg-muted p-0.5 sm:flex">
      <AppLink href={calendar} className={cn(ITEM, "text-muted-foreground hover:text-foreground")}>
        <Columns3 aria-hidden /> Day
      </AppLink>
      <AppLink
        href={`${calendar}?view=week`}
        className={cn(ITEM, "text-muted-foreground hover:text-foreground")}
      >
        <CalendarRange aria-hidden /> Week
      </AppLink>
      <span aria-current="page" className={cn(ITEM, "bg-surface text-foreground shadow-xs")}>
        <List aria-hidden /> List
      </span>
    </nav>
  );
}
