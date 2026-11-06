"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Trash2 } from "lucide-react";
import type { AvailabilityOverride, DayOfWeek } from "@/lib/api/types";
import { useClosures, useCustomerGroups, useReplaceResourceRules } from "@/lib/api/hooks";
import { overrideKind } from "@/lib/availability/time-off";
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
  WEEKDAYS,
  weeklyMinutes,
  type Schedule,
  type Schedules,
  type TimeRange,
  type WeekHours,
} from "@/lib/availability/weekly-hours";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { addDaysToPlainDate, formatDuration } from "@/lib/format";
import { isoWeekDates, timeToMinutes, todayInTz } from "@/lib/format/datetime";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { withToast } from "@/components/common/with-toast";
import { useFmt } from "../../common";
import { AddPeriodDialog } from "./add-period-dialog";
import type { DayException } from "./day-column";
import { WeekGrid, type DatedWeek } from "./week-grid";

const WEEKS_AHEAD = 4;
const WHOLE_DAY = { start: 0, end: 24 * 60 };

/** What's different on each date: an override or closure in the shape the week's grid draws. */
function exceptionsByDate(
  overrides: readonly AvailabilityOverride[],
  closures: readonly Pick<AvailabilityOverride, "date" | "startTime" | "endTime">[],
) {
  const byDate: Record<string, DayException[]> = {};
  const add = (date: string, x: DayException) => (byDate[date] ??= []).push(x);
  for (const o of overrides) {
    const kind = overrideKind(o);
    add(
      o.date,
      kind === "off"
        ? { kind, ...WHOLE_DAY }
        : { kind, start: timeToMinutes(o.startTime ?? "00:00"), end: timeToMinutes(o.endTime ?? "24:00") },
    );
  }
  for (const c of closures) {
    add(
      c.date,
      c.startTime && c.endTime
        ? { kind: "partial", start: timeToMinutes(c.startTime), end: timeToMinutes(c.endTime) }
        : { kind: "off", ...WHOLE_DAY },
    );
  }
  return byDate;
}

/** "Every day except Fri, 07:30–21:30", when the week is that simple. */
function weekPhrase(week: WeekHours): string | null {
  const open = WEEKDAYS.filter((d) => week[d.day].length > 0);
  const closed = WEEKDAYS.filter((d) => week[d.day].length === 0);
  const times = new Set(open.map((d) => week[d.day].map((r) => `${r.startTime}–${r.endTime}`).join(", ")));
  const [only] = times;
  if (only === undefined || times.size !== 1) return null;
  if (closed.length === 0) return `Every day, ${only}`;
  if (closed.length <= 2) return `Every day except ${closed.map((d) => d.short).join(" and ")}, ${only}`;
  return `${open.map((d) => d.short).join(", ")}, ${only}`;
}

/** The next four weeks: the one on show with what's different on it, and how to name each. */
function useDatedWeeks(overrides: readonly AvailabilityOverride[], weekIndex: string, regular: boolean) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const closures = useClosures(business.id);
  const today = todayInTz(business.timezone);
  const exceptions = useMemo(
    () => exceptionsByDate(overrides, closures.data ?? []),
    [overrides, closures.data],
  );
  const weeks = Array.from({ length: WEEKS_AHEAD }, (_, i) => isoWeekDates(addDaysToPlainDate(today, i * 7)));
  const weekLabel = (days: string[], i: number) => {
    if (i === 0) return "This week";
    const [from, to] = [days[0] ?? today, days[6] ?? today];
    return from.slice(5, 7) === to.slice(5, 7)
      ? `${Number(from.slice(8))}–${fmt.date(to, "short")}`
      : `${fmt.date(from, "short")} – ${fmt.date(to, "short")}`;
  };
  const dated: DatedWeek | undefined = regular
    ? { dates: weeks[Number(weekIndex)] ?? [], today, exceptions }
    : undefined;
  return { weeks, exceptions, dated, weekLabel };
}

/** The weekly-hours editor: regular and seasonal schedules, the week on the calendar's grid, save and discard. */
export function WeeklyHoursEditor({
  resourceId,
  color,
  initial,
  overrides,
  editable,
}: {
  resourceId: string;
  /** The calendar's colour, which fills its working hours as it fills its tile. */
  color?: string;
  initial: Schedules;
  /** Time off and extra hours, drawn over the dated weeks. */
  overrides: readonly AvailabilityOverride[];
  editable: boolean;
}) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const groups = useCustomerGroups(business.id);
  const [weekIndex, setWeekIndex] = useState("0");
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

  const regular = active.validFrom === null && active.validUntil === null;
  const { weeks, exceptions, dated, weekLabel } = useDatedWeeks(overrides, weekIndex, regular);
  const phrase = weekPhrase(active.days);

  const submit = async () => {
    await withToast(() => save.mutateAsync(schedulesToRules(schedules)), "Hours saved");
  };

  const label = (s: Schedule) =>
    s.validFrom === null && s.validUntil === null
      ? "Regular hours"
      : `${s.validFrom ? fmt.date(s.validFrom, "short") : "Until"}${s.validFrom && s.validUntil ? " – " : " "}${s.validUntil ? fmt.date(s.validUntil, "medium") : "onwards"}`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-4.5">
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
          <h3 className="text-sm font-semibold tracking-tight">Regular hours</h3>
        )}
        <span className="tnum text-xs text-muted-foreground">
          {formatDuration(weeklyMinutes(active.days))} a week
          {phrase && <span className="max-sm:hidden"> · {phrase}</span>}
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

      {regular && (
        <SegmentedControl
          size="sm"
          aria-label="Which week to show"
          className="max-w-full self-start"
          value={weekIndex}
          onValueChange={setWeekIndex}
          options={weeks.map((days, i) => ({
            value: String(i),
            label: (
              <span className="flex items-center gap-1 whitespace-nowrap">
                {weekLabel(days, i)}
                {days.some((d) => exceptions[d]) && (
                  <span aria-label="has changes" className="size-1.5 rounded-full bg-warning" />
                )}
              </span>
            ),
          }))}
        />
      )}

      <WeekGrid
        week={active.days}
        dated={dated}
        groups={activeGroups}
        editable={editable}
        color={color}
        onChangeDay={setDay}
        onCopyDay={(day, targets) => setDays(copyDay(active.days, day, targets))}
      />

      {editable && (
        <p className="text-xs text-muted-foreground">
          <span className="pointer-coarse:hidden">
            Drag a bar&rsquo;s end, click an empty stretch to add hours, or click the times to type them.
          </span>
          <span className="hidden pointer-coarse:inline">Tap the times above a day to change them.</span>
        </p>
      )}

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
