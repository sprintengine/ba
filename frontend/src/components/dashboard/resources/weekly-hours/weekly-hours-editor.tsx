"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Trash2 } from "lucide-react";
import type { DayOfWeek } from "@/lib/api/types";
import { useCustomerGroups, useReplaceResourceRules } from "@/lib/api/hooks";
import {
  addPeriod,
  copyDay,
  removeSchedule,
  scheduleFor,
  schedulesError,
  schedulesToRules,
  updateSchedule,
  validatePeriod,
  validateWeek,
  weeklyMinutes,
  type Schedule,
  type Schedules,
  type TimeRange,
  type WeekHours,
} from "@/lib/availability/weekly-hours";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { withToast } from "@/components/common/with-toast";
import { useFmt } from "../../common";
import { AddPeriodDialog } from "./add-period-dialog";
import { WeekTimeline } from "./week-timeline";

/** The weekly-hours editor: regular and seasonal schedules, a timeline of the week, save and discard. */
export function WeeklyHoursEditor({
  resourceId,
  initial,
  editable,
}: {
  resourceId: string;
  initial: Schedules;
  editable: boolean;
}) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const groups = useCustomerGroups(business.id);
  const save = useReplaceResourceRules(business.id, resourceId);
  const [schedules, setSchedules] = useState<Schedules>(initial);
  const [activeKey, setActiveKey] = useState(initial[0].key);
  const [adding, setAdding] = useState(false);
  const active = scheduleFor(schedules, activeKey);
  const dirty = useMemo(
    () => JSON.stringify(schedulesToRules(schedules)) !== JSON.stringify(schedulesToRules(initial)),
    [schedules, initial],
  );
  const tooMany = schedulesError(schedules);
  const valid = !tooMany && schedules.every((s) => validateWeek(s.days) && !validatePeriod(s));
  const activeGroups = (groups.data ?? []).filter((g) => g.isActive);

  const update = (patch: Partial<Omit<Schedule, "key">>) =>
    setSchedules((all) => updateSchedule(all, active.key, patch));
  const setDays = (days: WeekHours) => update({ days });
  const setDay = (day: DayOfWeek, ranges: TimeRange[]) => setDays({ ...active.days, [day]: ranges });

  const submit = async () => {
    await withToast(() => save.mutateAsync(schedulesToRules(schedules)), "Hours saved");
  };

  const label = (s: Schedule) =>
    s.validFrom === null && s.validUntil === null
      ? "Regular hours"
      : `${s.validFrom ? fmt.date(s.validFrom, "short") : "Until"}${s.validFrom && s.validUntil ? " – " : " "}${s.validUntil ? fmt.date(s.validUntil, "medium") : "onwards"}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {schedules.length > 1 ? (
          <Select value={active.key} onValueChange={setActiveKey}>
            <SelectTrigger size="sm" className="w-auto min-w-44" aria-label="Which hours">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {schedules.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {label(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm font-medium">Regular hours</span>
        )}
        <span className="tnum text-xs text-muted-foreground">
          {formatDuration(weeklyMinutes(active.days))} a week
        </span>
        {editable && (
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setAdding(true)}>
            <CalendarRange /> Seasonal hours
          </Button>
        )}
      </div>

      {active.validFrom !== null || active.validUntil !== null ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-sunken/60 p-3">
          <Field label="From" className="w-44">
            <DatePicker
              size="sm"
              value={active.validFrom}
              onValueChange={(d) => update({ validFrom: d })}
              disabled={!editable}
            />
          </Field>
          <Field label="Until" className="w-44" error={validatePeriod(active) ?? undefined}>
            <DatePicker
              size="sm"
              value={active.validUntil}
              onValueChange={(d) => update({ validUntil: d })}
              disabled={!editable}
            />
          </Field>
          {editable && (
            <Button
              size="sm"
              variant="danger-ghost"
              onClick={() => {
                setSchedules((all) => removeSchedule(all, active.key));
                setActiveKey(schedules[0].key);
              }}
            >
              <Trash2 /> Remove these hours
            </Button>
          )}
          <p className="basis-full text-xs text-muted-foreground">
            These hours apply on dates in this period, in addition to your regular hours.
          </p>
        </div>
      ) : null}

      {editable && (
        <p className="text-xs text-muted-foreground">
          <span className="pointer-coarse:hidden">
            Drag the end of a bar, click an empty part of a day to add hours, or click the times to type them.
          </span>
          <span className="hidden pointer-coarse:inline">Tap the times beside a day to change them.</span>
        </p>
      )}

      <WeekTimeline
        week={active.days}
        groups={activeGroups}
        editable={editable}
        onChangeDay={setDay}
        onCopyDay={(day, targets) => setDays(copyDay(active.days, day, targets))}
      />

      {editable && (dirty || tooMany) && (
        <div className="flex items-center justify-end gap-2">
          {tooMany ? (
            <span className="mr-auto text-xs font-medium text-danger-soft-foreground">{tooMany}</span>
          ) : (
            dirty && <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>
          )}
          <Button variant="ghost" disabled={!dirty} onClick={() => setSchedules(initial)}>
            Discard
          </Button>
          <Button variant="primary" disabled={!dirty || !valid} loading={save.isPending} onClick={submit}>
            Save hours
          </Button>
        </div>
      )}

      <AddPeriodDialog
        open={adding}
        onOpenChange={setAdding}
        onAdd={(from, until) => {
          const added = addPeriod(schedules, from, until);
          setSchedules(added.schedules);
          setActiveKey(added.key);
        }}
      />
    </div>
  );
}
