"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "@/lib/auth/context";
import type { CalendarZoom } from "./grid-scale";

const ZOOMS: readonly string[] = ["comfortable", "compact", "fit"] satisfies CalendarZoom[];

const zoomKey = (person: string | undefined) => `bookanything.calendarZoom.${person ?? "anyone"}`;

/** The calendar's scale, remembered for each person signed in on this device. */
export function useCalendarZoom() {
  const person = useContext(AuthContext)?.user?.id;
  const [zoom, setZoom] = useState<CalendarZoom>("comfortable");
  useEffect(() => {
    const saved = window.localStorage.getItem(zoomKey(person));
    // Restore the choice after hydration: the server has no idea who is at this window.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && ZOOMS.includes(saved)) setZoom(saved as CalendarZoom);
  }, [person]);
  const choose = useCallback(
    (next: CalendarZoom) => {
      setZoom(next);
      window.localStorage.setItem(zoomKey(person), next);
    },
    [person],
  );
  return [zoom, choose] as const;
}
