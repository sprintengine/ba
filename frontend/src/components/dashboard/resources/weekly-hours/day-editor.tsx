"use client";

import { useId } from "react";
import { Plus, X } from "lucide-react";
import type { CustomerGroup, DayOfWeek } from "@/lib/api/types";
import { nextRange, validateDay, type TimeRange } from "@/lib/availability/weekly-hours";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { TimeInput } from "@/components/ui/time-input";
import { AudiencePicker } from "./audience-picker";

const COPY_TARGETS: { label: string; days: DayOfWeek[] }[] = [
  { label: "all days", days: [1, 2, 3, 4, 5, 6, 7] },
  { label: "weekdays", days: [1, 2, 3, 4, 5] },
  { label: "the weekend", days: [6, 7] },
];

/** One weekday's hours in full, opened from the timeline: open or closed, each range, who can book it, and copying. */
export function DayEditor({
  label,
  ranges,
  groups,
  onChange,
  onCopy,
}: {
  label: string;
  ranges: TimeRange[];
  groups: CustomerGroup[];
  onChange: (ranges: TimeRange[]) => void;
  onCopy: (targets: DayOfWeek[]) => void;
}) {
  const errors = validateDay(ranges);
  const errorId = useId();
  const open = ranges.length > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <label className="flex items-center gap-2 text-sm text-muted-foreground pointer-coarse:min-h-11">
          {open ? "Open" : "Closed"}
          <Switch
            size="sm"
            aria-label={`${label} open`}
            checked={open}
            onCheckedChange={(c) => onChange(c ? [nextRange([])] : [])}
          />
        </label>
      </div>
      {ranges.map((r, i) => {
        // Several ranges on a day: number them so each control has its own name.
        const which = ranges.length > 1 ? ` (${i + 1})` : "";
        const error = errors[i];
        const invalid = {
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? `${errorId}-${i}` : undefined,
        };
        const setRange = (patch: Partial<TimeRange>) =>
          onChange(ranges.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <TimeInput
                size="sm"
                value={r.startTime}
                aria-label={`${label} start${which}`}
                {...invalid}
                className="w-full min-w-0 flex-1"
                onValueChange={(t) => t && setRange({ startTime: t })}
              />
              <span aria-hidden className="text-subtle-foreground">
                to
              </span>
              <TimeInput
                size="sm"
                value={r.endTime}
                aria-label={`${label} end${which}`}
                {...invalid}
                className="w-full min-w-0 flex-1"
                onValueChange={(t) => t && setRange({ endTime: t })}
              />
              <IconButton
                size="sm"
                label={`Remove ${label} ${r.startTime}–${r.endTime}`}
                onClick={() => onChange(ranges.filter((_, j) => j !== i))}
              >
                <X />
              </IconButton>
            </div>
            {groups.length > 0 && (
              <AudiencePicker
                label={`${label} ${r.startTime}–${r.endTime}`}
                groups={groups}
                value={r.audienceGroupIds}
                onChange={(ids) => setRange({ audienceGroupIds: ids })}
              />
            )}
            {error && (
              <p
                id={`${errorId}-${i}`}
                role="alert"
                className="text-xs font-medium text-danger-soft-foreground"
              >
                {error}
              </p>
            )}
          </div>
        );
      })}
      {open && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          aria-label={`Add hours to ${label}`}
          onClick={() => onChange([...ranges, nextRange(ranges)])}
        >
          <Plus /> Add hours
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-border-subtle pt-2">
        <span className="pr-1 text-xs text-muted-foreground">Copy to</span>
        {COPY_TARGETS.map((target) => (
          <Button
            key={target.label}
            size="xs"
            variant="ghost"
            aria-label={`Copy ${label} to ${target.label}`}
            onClick={() => onCopy(target.days)}
          >
            {target.label === "all days" ? "All days" : target.label === "weekdays" ? "Weekdays" : "Weekend"}
          </Button>
        ))}
      </div>
    </div>
  );
}
