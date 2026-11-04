"use client";

import { Filter } from "lucide-react";
import type { BookingStatus } from "@/lib/api/types";
import { BOOKING_STATUS_OPTIONS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** "Status" multi-select popover; the trigger shows how many statuses are picked. */
export function StatusFilter({
  value,
  onChange,
}: {
  value: BookingStatus[];
  onChange: (s: BookingStatus[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          className={cn("shrink-0 justify-start", value.length > 0 && "border-brand-border")}
        >
          <Filter /> Status
          {value.length > 0 && (
            <Badge tone="brand" className="h-5 px-1.5">
              {value.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        {BOOKING_STATUS_OPTIONS.map((o) => {
          const checked = value.includes(o.value);
          return (
            <label
              key={o.value}
              className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent pointer-coarse:h-11"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(c) =>
                  onChange(c ? [...value, o.value] : value.filter((x) => x !== o.value))
                }
              />
              {o.label}
            </label>
          );
        })}
        {value.length > 0 && (
          <Button size="xs" variant="ghost" block className="mt-1" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
