"use client";

import type { CustomerGroup, DayOfWeek } from "@/lib/api/types";
import { timelineAxis, WEEKDAYS, type TimeRange, type WeekHours } from "@/lib/availability/weekly-hours";
import { minutesToTime } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { DayRow, ROW_GRID } from "./day-row";

/** Hours between axis labels: fewer labels on a longer day. */
const labelStep = (hours: number) => (hours <= 8 ? 2 : hours <= 18 ? 3 : 4);

/**
 * The week at a glance: a row per day on one shared time axis, so working hours read and compare across days as
 * shapes rather than as pairs of numbers.
 */
export function WeekTimeline({
  week,
  groups,
  editable,
  onChangeDay,
  onCopyDay,
}: {
  week: WeekHours;
  groups: CustomerGroup[];
  editable: boolean;
  onChangeDay: (day: DayOfWeek, ranges: TimeRange[]) => void;
  onCopyDay: (day: DayOfWeek, targets: DayOfWeek[]) => void;
}) {
  const axis = timelineAxis(week);
  const hours = (axis.end - axis.start) / 60;
  const step = labelStep(hours);
  const labels = Array.from({ length: Math.floor(hours / step) + 1 }, (_, i) => i * step);
  return (
    <div className="flex flex-col">
      <div aria-hidden className={ROW_GRID}>
        <span className="max-sm:hidden" />
        <div className="relative h-5 max-sm:col-span-full">
          {labels.map((h, i) => (
            <span
              key={h}
              className={cn(
                "tnum absolute top-0 text-2xs text-subtle-foreground",
                // The first label sits inside the track, the last ends at its edge; the rest centre on their line.
                i === 0 ? "" : h === hours ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${(h / hours) * 100}%` }}
            >
              {minutesToTime(axis.start + h * 60)}
            </span>
          ))}
        </div>
      </div>
      {WEEKDAYS.map(({ day, long, short }) => (
        <DayRow
          key={day}
          day={day}
          label={long}
          short={short}
          ranges={week[day]}
          axis={axis}
          groups={groups}
          editable={editable}
          onChange={(r) => onChangeDay(day, r)}
          onCopy={(targets) => onCopyDay(day, targets)}
        />
      ))}
    </div>
  );
}
