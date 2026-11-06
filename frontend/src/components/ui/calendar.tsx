"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
  addDaysToPlainDate,
  addMonths,
  addMonthsKeepingDay,
  daysInMonth,
  formatDate,
  isoWeekday,
  monthOf,
  todayInTz,
  type PlainDate,
  type PlainMonth,
} from "@/lib/format/datetime";
import { browserTimeZone } from "@/lib/format/timezones";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type CalendarProps = {
  value?: PlainDate | null;
  onValueChange?: (date: PlainDate) => void;
  /** Controlled visible month ("YYYY-MM"). */
  month?: PlainMonth;
  defaultMonth?: PlainMonth;
  onMonthChange?: (month: PlainMonth) => void;
  min?: PlainDate;
  max?: PlainDate;
  isDateDisabled?: (date: PlainDate) => boolean;
  /** Show a small dot under the day (e.g. "has availability"). */
  hasMarker?: (date: PlainDate) => boolean;
  /** Show a small lock under the day instead (e.g. "not open for booking yet"); the day stays selectable. */
  isDateLocked?: (date: PlainDate) => boolean;
  /** Timezone used to determine "today" (business timezone). Defaults to the browser's. */
  timeZone?: string;
  size?: "md" | "lg";
  className?: string;
  "aria-label"?: string;
};

/**
 * Month grid over plain dates ("YYYY-MM-DD") — no Date/timezone pitfalls.
 * Weeks start on Monday. Keyboard: arrows move by day/week, Home/End to week
 * start/end, PageUp/PageDown by month (Shift = year), Enter/Space selects.
 */
export function Calendar({
  value,
  onValueChange,
  month: monthProp,
  defaultMonth,
  onMonthChange,
  min,
  max,
  isDateDisabled,
  hasMarker,
  isDateLocked,
  timeZone,
  size = "md",
  className,
  "aria-label": ariaLabel = "Calendar",
}: CalendarProps) {
  const tz = timeZone ?? browserTimeZone() ?? "UTC";
  const today = useMemo(() => todayInTz(tz), [tz]);
  const [internalMonth, setInternalMonth] = useState<PlainMonth>(defaultMonth ?? monthOf(value ?? today));
  const month = monthProp ?? internalMonth;
  const setMonth = (m: PlainMonth) => {
    if (monthProp === undefined) setInternalMonth(m);
    onMonthChange?.(m);
  };

  const [focused, setFocused] = useState<PlainDate>(
    value ?? (monthOf(today) === month ? today : `${month}-01`),
  );
  const focusFromKeyboard = useRef(false);
  const buttons = useRef(new Map<PlainDate, HTMLButtonElement>());

  const focusedInMonth =
    monthOf(focused) === month ? focused : value && monthOf(value) === month ? value : `${month}-01`;

  useEffect(() => {
    if (focusFromKeyboard.current) {
      buttons.current.get(focusedInMonth)?.focus();
      focusFromKeyboard.current = false;
    }
  }, [focusedInMonth]);

  const disabled = (d: PlainDate) => (min && d < min) || (max && d > max) || isDateDisabled?.(d) || false;

  const weeks = useMemo(() => {
    const first = `${month}-01`;
    const lead = isoWeekday(first) - 1;
    const total = daysInMonth(month);
    const cells: (PlainDate | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: total }, (_, i) => addDaysToPlainDate(first, i)),
    ];
    while (cells.length % 7) cells.push(null);
    const rows: (PlainDate | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  function move(to: PlainDate) {
    focusFromKeyboard.current = true;
    setFocused(to);
    if (monthOf(to) !== month) setMonth(monthOf(to));
  }

  function onKeyDown(e: React.KeyboardEvent, date: PlainDate) {
    const wd = isoWeekday(date);
    const map: Record<string, () => PlainDate> = {
      ArrowLeft: () => addDaysToPlainDate(date, -1),
      ArrowRight: () => addDaysToPlainDate(date, 1),
      ArrowUp: () => addDaysToPlainDate(date, -7),
      ArrowDown: () => addDaysToPlainDate(date, 7),
      Home: () => addDaysToPlainDate(date, 1 - wd),
      End: () => addDaysToPlainDate(date, 7 - wd),
      PageUp: () => addMonthsKeepingDay(date, e.shiftKey ? -12 : -1),
      PageDown: () => addMonthsKeepingDay(date, e.shiftKey ? 12 : 1),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      move(fn());
    }
  }

  const canPrev = !min || addMonths(month, -1) >= monthOf(min);
  const canNext = !max || addMonths(month, 1) <= monthOf(max);
  const cell =
    size === "lg" ? "size-11 sm:size-12 text-[0.9375rem]" : "size-9 text-sm pointer-coarse:size-10";

  return (
    <div className={cn("inline-flex flex-col gap-3 select-none", className)}>
      <div className="flex items-center justify-between gap-2 pl-2">
        <h2
          aria-live="polite"
          className={cn("font-semibold tracking-tight", size === "lg" ? "text-base" : "text-sm")}
        >
          {formatDate(`${month}-01`, "UTC", "monthYear")}
        </h2>
        <div className="flex items-center gap-0.5">
          <NavButton
            label="Previous month"
            disabled={!canPrev}
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeft className="size-4" />
          </NavButton>
          <NavButton label="Next month" disabled={!canNext} onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="size-4" />
          </NavButton>
        </div>
      </div>
      <table role="grid" aria-label={ariaLabel} className="border-collapse" key={month}>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th
                key={d}
                scope="col"
                abbr={d}
                className="pb-1 text-center text-xs font-medium text-muted-foreground"
              >
                {d.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="animate-fade-in">
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((date, di) => {
                if (!date) return <td key={di} className={cell} />;
                const isSelected = value === date;
                const isToday = today === date;
                const isDisabled = disabled(date);
                const marker = !isDisabled && hasMarker?.(date);
                const locked = !isDisabled && !marker && isDateLocked?.(date);
                return (
                  <td
                    key={date}
                    className="p-0.5 text-center"
                    role="gridcell"
                    aria-selected={isSelected || undefined}
                  >
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) buttons.current.set(date, el);
                        else buttons.current.delete(date);
                      }}
                      tabIndex={date === focusedInMonth ? 0 : -1}
                      disabled={isDisabled}
                      aria-label={`${formatDate(date, "UTC", "full")}${locked ? ", not open for booking yet" : ""}`}
                      aria-current={isToday ? "date" : undefined}
                      aria-pressed={isSelected}
                      onKeyDown={(e) => onKeyDown(e, date)}
                      onFocus={() => setFocused(date)}
                      onClick={() => {
                        setFocused(date);
                        onValueChange?.(date);
                      }}
                      className={cn(
                        "tnum relative inline-flex items-center justify-center rounded-lg font-medium transition-[background-color,color,transform] duration-150 outline-none",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
                        cell,
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-button"
                          : isDisabled
                            ? "cursor-not-allowed text-subtle-foreground"
                            : "text-foreground hover:bg-accent active:scale-95",
                        isToday && !isSelected && "font-semibold text-brand",
                      )}
                    >
                      {Number(date.slice(8))}
                      {marker && !isSelected && (
                        <span
                          aria-hidden
                          className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand"
                        />
                      )}
                      {locked && (
                        <Lock
                          aria-hidden
                          className={cn(
                            "absolute bottom-0.5 left-1/2 size-2.5 -translate-x-1/2",
                            isSelected ? "text-primary-foreground" : "text-subtle-foreground",
                          )}
                        />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 pointer-coarse:size-11"
    >
      {children}
    </button>
  );
}
