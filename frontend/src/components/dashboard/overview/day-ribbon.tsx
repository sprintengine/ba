"use client";

import type { Booking } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { groupSessions } from "@/lib/dashboard/calendar-layout";
import { minutesToTime, timeToMinutes, toTimeOfDay } from "@/lib/format/datetime";

/**
 * The shape of the day in one line, to scale: a block for each booking, what's over paler, and a mark at now. It sits
 * above the list, which says the same in words, so it's hidden from screen readers.
 */
export function DayRibbon({ bookings, now }: { bookings: Booking[]; now: Date }) {
  const { timezone } = useCurrentBusiness();
  const sessions = groupSessions(bookings);
  if (sessions.length === 0) return null;
  const minute = (at: Date | string) => timeToMinutes(toTimeOfDay(at, timezone));
  const starts = sessions.map((s) => minute(s.bookings[0].start));
  const ends = sessions.map((s) => minute(s.bookings[0].end));
  const first = Math.floor(Math.min(...starts) / 60) * 60;
  const last = Math.ceil(Math.max(...ends) / 60) * 60;
  const span = Math.max(last - first, 60);
  const at = (m: number) => ((m - first) / span) * 100;
  const nowMinute = minute(now);
  return (
    <div aria-hidden className="flex flex-col gap-1 px-2 pb-2">
      <div className="relative h-5 overflow-hidden rounded-md bg-muted">
        {sessions.map((s, i) => {
          const start = starts[i] ?? first;
          const end = ends[i] ?? start;
          const over = new Date(s.bookings[0].end) <= now;
          return (
            <span
              key={s.id}
              className="absolute inset-y-0.5 min-w-1 rounded-[3px]"
              style={{
                left: `${at(start)}%`,
                width: `${at(end) - at(start)}%`,
                backgroundColor: `color-mix(in oklab, ${s.bookings[0].service.color} ${over ? 28 : 62}%, var(--surface))`,
              }}
            />
          );
        })}
        {nowMinute >= first && nowMinute <= last && (
          <span className="absolute inset-y-0 w-0.5 bg-danger" style={{ left: `${at(nowMinute)}%` }} />
        )}
      </div>
      <div className="tnum flex justify-between text-2xs text-subtle-foreground">
        <span>{minutesToTime(first)}</span>
        <span>{minutesToTime(last)}</span>
      </div>
    </div>
  );
}
