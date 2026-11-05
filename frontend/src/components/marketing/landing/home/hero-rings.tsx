"use client";

import { useEffect, useRef, useState } from "react";
import { LogoMark, WORD } from "@/components/brand/logo";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { createRings } from "./rings-gl";

/** The moment shown with reduced motion: a settled twist. */
const STILL_TIME = 40;
/** How far down the page the rings take to reach the logo. */
const TRAVEL_PX = 480;
/** The layout from here up has the room for the rings to fly to the nav. */
const WIDE = "(min-width: 1024px)";
/** Above the page, below the phone, until the rings are clear of the phone; then above the nav. */
const Z_UNDER_PHONE = 5;
const Z_OVER_NAV = 60;

const ease = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/** Where the logo's rings sit on the screen: their centre, and the size of the word they're drawn in. */
function logoRings() {
  const logo = document.querySelector('header a[aria-label="bookanything home"] svg');
  if (!logo) return null;
  const box = logo.getBoundingClientRect();
  return {
    x: box.left + (box.width * 1027.5) / WORD.width,
    y: box.top + (box.height * 443) / WORD.height,
    width: (box.width * 877) / WORD.width,
  };
}

/**
 * The rings of the logo, very large, in threads of light, drawn only while on screen. With a wide layout they leave
 * the hero as the page scrolls and shrink into the rings of the logo in the nav. The transform and fade are all the
 * browser has to do for that, and a phone keeps them still in the page.
 */
export function HeroRings({
  className,
  phone,
}: {
  className?: string;
  phone: React.RefObject<HTMLElement | null>;
}) {
  const home = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [plain, setPlain] = useState(false);
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;

  useEffect(() => {
    const box = home.current;
    const el = canvas.current;
    if (!box || !el) return;
    const rings = createRings(el);
    if (!rings) {
      setPlain(true);
      return;
    }
    const lost = () => setPlain(true);
    el.addEventListener("webglcontextlost", lost);

    const fine = window.devicePixelRatio >= 1.5;
    const strength = fine ? 1 : 0.72;
    const wide = window.matchMedia(WIDE);
    let travel = 0;
    let onScreen = true;
    let frame = 0;
    const started = performance.now();

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      rings.resize(Math.round(box.clientWidth * dpr), Math.round(box.clientHeight * dpr));
    };

    /** Places the canvas for this scroll position. */
    const place = () => {
      if (reduce || !wide.matches) {
        el.style.cssText = "";
        travel = 0;
        return;
      }
      const rect = box.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      travel = Math.min(1, Math.max(0, window.scrollY / TRAVEL_PX));
      const target = logoRings();
      if (travel >= 1 || !target) {
        el.style.visibility = travel >= 1 ? "hidden" : "";
        return;
      }
      const eased = ease(travel);
      const scale = 1 + (target.width / rect.width - 1) * eased;
      const fromX = rect.left + rect.width / 2;
      const fromY = top + rect.height / 2;
      const x = (target.x - fromX) * eased;
      const y = (target.y - fromY) * eased;
      const phoneBox = phone.current?.getBoundingClientRect();
      const halfWidth = (rect.width * scale) / 2;
      const clear = !phoneBox || fromX + x + halfWidth < phoneBox.left;
      el.style.cssText = `position:fixed;left:${String(rect.left)}px;top:${String(top)}px;width:${String(rect.width)}px;height:${String(rect.height)}px;transform:translate3d(${String(x)}px,${String(y)}px,0) scale(${String(scale)});opacity:${String(eased > 0.82 ? (1 - eased) / 0.18 : 1)};z-index:${String(clear ? Z_OVER_NAV : Z_UNDER_PHONE)};will-change:transform,opacity`;
    };

    const paint = (time: number) => {
      const seconds = (time - started) / 1000;
      const arrive = Math.min(1, seconds / 1.4);
      rings.draw(seconds + 12, strength * arrive * (1 + ease(travel) * 1.6));
    };
    const loop = (time: number) => {
      paint(time);
      frame = onScreen && travel < 1 ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (!frame && onScreen && travel < 1) frame = requestAnimationFrame(loop);
    };
    const still = () => rings.draw(STILL_TIME, strength);

    const refresh = () => {
      size();
      place();
      if (reduce) still();
    };
    refresh();
    const ro = new ResizeObserver(refresh);
    ro.observe(box);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting && !document.hidden;
      if (!reduce) start();
    });
    io.observe(el);
    const onScroll = () => {
      place();
      if (!reduce) start();
    };
    const onVisible = () => {
      onScreen = !document.hidden;
      if (!reduce) start();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    if (!reduce) start();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisible);
      el.removeEventListener("webglcontextlost", lost);
    };
  }, [reduce, phone]);

  return (
    <div ref={home} aria-hidden className={cn("pointer-events-none", className)}>
      {plain ? (
        <LogoMark title="" weight="display" className="size-full" />
      ) : (
        <canvas ref={canvas} className="size-full" />
      )}
    </div>
  );
}
