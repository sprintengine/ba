"use client";

import { useCallback } from "react";
import { calendarStep, parseCalendarParams } from "@/lib/dashboard/calendar";
import { addDaysToPlainDate, type PlainDate } from "@/lib/format/datetime";
import { useUrlParams } from "@/lib/hooks/use-url-params";

/**
 * The calendar's view state in the URL: `?date=` (absent = today), `?view=week`, `?resource=`, `?cancelled=1`.
 * `go(±1)` moves a day or a week.
 */
export function useCalendarUrl(today: PlainDate) {
  const { params, setParams } = useUrlParams();
  const state = parseCalendarParams(params, today);
  const { date, view } = state;
  const go = useCallback(
    (delta: number) => setParams({ date: addDaysToPlainDate(date, delta * calendarStep(view)) }),
    [date, view, setParams],
  );
  return { ...state, setParams, go };
}
