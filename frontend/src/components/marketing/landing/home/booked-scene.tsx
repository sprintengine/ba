"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CARD,
  CARD_RAISED,
  CARD_TEXT,
  linesFor,
  serviceTint,
} from "@/components/dashboard/calendar/event-card";
import { BookingPhone } from "./booking-phone";
import { CALENDAR_HOUR_PX, CALENDAR_HOUR_PX_PHONE, CalendarPane } from "./calendar-pane";
import { CLIENT, FIRST_HOUR, TEAM, type DemoEntry } from "./fixture";
import { IPhone } from "./iphone";
import { drawThread, flight, THREAD_GRADIENT_STOPS, type FlightPath } from "./flight";
import { SceneToggle } from "./scene-parts";
import { useBookingDemo } from "./use-booking-demo";

/** The time on the phone: the same afternoon as the calendar's now line. */
const PHONE_TIME = "15:14";

const minutes = (at: string) => Number(at.slice(0, 2)) * 60 + Number(at.slice(3));
const endOf = (e: DemoEntry) => {
  const end = minutes(e.at) + e.service.durationMinutes;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
};

type Flying = { entry: DemoEntry; box: { left: number; top: number; width: number; height: number } };

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

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
      className={cn(CARD, CARD_RAISED, "z-30 shadow-lg")}
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
 * A client books on a phone and it lands on the business's calendar. The phone and the calendar are the real pieces on
 * sample data, the booking flies from one to the other along a thread, and a visitor can take the phone and try it.
 */
export function BookedScene() {
  const root = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const ticket = useRef<HTMLDivElement>(null);
  const [flying, setFlying] = useState<Flying | null>(null);
  const [path, setPath] = useState<FlightPath | null>(null);
  const [notice, setNotice] = useState<DemoEntry | null>(null);
  const [visible, setVisible] = useState(false);
  const land = useRef<() => void>(() => undefined);
  const width = useWidth(calendar);
  const phone = width > 0 && width < 560;
  const columns = width >= 760 ? 3 : width >= 560 ? 2 : 1;
  const hourPx = phone ? CALENDAR_HOUR_PX_PHONE : CALENDAR_HOUR_PX;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      threshold: 0.35,
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

  return (
    <div>
      <div
        ref={root}
        className="relative grid justify-items-center gap-5 [--iphone-scale:0.66] sm:[--iphone-scale:0.72] lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:justify-items-stretch lg:gap-12 lg:[--iphone-scale:0.82]"
      >
        <div
          role="group"
          aria-label="Live demo of a booking page. Tap through it."
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
        <div
          ref={calendar}
          aria-hidden
          inert
          className="relative flex h-[13rem] w-full min-w-0 overflow-hidden rounded-2xl bg-background shadow-[0_40px_80px_-40px_rgb(0_0_0/0.3)] ring-1 ring-border sm:h-[45rem]"
        >
          <CalendarPane
            date={demo.date}
            entries={demo.entries}
            columns={columns}
            phone={phone}
            narrow={width > 0 && width < 760}
          />
          {notice && (
            <div className="absolute right-3 bottom-10 z-50 flex animate-pop-in items-center gap-2.5 rounded-xl bg-surface-raised px-3 py-2.5 text-sm shadow-lg ring-1 ring-border max-sm:bottom-3">
              <span className="grid size-6 place-items-center rounded-full bg-success-soft text-success-soft-foreground">
                <Check className="size-3.5" />
              </span>
              <span>
                <span className="block font-semibold">
                  New booking, paid €{notice.service.priceCents / 100}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {notice.customer}, {notice.at}
                </span>
              </span>
            </div>
          )}
        </div>
        {path && (
          <svg aria-hidden className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible">
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
      <div className="mt-6 flex items-center justify-between gap-4 lg:mt-5">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Live demo on a sample business.</span>{" "}
          {demo.auto ? "Tap the phone to try it yourself." : `Book as ${CLIENT.name}. A booked time is gone.`}
        </p>
        <SceneToggle paused={demo.paused} onToggle={demo.toggle} />
      </div>
    </div>
  );
}
