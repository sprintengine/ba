"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CARD, CARD_RAISED, CARD_TEXT, serviceTint } from "@/components/dashboard/calendar/event-card";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { SceneToggle } from "./scene-parts";
import { ThreadField } from "./thread-field";

/** Sample bookings: all kinds of business, from all the ways a booking comes in. */
const BOOKINGS = [
  {
    who: "Rory Kane",
    when: "15:30–16:15",
    what: "Sports massage",
    color: "#0ea5e9",
    via: "Their AI assistant",
  },
  { who: "Priya Nair", when: "10:00–11:00", what: "Full valet", color: "#e0702f", via: "Your booking page" },
  {
    who: "Ella Walsh",
    when: "17:00–17:30",
    what: "Piano lesson",
    color: "#a99bff",
    via: "A link on Instagram",
  },
  { who: "Tom Byrne", when: "09:15–09:30", what: "Blood test", color: "#5b4ae0", via: "Your website" },
];
const SHOWN = 3;

function Card({ n, depth }: { n: number; depth: number }) {
  const b = BOOKINGS[n % BOOKINGS.length]!;
  return (
    <div
      className={cn(
        CARD,
        CARD_RAISED,
        "inset-x-0 top-0 h-[5.25rem] origin-top text-base transition-[transform,opacity] duration-500 ease-out",
        depth === 0 && "animate-rise",
      )}
      style={{
        ...serviceTint(b.color),
        zIndex: SHOWN - depth,
        opacity: 1 - depth * 0.3,
        transform: `translateY(${String(depth * 5.9)}rem) scale(${String(1 - depth * 0.05)})`,
      }}
    >
      <span className={cn(CARD_TEXT, "px-3.5 py-2.5")}>
        <span className="block truncate text-[0.9375rem] leading-5 font-semibold text-foreground">
          {b.who}
        </span>
        <span className="block truncate text-[0.8125rem] leading-5 text-muted-foreground">
          {b.when} · {b.what}
        </span>
        <span className="block truncate text-[0.8125rem] leading-5 font-medium text-foreground">{b.via}</span>
      </span>
    </div>
  );
}

/**
 * The hero's picture: threads gather into a booking, one after another, from different kinds of business. The cards
 * are the calendar's own, and the same pause stops the threads and the cards.
 */
export function HeroBookings() {
  const target = useRef<HTMLDivElement>(null);
  const [newest, setNewest] = useState(BOOKINGS.length);
  const [paused, setPaused] = useState(false);
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;
  const onArrive = useCallback(() => setNewest((n) => n + 1), []);

  return (
    <>
      <ThreadField
        target={target}
        paused={paused}
        onArrive={onArrive}
        className="inset-0 -z-10 [mask-image:linear-gradient(180deg,transparent_40%,black_62%)] lg:[mask-image:linear-gradient(90deg,transparent_22%,black_52%)]"
      />
      <div className="flex flex-col items-end gap-3">
        <div aria-hidden className="relative h-[16.5rem] w-full" inert>
          <div ref={target} className="absolute inset-x-0 top-0 h-[5.25rem]" />
          {Array.from({ length: SHOWN }, (_, depth) => (
            <Card key={newest - depth} n={newest - depth} depth={depth} />
          ))}
        </div>
        {!reduce && <SceneToggle paused={paused} onToggle={() => setPaused((p) => !p)} />}
      </div>
    </>
  );
}
