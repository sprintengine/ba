"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const THREADS = 52;
const SEGMENTS = 44;
/** The prism spectrum: bright light on black, deeper inks on a pale page. */
const DARK = ["#8fd8f2", "#7a6af0", "#bfaeff", "#ffbf9c"];
const LIGHT = ["#1d9bd1", "#5b4ae0", "#a99bff", "#e0702f"];

/** Fraction of the way along a thread to height: a long sweep up to the right. */
const sweep = (x: number) => 0.84 - 0.62 * x + 0.1 * Math.sin(x * 3.2 + 0.4);
/** How far threads spread at x: wide at the edges, drawn into one strand a little right of centre. */
const spread = (x: number) => 0.035 + 0.5 * (x - 0.62) ** 2;

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, dark: boolean) {
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
  const stops = dark ? DARK : LIGHT;
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  stops.forEach((c, i) => gradient.addColorStop(i / (stops.length - 1), c));
  ctx.strokeStyle = gradient;
  ctx.lineWidth = Math.max(1, w / 1400);
  for (let i = 0; i < THREADS; i++) {
    const offset = i / (THREADS - 1) - 0.5;
    ctx.globalAlpha = (dark ? 0.2 : 0.26) + 0.3 * (1 - Math.abs(offset) * 2) ** 2;
    ctx.beginPath();
    for (let s = 0; s <= SEGMENTS; s++) {
      const x = -0.05 + (1.1 * s) / SEGMENTS;
      const wave =
        Math.sin(x * 5 + t * 0.5 + i * 0.13) * 0.018 + Math.sin(x * 9 - t * 0.33 + i * 0.29) * 0.008;
      const y = sweep(x) + offset * spread(x) * 2 + wave * (0.4 + spread(x) * 5);
      if (s === 0) ctx.moveTo(x * w, y * h);
      else ctx.lineTo(x * w, y * h);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Threads of light drawn together into one strand: many requests, one calendar. A plain 2D canvas, sized to its box,
 * running only on screen. Reduced motion draws a single still frame. Decorative: the page reads the same without it.
 */
export function ThreadField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    let frame = 0;
    let onScreen = false;
    const isDark = () => document.documentElement.classList.contains("dark");
    const paint = (now: number) => draw(ctx, w, h, now / 1000, isDark());
    const loop = (now: number) => {
      paint(now);
      frame = requestAnimationFrame(loop);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (reduce || !onScreen || document.hidden) paint(4000);
      else frame = requestAnimationFrame(loop);
    };
    const size = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      w = canvas.width = Math.round(canvas.clientWidth * dpr);
      h = canvas.height = Math.round(canvas.clientHeight * dpr);
      sync();
    });
    const seen = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      sync();
    });
    const theme = new MutationObserver(sync);
    size.observe(canvas);
    seen.observe(canvas);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(frame);
      size.disconnect();
      seen.disconnect();
      theme.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [reduce]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute size-full", className)} />;
}
