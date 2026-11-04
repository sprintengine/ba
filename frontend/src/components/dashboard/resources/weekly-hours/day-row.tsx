"use client";

import { useId } from "react";
import { Copy, Plus, X } from "lucide-react";
import type { CustomerGroup, DayOfWeek } from "@/lib/api/types";
import { nextRange, validateDay, type TimeRange } from "@/lib/availability/weekly-hours";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { TimeInput } from "@/components/ui/time-input";
import { AudiencePicker } from "./audience-picker";

/** One weekday: open or closed, its time ranges (with who can book them) and copy-to-other-days. */
export function DayRow({
  label,
  ranges,
  groups,
  editable,
  onChange,
  onCopy,
}: {
  label: string;
  ranges: TimeRange[];
  groups: CustomerGroup[];
  editable: boolean;
  onChange: (ranges: TimeRange[]) => void;
  onCopy: (targets: DayOfWeek[]) => void;
}) {
  const errors = validateDay(ranges);
  const open = ranges.length > 0;
  const errorId = useId();
  return (
    // Phones: the day and its actions on one line, the hours full width below; from sm, one row.
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-4 py-3 sm:flex sm:flex-row">
      <div className="flex w-36 shrink-0 items-center gap-3 sm:h-9 pointer-coarse:min-h-11 pointer-coarse:sm:h-11">
        <Switch
          size="sm"
          aria-label={`${label} open`}
          checked={open}
          disabled={!editable}
          onCheckedChange={(c) => onChange(c ? [nextRange([])] : [])}
        />
        <span className={cn("text-sm font-medium", !open && "text-muted-foreground")}>{label}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 max-sm:col-span-2">
        {!open ? (
          <span className="text-sm text-subtle-foreground sm:leading-9 pointer-coarse:sm:leading-11">
            Closed
          </span>
        ) : (
          ranges.map((r, i) => {
            // Several ranges on a day: number them so each control has its own name.
            const which = ranges.length > 1 ? ` (${i + 1})` : "";
            const error = errors[i];
            const invalid = {
              "aria-invalid": error ? true : undefined,
              "aria-describedby": error ? `${errorId}-${i}` : undefined,
            };
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-24 flex-1 sm:w-28 sm:flex-none">
                    <TimeInput
                      size="sm"
                      value={r.startTime}
                      disabled={!editable}
                      aria-label={`${label} start${which}`}
                      {...invalid}
                      className="w-full"
                      onValueChange={(t) =>
                        t && onChange(ranges.map((x, j) => (j === i ? { ...x, startTime: t } : x)))
                      }
                    />
                  </div>
                  <span className="text-subtle-foreground">–</span>
                  <div className="min-w-24 flex-1 sm:w-28 sm:flex-none">
                    <TimeInput
                      size="sm"
                      value={r.endTime}
                      disabled={!editable}
                      aria-label={`${label} end${which}`}
                      {...invalid}
                      className="w-full"
                      onValueChange={(t) =>
                        t && onChange(ranges.map((x, j) => (j === i ? { ...x, endTime: t } : x)))
                      }
                    />
                  </div>
                  {groups.length > 0 && (
                    <AudiencePicker
                      label={`${label} ${r.startTime}–${r.endTime}`}
                      groups={groups}
                      value={r.audienceGroupIds}
                      disabled={!editable}
                      onChange={(ids) =>
                        onChange(ranges.map((x, j) => (j === i ? { ...x, audienceGroupIds: ids } : x)))
                      }
                    />
                  )}
                  {editable && (
                    <IconButton
                      size="sm"
                      label={`Remove ${label} ${r.startTime}–${r.endTime}`}
                      onClick={() => onChange(ranges.filter((_, j) => j !== i))}
                    >
                      <X />
                    </IconButton>
                  )}
                </div>
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
          })
        )}
      </div>
      {editable && (
        <div className="flex shrink-0 items-center gap-0.5 max-sm:col-start-2 max-sm:row-start-1 sm:h-9 pointer-coarse:sm:h-11">
          {open && (
            <IconButton
              size="sm"
              label={`Add hours to ${label}`}
              onClick={() => onChange([...ranges, nextRange(ranges)])}
            >
              <Plus />
            </IconButton>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton size="sm" label={`Copy ${label}`}>
                <Copy />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onCopy([1, 2, 3, 4, 5, 6, 7])}>
                Copy to all days
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCopy([1, 2, 3, 4, 5])}>Copy to weekdays</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCopy([6, 7])}>Copy to the weekend</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
