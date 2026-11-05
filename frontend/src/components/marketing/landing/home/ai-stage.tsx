"use client";

import { useMemo, useRef } from "react";
import { addDaysToPlainDate, isoWeekday, type PlainDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AiSide } from "./ai-scene";
import { ClientChat, OwnerChat } from "./ai-chat";
import { CalendarPane, fitCalendar } from "./calendar-pane";
import { BOOKED_SERVICE, CLIENT, dayEntries, demoDay, FRIDAY, movedFriday } from "./fixture";
import { BrowserWindow } from "./browser-window";
import { CalendarNotice, SCENE_CALENDAR, SCENE_GRID, SCENE_WINDOW } from "./scene-parts";
import { useScene } from "./use-scene";
import { useSize } from "./use-size";

/** A chat's steps: asked, then a proposal, then it's being approved, then done. */
const STEPS = [1300, 3400, 800, 5600] as const;
const LAST = STEPS.length - 1;

/** The next such weekday from the demo's day, so the chat and the calendar agree. */
function nextWeekday(weekday: number): PlainDate {
  const day = demoDay();
  return addDaysToPlainDate(day, (weekday - isoWeekday(day) + 7) % 7);
}

/**
 * One side of the AI story: the assistant on a phone, and the same bookings on the real calendar beside it, so what's
 * agreed in the chat is seen to happen. Comes as its own chunk with the booking scene's calendar.
 */
export function AiStage({ side, paused }: { side: AiSide; paused: boolean }) {
  const phoneRef = useRef<HTMLDivElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const step = useScene(phoneRef, STEPS, paused);
  const { width, height } = useSize(calendar);
  const fit = fitCalendar(width, height);
  const owner = side === "owner";
  const done = step === LAST;
  const date = useMemo(() => nextWeekday(owner ? 5 : 4), [owner]);
  const entries = useMemo(() => {
    if (owner) return done ? movedFriday() : FRIDAY;
    const booked = {
      who: "sam",
      at: "15:30",
      customer: CLIENT.name,
      service: BOOKED_SERVICE,
      room: "Room 1",
    };
    return dayEntries(done ? [booked] : []);
  }, [owner, done]);
  const Chat = owner ? OwnerChat : ClientChat;
  return (
    <div className={cn(SCENE_GRID, !owner && "lg:grid-cols-[minmax(0,1fr)_auto]")}>
      <div ref={phoneRef} aria-hidden inert className={cn(!owner && "lg:order-2")}>
        <Chat step={step} />
      </div>
      <BrowserWindow className={SCENE_WINDOW}>
        <div ref={calendar} className={cn(SCENE_CALENDAR, "relative flex min-w-0 overflow-hidden")}>
          <CalendarPane
            date={date}
            entries={entries}
            nowMinute={null}
            lead={owner && done && fit.columns < 2 ? "aoife" : undefined}
            {...fit}
          />
          {done &&
            (owner ? (
              <CalendarNotice title="Three bookings moved" detail="Each client has been told" />
            ) : (
              <CalendarNotice title="New booking, paid €60" detail="Rory Kane, through their AI" />
            ))}
        </div>
      </BrowserWindow>
    </div>
  );
}
