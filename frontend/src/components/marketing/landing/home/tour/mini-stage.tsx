"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { BrowserWindow } from "../browser-window";
import { CalendarPane, fitCalendar } from "../calendar-pane";
import { BOOKED_AT, BOOKED_SERVICE, CLIENT } from "../fixture";
import s from "../hero-stage.module.css";
import { CalendarNotice } from "../scene-parts";
import { useBookingDemo } from "../use-booking-demo";
import { useSize } from "../use-size";
import { BOOKED_ENTRY, MOVED_ENTRY } from "./fixture-api";
import { StagePause, StagePhone } from "./stage-parts";
import { assistantAct, bookingAct, resetAct, type Cast, type Notice } from "./story";
import { useStageClock } from "./use-stage-clock";

/** How long the finished booking stays before the assistant's turn. */
const REST_MS = 3500;

/**
 * The stage without a mouse, for tablets and phones: the calendar and the phone, the booking going from one to the
 * other, then the owner's assistant moving it. The same pieces and the same script as the tour's first and last acts.
 */
export function MiniStage({ frameClass }: { frameClass: string }) {
  const still = useReducedMotion();
  const demo = useBookingDemo();
  const demoRef = useRef(demo);
  useLayoutEffect(() => {
    demoRef.current = demo;
  });
  const [notice, setNotice] = useState<Notice | false>(still ? "booked" : false);
  const [chat, setChat] = useState<number | null>(null);
  const [lead, setLead] = useState("sam");
  const scene = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const finger = useRef<HTMLSpanElement>(null);
  const { width, height } = useSize(viewport);
  const fit = fitCalendar(width, height);

  const clock = useStageClock(scene, still, async (director) => {
    const cast: Cast = {
      director,
      scene: scene.current!,
      phone: phone.current!,
      finger: finger.current!,
      demo: () => demoRef.current,
      setBooked: (on) => {
        demoRef.current.setBooked(on ? [BOOKED_ENTRY] : []);
        setLead("sam");
      },
      setMoved: () => {
        demoRef.current.setBooked([MOVED_ENTRY]);
        setLead("aoife");
      },
      notify: setNotice,
      chat: setChat,
      scale: () => 1,
    };
    for (;;) {
      await bookingAct(cast);
      await director.sleep(REST_MS);
      await assistantAct(cast);
      resetAct(cast);
    }
  });

  useLayoutEffect(() => {
    if (!still) return;
    demoRef.current.finish();
    demoRef.current.setBooked([BOOKED_ENTRY]);
  }, [still]);

  return (
    <div ref={scene} className="absolute inset-0">
      <BrowserWindow className={cn(s.window, frameClass)}>
        <div ref={viewport} className={cn(s.content, "overflow-hidden pr-(--overlap)")}>
          <CalendarPane date={demo.today} entries={demo.entries} lead={lead} {...fit} />
          {notice && (
            <CalendarNotice
              title={
                notice === "moved"
                  ? "Moved to Aoife"
                  : `New booking, paid €${String(BOOKED_SERVICE.priceCents / 100)}`
              }
              detail={notice === "moved" ? `${CLIENT.name} has been told` : `${CLIENT.name}, ${BOOKED_AT}`}
              className="top-1.5 right-[calc(var(--overlap)+0.375rem)] whitespace-nowrap max-sm:left-1.5 max-sm:gap-2 max-sm:rounded-lg max-sm:px-2 max-sm:py-1.5 max-sm:text-xs sm:top-24"
            />
          )}
        </div>
      </BrowserWindow>
      <StagePhone demo={demo} chat={chat} screen={phone} finger={finger} />
      {!still && <StagePause paused={clock.paused} onToggle={clock.toggle} />}
    </div>
  );
}
