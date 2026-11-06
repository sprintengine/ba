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
import type { Chapter, Entry } from "./story";

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
  live = false,
}: {
  demo: BookingDemo;
  chat: number | null;
  screen: React.Ref<HTMLDivElement>;
  finger: React.Ref<HTMLSpanElement>;
  /** The visitor's turn: the phone answers to their hand. */
  live?: boolean;
}) {
  return (
    <div aria-hidden={!live} inert={!live} className={s.phone}>
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

const CHAPTERS: { key: Chapter; label: string; entry: Entry }[] = [
  { key: "book", label: "A client books", entry: "book" },
  { key: "lands", label: "It lands", entry: "book" },
  { key: "day", label: "Your day", entry: "day" },
  { key: "ai", label: "Your AI", entry: "ai" },
];

/**
 * Under the stage: pause, what's happening now and what comes next, and (with a mouse and a big enough phone) the
 * visitor's turn. It sits in the panel's margin, so nothing moves when it arrives; the loop runs without anyone
 * touching it.
 */
export function StageBar({
  paused,
  onToggle,
  chapter,
  chapters = CHAPTERS,
  onJump,
  trying,
  onTry,
}: {
  paused: boolean;
  onToggle: () => void;
  chapter: Chapter;
  chapters?: typeof CHAPTERS;
  onJump?: (entry: Entry) => void;
  trying?: boolean;
  onTry?: () => void;
}) {
  return (
    <div className={cn(s.pause, "flex items-center gap-2")}>
      <div className="rounded-full bg-white/70 backdrop-blur-md">
        <SceneToggle name="product tour" paused={paused} onToggle={onToggle} />
      </div>
      <ol
        aria-label="The tour"
        className="flex h-8 items-center rounded-full bg-white/70 p-0.5 backdrop-blur-md"
      >
        {chapters.map((c) => {
          const label = (
            <span
              className={cn(
                "flex h-7 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap text-foreground/75 transition-colors max-sm:px-2",
                c.key === chapter && "bg-white text-foreground shadow-xs",
              )}
            >
              {c.label}
            </span>
          );
          return (
            <li key={c.key} aria-current={c.key === chapter ? "step" : undefined}>
              {onJump ? (
                <button
                  type="button"
                  className="focus-ring block rounded-full"
                  onClick={() => onJump(c.entry)}
                >
                  {label}
                </button>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ol>
      {onTry && (
        <button
          type="button"
          disabled={trying}
          onClick={onTry}
          className="focus-ring h-8 rounded-full bg-white/70 px-3 text-xs font-semibold whitespace-nowrap text-foreground backdrop-blur-md transition-colors hover:bg-white disabled:opacity-100"
        >
          {trying ? "Your turn: pick a time on the phone" : "Try it: pick a time"}
        </button>
      )}
    </div>
  );
}
