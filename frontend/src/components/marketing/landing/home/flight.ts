import { PRISM } from "@/components/brand/logo";

/** The prism inks, from the phone's end of the thread to the calendar's. */
export const THREAD_GRADIENT_STOPS: [string, string][] = [
  ["0", PRISM[0]],
  ["0.5", PRISM[1]],
  ["1", PRISM[2]],
];

const DURATION = 1250;
const FRAMES = 36;
const EASE = "cubic-bezier(0.5, 0, 0.14, 1)";

type Box = { left: number; top: number; width: number; height: number };
type Point = { x: number; y: number };

export type FlightPath = {
  d: string;
  gradient: { x1: number; y1: number; x2: number; y2: number };
};

const bend = (a: Point, c: Point, b: Point, t: number): Point => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
});

/**
 * Flies an element, already placed at its destination, in from where it started: down a curve, growing to full size.
 * The curve is written out as keyframes of transform alone, so it runs on the compositor in every browser, and the
 * element ends exactly where the real booking appears. Returns the curve, for the thread drawn along it.
 */
export function flight(el: HTMLElement, scene: HTMLElement, from: DOMRect, to: Box) {
  const s = scene.getBoundingClientRect();
  const b = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
  const middle = { x: from.left - s.left + from.width / 2, y: from.top - s.top + from.height / 2 };
  const across = Math.abs(b.x - middle.x) > Math.abs(b.y - middle.y);
  // It leaves by the booking's own edge, on the side it's going: the right beside a calendar, the foot above one.
  const a = across ? { x: from.right - s.left, y: middle.y } : { x: middle.x, y: from.bottom - s.top };
  const c = across
    ? { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 0.16 * Math.abs(b.x - a.x) }
    : { x: Math.max(a.x, b.x) + 70, y: (a.y + b.y) / 2 };
  const startScale = Math.min(1, Math.max(0.55, (from.width * 0.72) / to.width));

  const keyframes: Keyframe[] = [];
  for (let i = 0; i <= FRAMES; i++) {
    const t = i / FRAMES;
    const p = bend(a, c, b, t);
    const scale = startScale + (1 - startScale) * t;
    const tilt = Math.sin(t * Math.PI) * -2.5;
    keyframes.push({
      transform: `translate(${(p.x - b.x).toFixed(1)}px, ${(p.y - b.y).toFixed(1)}px) rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
      opacity: Math.min(1, t * 9),
    });
  }
  const motion = el.animate(keyframes, { duration: DURATION, easing: EASE, fill: "both" });
  return {
    path: {
      d: `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`,
      gradient: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
    } satisfies FlightPath,
    done: motion.finished.catch(() => undefined),
    cancel: () => motion.cancel(),
  };
}

/** Draws the thread behind the flying booking, in step with it. */
export const drawThread = (path: SVGPathElement) =>
  path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
    duration: DURATION,
    easing: EASE,
    fill: "both",
  });
