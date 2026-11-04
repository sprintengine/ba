"use client";

import { Copy, CopyCheck, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { TimeInput } from "@/components/ui/time-input";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SetupAction } from "@/lib/onboarding/actions";
import { DAY_LONG, DAY_SHORT, WEEKDAYS, windowsForDay } from "@/lib/onboarding/hours";
import type { SetupErrors, SetupGroup, SetupResource } from "@/lib/onboarding/types";

/**
 * Per-day open/closed toggles with one or more time windows per day. Windows restricted to a
 * customer group (e.g. medical card holders) show the group as a badge.
 */
export function WeeklyHoursEditor({
  resource,
  resourceIndex,
  groups,
  errors,
  otherResourceCount,
  resourcesNoun,
  dispatch,
}: {
  resource: SetupResource;
  resourceIndex: number;
  groups: SetupGroup[];
  errors: SetupErrors;
  otherResourceCount: number;
  resourcesNoun: string;
  dispatch: (action: SetupAction) => void;
}) {
  const key = resource.key;
  const mondayOpen = windowsForDay(resource.weeklyHours, 1).length > 0;
  const groupName = (k: string) => groups.find((g) => g.key === k)?.name ?? k;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Weekly hours</p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            disabled={!mondayOpen}
            onClick={() => dispatch({ type: "copyDayToWeekdays", resourceKey: key, fromDay: 1 })}
          >
            <Copy />
            Copy Monday to weekdays
          </Button>
          {otherResourceCount > 0 && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => dispatch({ type: "copyHoursToAll", resourceKey: key })}
            >
              <CopyCheck />
              Use for all {resourcesNoun.toLowerCase()}
            </Button>
          )}
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
        {WEEKDAYS.map((day) => {
          const windows = windowsForDay(resource.weeklyHours, day);
          const open = windows.length > 0;
          const switchId = `hours-${key}-${day}`;
          return (
            <li key={day} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex h-8 w-32 shrink-0 items-center gap-2.5">
                <Switch
                  id={switchId}
                  size="sm"
                  aria-label={DAY_LONG[day]}
                  checked={open}
                  onCheckedChange={(checked) =>
                    dispatch({ type: "setDayOpen", resourceKey: key, day, open: checked })
                  }
                />
                <label htmlFor={switchId} className="text-sm font-medium select-none">
                  <span className="sm:hidden">{DAY_LONG[day]}</span>
                  <span className="hidden sm:inline">{DAY_SHORT[day]}</span>
                </label>
              </div>
              {open ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {windows.map((w, i) => {
                    const flat = resource.weeklyHours.indexOf(w);
                    const p = `resources[${resourceIndex}].weeklyHours[${flat}].`;
                    const error =
                      errors[`${p}startTime`] ?? errors[`${p}endTime`] ?? errors[`${p}audienceGroupKeys`];
                    const errorId = `${switchId}-${i}-error`;
                    const describedBy = error ? errorId : undefined;
                    return (
                      <div key={`${day}-${i}`} className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div className="w-24 shrink-0">
                            <TimeInput
                              size="sm"
                              className="w-full"
                              aria-label={`${DAY_LONG[day]} opens`}
                              aria-invalid={!!errors[`${p}startTime`] || undefined}
                              aria-describedby={describedBy}
                              value={w.startTime}
                              onValueChange={(t) =>
                                t &&
                                dispatch({
                                  type: "updateWindow",
                                  resourceKey: key,
                                  day,
                                  windowIndex: i,
                                  patch: { startTime: t },
                                })
                              }
                            />
                          </div>
                          <span aria-hidden className="text-subtle-foreground">
                            –
                          </span>
                          <div className="w-24 shrink-0">
                            <TimeInput
                              size="sm"
                              className="w-full"
                              aria-label={`${DAY_LONG[day]} closes`}
                              aria-invalid={!!errors[`${p}endTime`] || undefined}
                              aria-describedby={describedBy}
                              value={w.endTime}
                              onValueChange={(t) =>
                                t &&
                                dispatch({
                                  type: "updateWindow",
                                  resourceKey: key,
                                  day,
                                  windowIndex: i,
                                  patch: { endTime: t },
                                })
                              }
                            />
                          </div>
                          {i === windows.length - 1 ? (
                            <IconButton
                              label={`Add another time on ${DAY_LONG[day]}`}
                              size="sm"
                              onClick={() => dispatch({ type: "addWindow", resourceKey: key, day })}
                            >
                              <Plus />
                            </IconButton>
                          ) : null}
                          {windows.length > 1 && (
                            <IconButton
                              label={`Remove ${w.startTime}–${w.endTime} on ${DAY_LONG[day]}`}
                              size="sm"
                              onClick={() =>
                                dispatch({ type: "removeWindow", resourceKey: key, day, windowIndex: i })
                              }
                            >
                              <X />
                            </IconButton>
                          )}
                          {w.audienceGroupKeys.length > 0 && (
                            <Tooltip content="Only these customers can book this time">
                              <Badge tone="info" tabIndex={0}>
                                {w.audienceGroupKeys.map(groupName).join(", ")} only
                              </Badge>
                            </Tooltip>
                          )}
                        </div>
                        {error && (
                          <p
                            id={errorId}
                            role="alert"
                            className="text-xs font-medium text-danger-soft-foreground"
                          >
                            {error}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={cn("flex h-8 items-center text-sm text-subtle-foreground")}>Closed</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
