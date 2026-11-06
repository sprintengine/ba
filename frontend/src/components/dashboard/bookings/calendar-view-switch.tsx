"use client";

import { useRouter } from "next/navigation";
import { CalendarRange, Columns3, List } from "lucide-react";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { dashboardHref } from "@/components/shells/dashboard-nav";

/** Day, Week and List as the calendar's toolbar has them: the list is a third view of the same bookings. */
export function CalendarViewSwitch() {
  const router = useRouter();
  const business = useCurrentBusiness();
  const calendar = dashboardHref(business.slug, "calendar");
  return (
    <div className="hidden sm:block">
      <SegmentedControl
        size="sm"
        aria-label="Calendar view"
        value="list"
        onValueChange={(view) => {
          if (view !== "list") router.push(view === "day" ? calendar : `${calendar}?view=week`);
        }}
        options={[
          { value: "day", label: "Day", icon: <Columns3 aria-hidden className="max-xl:hidden" /> },
          { value: "week", label: "Week", icon: <CalendarRange aria-hidden className="max-xl:hidden" /> },
          { value: "list", label: "List", icon: <List aria-hidden className="max-xl:hidden" /> },
        ]}
      />
    </div>
  );
}
