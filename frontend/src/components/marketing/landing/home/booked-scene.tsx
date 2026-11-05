"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { minutesToTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CARD,
  CARD_RAISED,
  CARD_TEXT,
  linesFor,
  serviceTint,
} from "@/components/dashboard/calendar/event-card";
import { BookingPhone } from "./booking-phone";
import { BrowserWindow } from "./browser-window";
import { CalendarPane, fitCalendar } from "./calendar-pane";
import { CLIENT, FIRST_HOUR, NOW_MINUTES, TEAM, type DemoEntry } from "./fixture";
import { IPhone } from "./iphone";
import { drawThread, flight, THREAD_GRADIENT_STOPS, type FlightPath } from "./flight";
import { BOOKED_BELOW, BOOKED_CALENDAR, BOOKED_GRID, CalendarNotice, SceneToggle } from "./scene-parts";
import { useBookingDemo } from "./use-booking-demo";
import { useSize } from "./use-size";

/** The time on the phone: the same afternoon as the calendar's now line. */
const PHONE_TIME = minutesToTime(NOW_MINUTES);

const minutes = (at: string) => Number(at.slice(0, 2)) * 60 + Number(at.slice(3));
const endOf = (e: DemoEntry) => {
  const end = minutes(e.at) + e.service.durationMinutes;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
};

type Flying = { entry: DemoEntry; box: { left: number; top: number; width: number; height: number } };

/** The booking as the calendar draws it, on its way there. */
function Ticket({ flying, ref }: { flying: Flying; ref: React.Ref<HTMLDivElement> }) {
  const { entry, box } = flying;
  const when = `${entry.at}–${endOf(entry)}`;
  // As the calendar words it: a card with room for three lines names the service, a short one the room.
  const tall = linesFor(box.height) > 2;
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(CARD, CARD_RAISED, "z-[45] shadow-lg")}
      style={{ ...box, ...serviceTint(entry.service.color) }}
    >
      <span className={CARD_TEXT}>
        <span className="block truncate text-[0.8125rem] leading-[1.0625rem] font-semibold text-foreground">
          {entry.customer}
        </span>
        <span className="block truncate text-xs leading-[1.0625rem] text-muted-foreground">
          {when} · {tall ? entry.service.name : entry.room}
        </span>
        {tall && (
          <span className="block truncate text-xs leading-[1.0625rem] font-medium text-foreground">
            {entry.room}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * The business's calendar, large, with a booking arriving on it from a client's phone, small and further down. The phone
 * and the calendar are the real pieces on sample data, the booking flies from one to the other along a thread, and a
 * visitor can take the phone and try it. The section's words sit beside the phone.
 */
export function BookedScene({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const ticket = useRef<HTMLDivElement>(null);
  const [flying, setFlying] = useState<Flying | null>(null);
  const [path, setPath] = useState<FlightPath | null>(null);
  const [notice, setNotice] = useState<DemoEntry | null>(null);
  const [visible, setVisible] = useState(false);
  const land = useRef<() => void>(() => undefined);
  const { width, height } = useSize(calendar);
  const fit = fitCalendar(width, height);
  const { hourPx } = fit;

  useEffect(() => {
    const el = calendar.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      threshold: 0.2,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onPaid = useCallback(
    (entry: DemoEntry, finish: () => void) => {
      const name = TEAM.find((t) => t.id === entry.who)?.name ?? "";
      const scene = root.current;
      const column = scene?.querySelector(`[role="group"][aria-label="${name}"]`);
      if (!scene || !column || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        finish();
        setNotice(entry);
        return;
      }
      land.current = () => {
        finish();
        setFlying(null);
        setPath(null);
        setNotice(entry);
      };
      const s = scene.getBoundingClientRect();
      const c = column.getBoundingClientRect();
      const h = (entry.service.durationMinutes * hourPx) / 60 - 2;
      setFlying({
        entry,
        box: {
          left: c.left - s.left + 2,
          top: c.top - s.top + ((minutes(entry.at) - FIRST_HOUR * 60) * hourPx) / 60 + 1,
          width: c.width - 4,
          height: h,
        },
      });
    },
    [hourPx],
  );

  const demo = useBookingDemo({ screen, visible, onPaid });

  useEffect(() => {
    const el = ticket.current;
    const scene = root.current;
    if (!flying || !el || !scene) return;
    const from = scene.querySelector("[data-flight-from]")?.getBoundingClientRect();
    if (!from) return land.current();
    const run = flight(el, scene, from, flying.box);
    setPath(run.path);
    void run.done.then(() => land.current());
    return run.cancel;
  }, [flying]);

  const thread = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (!path || !thread.current) return;
    const drawing = drawThread(thread.current);
    return () => drawing.cancel();
  }, [path]);

  useEffect(() => {
    if (demo.step !== "done") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotice(null);
    }
  }, [demo.step]);

  const caption = (className: string) => (
    <div className={className}>
      <p className="text-sm leading-normal text-muted-foreground">
        <span className="font-semibold text-foreground">A working demo with a made-up clinic.</span>{" "}
        {demo.auto ? "Tap the client’s phone to try it." : `Book as ${CLIENT.name}. A booked time is gone.`}
      </p>
      <SceneToggle paused={demo.paused} onToggle={demo.toggle} />
    </div>
  );

  return (
    <div ref={root} className={BOOKED_GRID}>
      <BrowserWindow>
        <div ref={calendar} className={cn(BOOKED_CALENDAR, "relative flex min-w-0 overflow-hidden")}>
          <CalendarPane date={demo.date} entries={demo.entries} {...fit} />
          {notice && (
            <CalendarNotice
              title={`New booking, paid €${String(notice.service.priceCents / 100)}`}
              detail={`${notice.customer}, ${notice.at}`}
              className="top-38 max-sm:top-24"
            />
          )}
        </div>
      </BrowserWindow>
      <div className={BOOKED_BELOW}>
        <div>
          {children}
          {caption("mt-6 flex items-center gap-4 max-lg:hidden")}
        </div>
        <div className="flex items-center gap-4">
          <div
            role="group"
            aria-label="Live demo of a booking page. Tap through it."
            className="shrink-0"
            onPointerDownCapture={demo.takeOver}
            onKeyDownCapture={demo.takeOver}
          >
            <IPhone time={PHONE_TIME}>
              <div ref={screen} className="absolute inset-0">
                <BookingPhone demo={demo} entries={demo.entries} />
                {demo.touch && (
                  <span
                    aria-hidden
                    className="absolute z-[28] size-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/20 ring-1 ring-foreground/10 transition-[left,top,scale] duration-500 ease-out"
                    style={{ left: demo.touch.x, top: demo.touch.y, scale: demo.touch.down ? 0.8 : 1 }}
                  />
                )}
              </div>
            </IPhone>
          </div>
          {caption("flex min-w-0 flex-col items-start gap-3 lg:hidden")}
        </div>
      </div>
      {path && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-[44] size-full overflow-visible">
          <defs>
            <linearGradient id="flight-thread" gradientUnits="userSpaceOnUse" {...path.gradient}>
              {THREAD_GRADIENT_STOPS.map(([offset, color]) => (
                <stop key={offset} offset={offset} stopColor={color} />
              ))}
            </linearGradient>
          </defs>
          <path
            ref={thread}
            d={path.d}
            fill="none"
            stroke="url(#flight-thread)"
            strokeWidth="2"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
          />
        </svg>
      )}
      {flying && <Ticket ref={ticket} flying={flying} />}
    </div>
  );
}
