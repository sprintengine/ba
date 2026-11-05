"use client";

import { useEffect, useRef } from "react";
import { SYMBOL, WEIGHT } from "@/components/brand/logo";
import { createParticles } from "./particles-gl";

const COUNT = { wide: 18000, phone: 6000 };
const PHONE_WIDTH = 640;
/** How far the cursor's reach goes, as a share of the line's width. */
const REACH = 0.3;

/**
 * The logo's infinity as a flow of particles, on a canvas larger than `slot` so they have room to scatter, with the line
 * itself fitted to `slot`. It only runs while on screen and in a visible tab. Scrolling is never held up: the cursor and
 * fingers are only listened to, passively. Calls `onDrawing` once it's up, or `onFailed` where it can't be.
 */
export function ParticleInfinity({
  slot,
  onDrawing,
  onFailed,
}: {
  slot: React.RefObject<HTMLElement | null>;
  onDrawing: () => void;
  onFailed: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const target = slot.current;
    if (!canvas || !target) return;
    const particles = createParticles(canvas, {
      line: SYMBOL.line,
      width: SYMBOL.width,
      spread: (WEIGHT.text / 2) * 0.95,
      count: canvas.clientWidth >= PHONE_WIDTH ? COUNT.wide : COUNT.phone,
      reach: Math.max(90, target.clientWidth * REACH),
    });
    if (!particles) {
      onFailed();
      return;
    }

    const place = () => {
      const box = canvas.getBoundingClientRect();
      const spot = target.getBoundingClientRect();
      const scale = spot.width / SYMBOL.width;
      particles.place(
        { width: box.width, height: box.height, dpr: Math.min(window.devicePixelRatio, 2) },
        { x: spot.left - box.left, y: spot.top - box.top + (spot.height - SYMBOL.height * scale) / 2, scale },
      );
    };
    place();
    const sized = new ResizeObserver(place);
    sized.observe(canvas);
    sized.observe(target);

    let raf = 0;
    let onScreen = false;
    let told = false;
    const tick = (now: number) => {
      particles.frame(now);
      if (!told) {
        told = true;
        onDrawing();
      }
      raf = requestAnimationFrame(tick);
    };
    const sync = () => {
      const run = onScreen && !document.hidden;
      if (run && !raf) {
        raf = requestAnimationFrame(tick);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        particles.rest();
      }
    };
    const seen = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      sync();
    });
    seen.observe(canvas);
    document.addEventListener("visibilitychange", sync);

    const at = (x: number, y: number) => {
      const box = canvas.getBoundingClientRect();
      const inside = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      particles.point(inside ? { x: x - box.left, y: y - box.top } : null);
    };
    const pointer = (e: PointerEvent) => at(e.clientX, e.clientY);
    const finger = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) at(t.clientX, t.clientY);
    };
    const gone = () => particles.point(null);
    const quiet = { passive: true };
    window.addEventListener("pointermove", pointer, quiet);
    window.addEventListener("pointerdown", pointer, quiet);
    window.addEventListener("touchmove", finger, quiet);
    window.addEventListener("touchend", gone, quiet);
    window.addEventListener("touchcancel", gone, quiet);
    document.documentElement.addEventListener("mouseleave", gone);

    const lost = () => onFailed();
    canvas.addEventListener("webglcontextlost", lost);

    return () => {
      cancelAnimationFrame(raf);
      sized.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("pointerdown", pointer);
      window.removeEventListener("touchmove", finger);
      window.removeEventListener("touchend", gone);
      window.removeEventListener("touchcancel", gone);
      document.documentElement.removeEventListener("mouseleave", gone);
      canvas.removeEventListener("webglcontextlost", lost);
    };
  }, [slot, onDrawing, onFailed]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[calc(100%+7rem)] w-screen -translate-x-1/2 -translate-y-1/2"
    />
  );
}
