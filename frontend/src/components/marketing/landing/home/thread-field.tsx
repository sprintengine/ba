"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const THREADS = 46;
const SEGMENTS = 40;
/** One request every so often, running down a thread into the booking. */
const CYCLE_MS = 3200;
const CARRIERS = [7, 23, 38];
const INKS = ["#1d9bd1", "#5b4ae0", "#a99bff", "#e0702f"];

type Point = { x: number; y: number };
/** Where the threads meet, and whether they come in sideways (beside the copy) or from above (under it). */
type Gather = Point & { from: "side" | "above" | "both" };

function thread(i: number, g: Gather) {
  const u = i / (THREADS - 1);
  if (g.from === "above") {
    const start = { x: -0.4 + 1.8 * u, y: -0.02 };
    return {
      start,
      c1: { x: start.x, y: g.y * 0.8 },
      c2: { x: g.x, y: g.y - 0.12 },
      offset: u - 0.5,
    };
  }
  const flip = g.from === "both" && i % 2 === 1;
  const start = { x: flip ? 1.06 : -0.06, y: -0.1 + 1.25 * u };
  return {
    start,
    c1: { x: flip ? 0.62 : 0.38, y: start.y },
    c2: { x: g.x + (flip ? 0.2 : -0.24), y: g.y },
    offset: u - 0.5,
  };
}

function point(i: number, g: Gather, s: number, t: number, w: number, h: number): Point {
  const { start, c1, c2, offset } = thread(i, g);
  const r = 1 - s;
  const x = r ** 3 * start.x + 3 * r ** 2 * s * c1.x + 3 * r * s ** 2 * c2.x + s ** 3 * g.x;
  const y = r ** 3 * start.y + 3 * r ** 2 * s * c1.y + 3 * r * s ** 2 * c2.y + s ** 3 * g.y;
  const wave =
    (Math.sin(s * 7 + t * 0.5 + i * 0.17) * 0.02 + Math.sin(s * 13 - t * 0.33 + i * 0.31) * 0.008) * r;
  // Fans out slightly as it leaves the booking, so the meeting point stays a point.
  const fan = offset * 0.03 * r;
  return g.from === "above" ? { x: (x + wave + fan) * w, y: y * h } : { x: x * w, y: (y + wave + fan) * h };
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, now: number, g: Gather, dpr: number) {
  const t = now / 1000;
  ctx.clearRect(0, 0, w, h);
  // The inks run the length of the threads, so all of them show whichever way the threads come in.
  const gradient =
    g.from === "above"
      ? ctx.createLinearGradient(0, h * 0.4, 0, g.y * h)
      : ctx.createLinearGradient(w * 0.3, 0, g.x * w, 0);
  INKS.forEach((c, i) => gradient.addColorStop(i / (INKS.length - 1), c));
  ctx.strokeStyle = gradient;
  ctx.lineWidth = dpr;
  for (let i = 0; i < THREADS; i++) {
    const offset = i / (THREADS - 1) - 0.5;
    ctx.globalAlpha = 0.3 + 0.4 * (1 - Math.abs(offset) * 2) ** 2;
    ctx.beginPath();
    for (let n = 0; n <= SEGMENTS; n++) {
      const p = point(i, g, n / SEGMENTS, t, w, h);
      if (n === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  // The requests: bright beads, arriving together as the next booking lands.
  const progress = (now % CYCLE_MS) / CYCLE_MS;
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 1;
  CARRIERS.forEach((i, k) => {
    const s = Math.min(1, progress * (1.25 + k * 0.08)) ** 2.2;
    if (s >= 1) return;
    const p = point(i, g, s, t, w, h);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5 * dpr, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

/**
 * Threads drawn together into one point: everywhere a booking comes from, arriving as one booking. A plain 2D canvas,
 * sized to its box, running only on screen. `target` is the element they meet at; without one they meet at the bottom
 * middle. They come in from the side, or from above when `target` is under the copy. `onArrive` fires each time the requests reach it. Paused or with reduced motion it is a single still frame.
 * Decorative: the page reads the same without it.
 */
export function ThreadField({
  target,
  sides = false,
  paused = false,
  onArrive,
  className,
}: {
  target?: React.RefObject<HTMLElement | null>;
  /** Threads come in from both sides of `target`. */
  sides?: boolean;
  paused?: boolean;
  onArrive?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const arrive = useRef(onArrive);
  useEffect(() => {
    arrive.current = onArrive;
  }, [onArrive]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let frame = 0;
    let onScreen = false;
    let cycle = -1;
    let gather: Gather = { x: 0.5, y: 0.98, from: "above" };
    const place = () => {
      const box = canvas.getBoundingClientRect();
      const el = target?.current?.getBoundingClientRect();
      if (!el || box.width === 0 || box.height === 0) return;
      const y = (el.top + el.height / 2 - box.top) / box.height;
      if (sides) gather = { x: (el.left + el.width / 2 - box.left) / box.width, y, from: "both" };
      else if (el.left - box.left > box.width * 0.4)
        gather = { x: (el.left - box.left) / box.width, y, from: "side" };
      else
        gather = {
          x: (el.left + el.width / 2 - box.left) / box.width,
          y: (el.top - box.top) / box.height,
          from: "above",
        };
    };
    const paint = (now: number) => draw(ctx, w, h, now, gather, dpr);
    const loop = (now: number) => {
      paint(now);
      const c = Math.floor(now / CYCLE_MS);
      if (c !== cycle) {
        if (cycle >= 0) arrive.current?.();
        cycle = c;
      }
      frame = requestAnimationFrame(loop);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (reduce || paused || !onScreen || document.hidden) paint(CYCLE_MS * 0.97);
      else frame = requestAnimationFrame(loop);
    };
    const size = new ResizeObserver(() => {
      dpr = Math.min(window.devicePixelRatio, 2);
      w = canvas.width = Math.round(canvas.clientWidth * dpr);
      h = canvas.height = Math.round(canvas.clientHeight * dpr);
      place();
      sync();
    });
    const seen = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      sync();
    });
    size.observe(canvas);
    seen.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(frame);
      size.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [reduce, paused, target, sides]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute size-full", className)} />;
}
