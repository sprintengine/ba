"use client";

import { minutesToTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BookingPhone } from "../booking-phone";
import { NOW_MINUTES } from "../fixture";
import s from "../hero-stage.module.css";
import { IPhone } from "../iphone";
import { SceneToggle } from "../scene-parts";
import type { BookingDemo } from "../use-booking-demo";

/** The time on the phone: the same afternoon as the calendar's now line. */
export const PHONE_TIME = minutesToTime(NOW_MINUTES);

/** The phone, up in the stage, with the client's booking page on it. */
export function StagePhone({
  demo,
  screen,
  finger,
}: {
  demo: BookingDemo;
  screen: React.Ref<HTMLDivElement>;
  finger: React.Ref<HTMLSpanElement>;
}) {
  return (
    <div aria-hidden inert className={s.phone}>
      <IPhone time={PHONE_TIME}>
        <div ref={screen} className="absolute inset-0 animate-fade-in">
          <BookingPhone demo={demo} />
          <span
            ref={finger}
            className="pointer-events-none absolute z-[28] -mt-6 -ml-6 size-12 rounded-full bg-foreground/20 opacity-0 ring-1 ring-foreground/10"
          />
        </div>
      </IPhone>
    </div>
  );
}

/** The pause button, in the corner of the panel. */
export function StagePause({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <div className={cn(s.pause, "rounded-full bg-white/70 backdrop-blur-md")}>
      <SceneToggle name="product tour" paused={paused} onToggle={onToggle} />
    </div>
  );
}
