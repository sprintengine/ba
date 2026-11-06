"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { BrowserWindow } from "../browser-window";
import { BOOKED_SERVICE, CLIENT, BOOKED_AT, demoDay } from "../fixture";
import s from "../hero-stage.module.css";
import { CalendarNotice } from "../scene-parts";
import { useBookingDemo } from "../use-booking-demo";
import { Cursor, pointer } from "./cursor";
import { sampleClient, sampleNow } from "./fixture-api";
import { StageBar, StagePhone } from "./stage-parts";
import { tourStory, type Chapter, type Entry, type Notice, type TourCast } from "./story";
import { PATHS, preloadLaterScreens, TourApp, type Screen } from "./tour-app";
import { useStageClock } from "./use-stage-clock";

/** The app is laid out at a real desktop width and drawn down to the window; a smaller window gets a smaller desktop. */
const appWidth = (windowWidth: number) => Math.max(1060, Math.min(1240, Math.round(windowWidth * 1.2)));

/** The whole first screen: the app's window with a cursor working through it, and a client booking on the phone. */
export function TourStage({ frameClass }: { frameClass: string }) {
  const still = useReducedMotion();
  const date = useMemo(() => demoDay(), []);
  const now = useMemo(() => sampleNow(date), [date]);
  const demo = useBookingDemo();
  const demoRef = useRef(demo);
  useLayoutEffect(() => {
    demoRef.current = demo;
  });

  const [sample] = useState(() => sampleClient(date, still));
  const [screen, setScreen] = useState<Screen>("calendar");
  const [mounted, setMounted] = useState<ReadonlySet<Screen>>(() => new Set(["calendar"]));
  const [opened, setOpened] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | false>(still ? "booked" : false);
  const [chat, setChat] = useState<number | null>(null);
  const [alerts, setAlerts] = useState(still ? 1 : 0);
  const [chapter, setChapter] = useState<Chapter>("book");
  const [trying, setTrying] = useState(false);
  const entry = useRef<Entry>("book");

  const scene = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const app = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const finger = useRef<HTMLSpanElement>(null);
  const arrow = useRef<HTMLDivElement>(null);
  const scale = useRef(1);

  // Sizes the app to the window by hand: a unit-less scale can't come from CSS lengths in every browser.
  useLayoutEffect(() => {
    const box = viewport.current;
    const inner = app.current;
    const device = scene.current?.querySelector(`.${s.phone}`);
    if (!box || !inner) return;
    const fit = () => {
      const width = appWidth(box.clientWidth);
      const k = box.clientWidth / width;
      scale.current = k;
      inner.style.width = `${width}px`;
      inner.style.height = `${Math.ceil(box.clientHeight / k)}px`;
      inner.style.transform = `scale(${k})`;
      const edge = device?.getBoundingClientRect().left;
      const right = box.getBoundingClientRect().right;
      const covered = edge === undefined ? 0 : Math.max(0, right - edge) / k;
      inner.style.setProperty("--tour-covered", `${covered}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const closeBooking = useCallback(() => setOpened(null), []);

  const clock = useStageClock(scene, still, (director) => {
    const cast: TourCast = {
      director,
      scene: scene.current!,
      phone: phone.current!,
      finger: finger.current!,
      demo: () => demoRef.current,
      setBooked: sample.setBooked,
      setMoved: sample.setMoved,
      chapter: setChapter,
      handOver: setTrying,
      notify: (next) => {
        setNotice(next);
        if (next) setAlerts(1);
      },
      chat: setChat,
      scale: () => scale.current,
      pointer: pointer(arrow.current!, scene.current!, director),
      go: (next) => {
        setScreen(next);
        if (next === "calendar") setAlerts(0);
      },
      prepare: (next) => setMounted((m) => new Set(m).add(next)),
      prepareLater: preloadLaterScreens,
    };
    return tourStory(cast, entry.current);
  });

  /** Starts from a part of the story, with the stage set back to the empty calendar. */
  const jump = (to: Entry) => {
    entry.current = to;
    setOpened(null);
    setNotice(false);
    setChat(null);
    setScreen("calendar");
    setAlerts(0);
    setTrying(false);
    setChapter("book");
    sample.setBooked(false);
    demoRef.current.reset();
    clock.restart();
  };

  // Reduced motion rests on the finished booking: the picture of the whole story.
  useLayoutEffect(() => {
    if (still) demoRef.current.finish();
  }, [still]);

  return (
    <div ref={scene} className="absolute inset-0">
      <BrowserWindow
        address={PATHS[screen]}
        note="Sample business, made-up clients"
        className={cn(s.window, frameClass)}
      >
        <div ref={viewport} className={cn(s.content, "overflow-hidden")}>
          <div ref={app} className="absolute top-0 left-0 origin-top-left">
            <TourApp
              client={sample.client}
              now={now}
              screen={screen}
              mounted={mounted}
              booking={opened}
              alerts={alerts}
              onOpenBooking={setOpened}
              onCloseBooking={closeBooking}
            >
              {notice && (
                <CalendarNotice
                  title={
                    notice === "moved"
                      ? "Moved to Aoife"
                      : `New booking, paid €${String(BOOKED_SERVICE.priceCents / 100)}`
                  }
                  detail={
                    notice === "moved"
                      ? `${CLIENT.name} has been told`
                      : `${CLIENT.name}, ${demo.time ?? BOOKED_AT}`
                  }
                  className="bottom-12"
                  style={{ right: "calc(var(--tour-covered, 0px) + 0.75rem)" }}
                />
              )}
            </TourApp>
          </div>
        </div>
      </BrowserWindow>
      <StagePhone demo={demo} chat={chat} screen={phone} finger={finger} live={trying} />
      {!still && <Cursor ref={arrow} />}
      {!still && (
        <StageBar
          paused={clock.paused}
          onToggle={clock.toggle}
          chapter={chapter}
          onJump={jump}
          trying={trying}
          onTry={() => jump("visitor")}
        />
      )}
    </div>
  );
}
