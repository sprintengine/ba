"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "@/components/ui/use-media-query";
import { cn } from "@/lib/utils";
import { BrowserWindow } from "./browser-window";
import s from "./hero-stage.module.css";
import { IPhone } from "./iphone";

type Stage = React.ComponentType<{ frameClass: string }>;

/** The photograph behind asks more of the window's shadow than the plain page does. */
const FRAME =
  "shadow-[0_0_0_0.5px_rgb(20_16_60/0.4),0_2px_6px_rgb(20_16_60/0.16),0_24px_48px_-14px_rgb(20_16_60/0.46),0_70px_120px_-30px_rgb(20_16_60/0.58)]";

const loadTour = () => import("./tour/tour-stage").then((m): Stage => m.TourStage);
const loadMini = () => import("./scenes").then((m): Stage => m.MiniStage);

/** Runs once the page has painted and gone quiet, so the headline never waits for the animation. */
function afterFirstPaint(run: () => void) {
  const idle = window as Partial<Pick<Window, "requestIdleCallback" | "cancelIdleCallback">>;
  let handle: number | undefined;
  const frame = requestAnimationFrame(() => {
    handle = idle.requestIdleCallback
      ? idle.requestIdleCallback(run, { timeout: 1500 })
      : window.setTimeout(run, 200);
  });
  return () => {
    cancelAnimationFrame(frame);
    if (handle === undefined) return;
    if (idle.cancelIdleCallback) idle.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  };
}

/** What's there on first paint: the same frames, empty, in the place the real thing takes. */
function Poster() {
  return (
    <>
      <BrowserWindow className={cn(s.window, FRAME)}>
        <div className="flex min-h-0 flex-1">
          <div className={s.posterRail} />
        </div>
      </BrowserWindow>
      <div aria-hidden className={s.phone}>
        <IPhone time="15:08" />
      </div>
    </>
  );
}

/**
 * The stage. The tour needs a mouse and a desktop's width, and brings the app's real screens, so a narrower screen
 * gets the booking alone, in a much smaller chunk.
 */
export function HeroStage() {
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const [loaded, setLoaded] = useState<{ wide: boolean; Stage: Stage } | null>(null);

  useEffect(() => {
    let live = true;
    const cancel = afterFirstPaint(() => {
      void (wide ? loadTour() : loadMini()).then((Stage) => {
        if (live) setLoaded({ wide, Stage });
      });
    });
    return () => {
      live = false;
      cancel();
    };
  }, [wide]);

  const Stage = loaded?.wide === wide ? loaded.Stage : null;
  return (
    <div
      role="group"
      aria-label="A sample of the app: a client books on a phone, and the booking lands on the calendar"
      className={s.panel}
    >
      {Stage ? <Stage frameClass={FRAME} /> : <Poster />}
    </div>
  );
}
