"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import type { Example } from "./fixtures";
import { applyStep, endOfTour, START, tourFor, type TourView } from "./tour";

/** The cursor's trip to its next target, and the press that follows. */
const MOVE_MS = 800;
const PRESS_MS = 160;

/** Brings a target into its own sideways strip on a phone. It never moves the page: someone may be reading elsewhere. */
function revealInStrip(target: HTMLElement, box: HTMLElement) {
  for (let el = target.parentElement; el && el !== box; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth) {
      el.scrollLeft += target.getBoundingClientRect().left - el.getBoundingClientRect().left;
      el.scrollLeft -= (el.clientWidth - target.offsetWidth) / 2;
      return;
    }
  }
}

/** The walk through one business: moves the cursor to each step's target, presses, and applies what the step changes. */
export function useTour(example: Example, root: React.RefObject<HTMLElement | null>) {
  const steps = useMemo(() => tourFor(example), [example]);
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;
  const intro = "A day at this business. The bookings are made up.";
  const [view, setView] = useState<TourView>({ ...START, say: intro });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number; down: boolean } | null>(null);

  // It plays only while it's on screen, like the page's other scenes.
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(!!entry?.isIntersecting), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    if (reduce || paused || !onScreen) return;
    const step = steps[index];
    const box = root.current;
    const target = box?.querySelector<HTMLElement>(`[data-cursor="${step?.target ?? ""}"]`);
    if (!step || !box || !target) return;
    revealInStrip(target, box);
    const b = box.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const x = t.left - b.left + Math.min(t.width / 2, 72);
    const y = t.top - b.top + t.height / 2;
    const timers = [
      window.setTimeout(() => setCursor({ x, y, down: false }), 60),
      window.setTimeout(() => {
        setCursor({ x, y, down: true });
        setView((v) => applyStep(v, step));
      }, MOVE_MS),
      window.setTimeout(() => setCursor({ x, y, down: false }), MOVE_MS + PRESS_MS),
      window.setTimeout(() => {
        if (index === steps.length - 1) setView({ ...START, say: intro });
        setIndex((index + 1) % steps.length);
      }, MOVE_MS + step.hold),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [index, onScreen, paused, reduce, root, steps]);

  const shown = reduce && !touched ? endOfTour(steps, intro) : view;
  return {
    view: shown,
    paused,
    reduce,
    cursor: reduce || paused ? null : cursor,
    toggle: () => setPaused((p) => !p),
    /** A hand on the list takes over from the cursor. */
    choose: (change: Partial<TourView>) => {
      setPaused(true);
      setTouched(true);
      setView({ ...START, say: shown.say, ...change });
    },
  };
}

/** The pointer: an arrow with a mouse, a fingertip on a phone. */
export function Cursor({ x, y, down }: { x: number; y: number; down: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-[60] transition-transform duration-700 ease-in-out"
      style={{ transform: `translate(${String(x)}px, ${String(y)}px)` }}
    >
      <span
        className={cn(
          "absolute -top-5 -left-5 size-10 rounded-full bg-foreground/15 transition-[scale,opacity] duration-150",
          down ? "scale-75 opacity-100" : "scale-50 opacity-0",
        )}
      />
      <svg
        width="22"
        height="24"
        viewBox="0 0 22 24"
        className="relative drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)] transition-transform duration-150 max-sm:hidden"
        style={{ scale: down ? 0.9 : 1 }}
      >
        <path
          d="M2 1.500v18.200l5-4.400 3.300 7.200 3.600-1.600-3.300-7.100 6.700-.3Z"
          fill="#111"
          stroke="#fff"
          strokeWidth="1.500"
          strokeLinejoin="round"
        />
      </svg>
      <span className="absolute -top-5 -left-5 size-10 rounded-full bg-foreground/25 ring-1 ring-foreground/10 sm:hidden" />
    </span>
  );
}
