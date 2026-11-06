"use client";

import type { AvailabilityOverride, AvailabilityRule, DayOfWeek } from "@/lib/api/types";
import { useClosures } from "@/lib/api/hooks";
import { overrideKind } from "@/lib/availability/time-off";
import { rulesToSchedules } from "@/lib/availability/weekly-hours";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { addDaysToPlainDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hoursFill } from "./weekly-hours/day-row";

const DAYS = 28;

type DayLook = "work" | "rest" | "off" | "part" | "extra";

/** Monday is 1 and Sunday 7, as in the weekly hours. */
const weekday = (date: string): DayOfWeek =>
  (((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1) as DayOfWeek;

const HATCH = "repeating-linear-gradient(135deg, var(--border-strong) 0 1px, transparent 1px 5px)";

/**
 * The next four weeks at a glance, drawn with the calendar's own marks: working days in this calendar's colour, days
 * nobody works sunken, time off hatched. It repeats the list below it in a shape, so it's hidden from screen readers.
 */
export function NextWeeks({
  today,
  rules,
  overrides,
  color,
  person,
}: {
  today: string;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  color?: string;
  person: boolean;
}) {
  const business = useCurrentBusiness();
  const closures = useClosures(business.id);
  const week = rulesToSchedules(rules)[0].days;
  const closed = new Set((closures.data ?? []).filter((c) => !c.startTime).map((c) => c.date));
  const look = (date: string): DayLook => {
    const set = overrides.filter((o) => o.date === date).map(overrideKind);
    if (closed.has(date) || set.includes("off")) return "off";
    if (set.includes("partial")) return "part";
    if (set.includes("extra")) return "extra";
    return week[weekday(date)].length > 0 ? "work" : "rest";
  };
  const days = Array.from({ length: DAYS }, (_, i) => addDaysToPlainDate(today, i));
  return (
    <div aria-hidden className="flex flex-col gap-1.5" data-next-weeks="">
      <div className="grid grid-cols-14 gap-0.5 sm:grid-cols-28">
        {days.map((date) => {
          const kind = look(date);
          const open = kind === "work" || kind === "extra" || kind === "part";
          return (
            <span
              key={date}
              style={{
                ...(open && color ? hoursFill(color) : undefined),
                ...(kind === "off" ? { backgroundImage: HATCH } : undefined),
              }}
              className={cn(
                "tnum flex h-8 items-center justify-center rounded-md text-2xs",
                open && !color && "bg-foreground/10",
                !open && "bg-surface-sunken text-subtle-foreground",
                open && "font-medium",
                kind === "part" && "ring-1 ring-warning-border ring-inset",
                kind === "extra" && "ring-1 ring-success-border ring-inset",
                date === today && "font-semibold underline underline-offset-2",
              )}
            >
              {Number(date.slice(8))}
            </span>
          );
        })}
      </div>
      <p className="text-2xs text-subtle-foreground">
        Next four weeks. Hatched days are {person ? "time off" : "closed"}, pale ones have no regular hours.
      </p>
    </div>
  );
}
