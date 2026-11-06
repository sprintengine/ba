"use client";

import type { Resource } from "@/lib/api/types";
import { useResourceAvailability } from "@/lib/api/hooks";
import { rulesToSchedules, WEEKDAYS } from "@/lib/availability/weekly-hours";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { ErrorState } from "@/components/common/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { WeeklyHoursEditor } from "./weekly-hours-editor";

/** Loads a resource's rules and renders the weekly-hours editor once ready. */
export function WeeklyHours({ resource, editable }: { resource: Resource; editable: boolean }) {
  const business = useCurrentBusiness();
  const availability = useResourceAvailability(business.id, resource.id);
  if (availability.isPending) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading hours">
        {WEEKDAYS.map((d) => (
          <Skeleton key={d.day} className="h-11 rounded-lg" />
        ))}
      </div>
    );
  }
  if (availability.isError)
    return <ErrorState error={availability.error} onRetry={() => availability.refetch()} />;
  // Start the editor afresh when the saved rules change (a save, another member's edit), not on every refetch:
  // `dataUpdatedAt` moves on each fetch (back to the tab, time off added) and would throw away unsaved edits.
  return (
    <WeeklyHoursEditor
      key={JSON.stringify(availability.data.rules)}
      resourceId={resource.id}
      color={resource.color}
      initial={rulesToSchedules(availability.data.rules)}
      editable={editable}
    />
  );
}
