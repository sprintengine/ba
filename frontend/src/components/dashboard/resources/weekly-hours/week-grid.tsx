"use client";

import type { CustomerGroup, DayOfWeek } from "@/lib/api/types";
import { timelineAxis, WEEKDAYS, type TimeRange, type WeekHours } from "@/lib/availability/weekly-hours";
import { minutesToTime } from "@/lib/format/datetime";
import { DayColumn, HOUR_PX, type DayException } from "./day-column";

/** Hours between labels: fewer on a longer day. */
const labelStep = (hours: number) => (hours <= 12 ? 2 : 3);

/** Dates of the week on show, Monday first, with what's different on each. */
export type DatedWeek = { dates: string[]; today: string; exceptions: Record<string, DayException[]> };

/**
 * The week drawn as the calendar draws it: a column per day on one hour scale, so working hours read and compare
 * across days as shapes rather than as pairs of numbers.
 */
export function WeekGrid({
  week,
  dated,
  groups,
  editable,
  color,
  onChangeDay,
  onCopyDay,
}: {
  week: WeekHours;
  dated?: DatedWeek;
  groups: CustomerGroup[];
  editable: boolean;
  color?: string;
  onChangeDay: (day: DayOfWeek, ranges: TimeRange[]) => void;
  onCopyDay: (day: DayOfWeek, targets: DayOfWeek[]) => void;
}) {
  const axis = timelineAxis(week);
  const hours = (axis.end - axis.start) / 60;
  const step = labelStep(hours);
  const labels = Array.from({ length: Math.floor(hours / step) + 1 }, (_, i) => i * step);
  return (
    <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))]">
      {/* The hours down the left, as on the calendar. */}
      <div aria-hidden style={{ gridRow: 2 }} className="relative">
        {labels.map((h) => (
          <span
            key={h}
            className="tnum absolute right-1.5 -translate-y-1/2 text-2xs text-subtle-foreground"
            style={{ top: h * HOUR_PX }}
          >
            {minutesToTime(axis.start + h * 60)}
          </span>
        ))}
      </div>
      <span aria-hidden style={{ gridRow: 1, gridColumn: 1 }} />
      {WEEKDAYS.map(({ day, long, short }, i) => {
        const date = dated?.dates[i];
        return (
          <DayColumn
            key={day}
            day={day}
            label={long}
            short={short}
            date={date ? Number(date.slice(8)) : undefined}
            today={date === dated?.today}
            ranges={week[day]}
            exceptions={(date && dated.exceptions[date]) || []}
            axis={axis}
            groups={groups}
            editable={editable}
            color={color}
            onChange={(r) => onChangeDay(day, r)}
            onCopy={(targets) => onCopyDay(day, targets)}
          />
        );
      })}
    </div>
  );
}
