"use client";

import type { BookingStatus } from "@/lib/api/types";
import { BOOKING_STATUS_OPTIONS } from "@/lib/status";
import { Checkbox } from "@/components/ui/checkbox";

/** The statuses to show, any number of them, inside the bookings' Filters. */
export function StatusFilter({
  value,
  onChange,
}: {
  value: BookingStatus[];
  onChange: (s: BookingStatus[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="pb-1 text-xs font-medium text-muted-foreground">Status</legend>
      <div className="grid grid-cols-2 gap-x-2">
        {BOOKING_STATUS_OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-1 text-sm hover:bg-accent pointer-coarse:h-11"
          >
            <Checkbox
              checked={value.includes(o.value)}
              onCheckedChange={(c) => onChange(c ? [...value, o.value] : value.filter((x) => x !== o.value))}
            />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
