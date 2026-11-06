"use client";

import dynamic from "next/dynamic";
import { minutesToTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BookingPhone } from "../booking-phone";
import { NOW_MINUTES } from "../fixture";
import s from "../hero-stage.module.css";
import { IPhone } from "../iphone";
import { SceneToggle } from "../scene-parts";
import type { BookingDemo } from "../use-booking-demo";

/** The assistant's chat comes with the AI section's chunk. */
const TourChat = dynamic(() => import("../scenes").then((m) => m.TourChat), { ssr: false });

/** Fetches it ahead of the moment the phone turns to it. */
export const preloadChat = () => void import("../scenes");

/** The time on the phone: the same afternoon as the calendar's now line. */
export const PHONE_TIME = minutesToTime(NOW_MINUTES);

/** The phone, up in the stage: the client's booking page, then the owner's assistant when `chat` is a step. */
export function StagePhone({
  demo,
  chat,
  screen,
  finger,
}: {
  demo: BookingDemo;
  chat: number | null;
  screen: React.Ref<HTMLDivElement>;
  finger: React.Ref<HTMLSpanElement>;
}) {
  return (
    <div aria-hidden inert className={s.phone}>
      <IPhone time={PHONE_TIME}>
        <div ref={screen} className="absolute inset-0 animate-fade-in">
          <BookingPhone demo={demo} />
          {chat !== null && <TourChat step={chat} />}
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
