import { cn } from "@/lib/utils";
import type { Director } from "./director";

/** Long enough to follow, never so long that it looks lost: grows with the distance, as a hand does. */
const moveMs = (distance: number) => Math.min(1500, 520 + distance * 0.72);
const STEPS = 40;
const GLIDE = "cubic-bezier(0.45, 0.05, 0.2, 1)";

type Point = { x: number; y: number };

const bezier = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const u = 1 - t;
  const blend = (p: number, q: number, r: number, s: number) =>
    u * u * u * p + 3 * u * u * t * q + 3 * u * t * t * r + t * t * t * s;
  return { x: blend(a.x, b.x, c.x, d.x), y: blend(a.y, b.y, c.y, d.y) };
};

/** The arrow, and the ring a click leaves. Moved by `pointer`, never by React, so it costs no renders. */
export function Cursor({ ref, className }: { ref: React.Ref<HTMLDivElement>; className?: string }) {
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute top-0 left-0 z-[60] size-0 opacity-0", className)}
    >
      <span data-ring className="absolute -top-5 -left-5 size-10 rounded-full bg-black/15 opacity-0" />
      <svg
        data-arrow
        width="22"
        height="26"
        viewBox="0 0 22 26"
        className="absolute top-0 left-0 origin-top-left drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]"
      >
        <path
          d="M2 2v18.5l5.1-4.7 3.4 7.9 3.6-1.5-3.4-7.8h7z"
          fill="#111"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Drives the arrow over the stage. It travels on a shallow curve, bent to one side as a wrist bends it, and eased at
 * both ends. What it stops on gets `data-hover`, so the app's own hover styles answer; a click presses the arrow and
 * clicks the real control.
 */
export function pointer(el: HTMLElement, stage: HTMLElement, director: Director) {
  let at: Point = { x: 0, y: 0 };
  let hovered: Element | null = null;
  let bend = 1;
  const arrow = el.querySelector<SVGElement>("[data-arrow]")!;
  const ring = el.querySelector<HTMLElement>("[data-ring]")!;

  const centre = (target: Element): Point => {
    const s = stage.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
  };
  const hover = (target: Element | null) => {
    hovered?.removeAttribute("data-hover");
    hovered = target;
    hovered?.setAttribute("data-hover", "");
  };
  const place = (p: Point) => {
    at = p;
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  };

  return {
    /** Puts the arrow somewhere, unseen, then fades it in. */
    async enter(p: Point) {
      place(p);
      await director.play(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: "forwards" }));
    },
    async moveTo(target: Element | Point) {
      const element = target instanceof Element ? target : null;
      const to = element ? centre(element) : (target as Point);
      const from = at;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);
      if (element !== hovered) hover(null);
      if (distance < 1) {
        hover(element);
        return;
      }
      bend = -bend;
      const nx = (-dy / distance) * bend * Math.min(70, distance * 0.14);
      const ny = (dx / distance) * bend * Math.min(70, distance * 0.14);
      const a = { x: from.x + dx * 0.3 + nx, y: from.y + dy * 0.3 + ny };
      const b = { x: from.x + dx * 0.72 + nx * 0.6, y: from.y + dy * 0.72 + ny * 0.6 };
      const keyframes: Keyframe[] = [];
      for (let i = 0; i <= STEPS; i++) {
        const p = bezier(from, a, b, to, i / STEPS);
        keyframes.push({ transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)` });
      }
      const motion = el.animate(keyframes, { duration: moveMs(distance), easing: GLIDE, fill: "forwards" });
      // Lit just before it arrives, as a real pointer crosses the edge of what it's going to.
      const lit = director.sleep(moveMs(distance) * 0.82).then(() => hover(element));
      await Promise.all([director.play(motion), lit]);
      place(to);
      motion.cancel();
    },
    async click(target: Element) {
      await this.moveTo(target);
      await director.sleep(240);
      await this.press();
      (target as HTMLElement).click();
    },
    /** The press: the arrow dips, the ring opens and fades. */
    async press() {
      const dip = arrow.animate(
        [{ transform: "scale(1)" }, { transform: "scale(0.84)" }, { transform: "scale(1)" }],
        { duration: 240, easing: "ease-out" },
      );
      const open = ring.animate(
        [
          { opacity: 0.9, transform: "scale(0.3)" },
          { opacity: 0, transform: "scale(1.15)" },
        ],
        { duration: 420, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
      );
      await director.play(dip);
      void director.play(open).catch(() => undefined);
    },
    leave() {
      hover(null);
    },
  };
}

export type Pointer = ReturnType<typeof pointer>;

/** A fingertip on the phone: it appears on the control, presses, and clicks it. Coordinates are the phone's own. */
export async function tap(dot: HTMLElement, screen: HTMLElement, target: HTMLElement, director: Director) {
  const box = screen.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const k = box.width / screen.offsetWidth;
  dot.style.left = `${(r.left + r.width / 2 - box.left) / k}px`;
  dot.style.top = `${(r.top + r.height / 2 - box.top) / k}px`;
  await director.play(
    dot.animate(
      [
        { opacity: 0, scale: 1.35 },
        { opacity: 1, scale: 1, offset: 0.55 },
        { opacity: 1, scale: 0.8, offset: 0.8 },
        { opacity: 1, scale: 0.8 },
      ],
      { duration: 640, easing: "ease-out", fill: "both" },
    ),
  );
  target.click();
  await director.play(dot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }));
}
