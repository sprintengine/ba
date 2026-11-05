"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { SampleBooking, SceneToggle } from "./scene-parts";
import { ThreadField } from "./thread-field";

/** Sample bookings: all kinds of business, from all the ways a booking comes in. */
const BOOKINGS = [
  {
    who: "Rory Kane",
    when: "15:30–16:15",
    what: "Follow-up treatment",
    color: "#0ea5e9",
    via: "Their AI assistant · Paid €60",
  },
  {
    who: "Priya Nair",
    when: "10:00–11:30",
    what: "Full valet",
    color: "#e0702f",
    via: "Your booking page · Paid €60",
  },
  {
    who: "Ella Walsh",
    when: "17:00–17:30",
    what: "Piano lesson",
    color: "#a99bff",
    via: "A link on Instagram · Paid €25",
  },
  {
    who: "Tom Byrne",
    when: "09:15–09:25",
    what: "Blood test",
    color: "#5b4ae0",
    via: "Your website · Paid €25",
  },
];
const SHOWN = 3;

function Card({ n, depth }: { n: number; depth: number }) {
  const b = BOOKINGS[n % BOOKINGS.length]!;
  return (
    <SampleBooking
      {...b}
      className={cn(
        "inset-x-0 top-0 origin-top transition-[transform,opacity] duration-500 ease-out",
        depth === 0 && "animate-rise",
      )}
      style={{
        zIndex: SHOWN - depth,
        opacity: 1 - depth * 0.2,
        transform: `translateY(${String(depth * 5.9)}rem) scale(${String(1 - depth * 0.05)})`,
      }}
    />
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
        className="inset-0 -z-10 [mask-image:linear-gradient(180deg,transparent_40%,black_62%)] lg:[mask-image:linear-gradient(90deg,transparent_58%,black_72%)] xl:[mask-image:linear-gradient(90deg,transparent_22%,black_52%)]"
      />
      <div className="flex flex-col gap-3">
        <div aria-hidden className="relative h-[16.5rem] w-full" inert>
          <div ref={target} className="absolute inset-x-0 top-0 h-[5.25rem]" />
          {Array.from({ length: SHOWN }, (_, depth) => (
            <Card key={newest - depth} n={newest - depth} depth={depth} />
          ))}
        </div>
        <div className="flex min-h-8 items-center justify-between gap-3 text-sm text-muted-foreground">
          Every booking lands on one calendar.
          {!reduce && <SceneToggle paused={paused} onToggle={() => setPaused((p) => !p)} />}
        </div>
      </div>
    </>
  );
}
