import { PRISM } from "@/components/brand/logo";

import type { Director } from "./tour/director";

const DURATION = 1250;
const FRAMES = 36;
const EASE = "cubic-bezier(0.5, 0, 0.14, 1)";

type Box = { left: number; top: number; width: number; height: number };
type Point = { x: number; y: number };

const bend = (a: Point, c: Point, b: Point, t: number): Point => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
});

/** The way from the phone to the calendar: out of the booking's own edge on the side it's going, down a curve. */
function route(from: DOMRect, s: DOMRect, to: Box) {
  const b = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
  const middle = { x: from.left - s.left + from.width / 2, y: from.top - s.top + from.height / 2 };
  const across = Math.abs(b.x - middle.x) > Math.abs(b.y - middle.y);
  const a = across
    ? { x: (b.x > middle.x ? from.right : from.left) - s.left, y: middle.y }
    : { x: middle.x, y: (b.y > middle.y ? from.bottom : from.top) - s.top };
  const c = across
    ? { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 0.16 * Math.abs(b.x - a.x) }
    : { x: Math.max(a.x, b.x) + 70, y: (a.y + b.y) / 2 };
  return { a, b, c };
}

/**
 * The curve as keyframes of transform alone, so it runs on the compositor in every browser, growing to full size and
 * ending exactly on the real booking.
 */
function curve({ a, b, c }: ReturnType<typeof route>, startScale: number) {
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
  return keyframes;
}

/** The thread behind the booking, in the prism inks from the phone's end to the calendar's. */
function thread({ a, b, c }: ReturnType<typeof route>) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "pointer-events-none absolute inset-0 z-[44] size-full overflow-visible");
  svg.innerHTML = `<defs><linearGradient id="hero-thread" gradientUnits="userSpaceOnUse" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}">${PRISM.map(
    (colour, i) => `<stop offset="${i / 2}" stop-color="${colour}"/>`,
  ).join(
    "",
  )}</linearGradient></defs><path d="M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}" fill="none" stroke="url(#hero-thread)" stroke-width="2.5" stroke-linecap="round" pathLength="1" stroke-dasharray="1"/>`;
  return svg;
}

/**
 * The moment the page is about: the real booking already sits on the real calendar, hidden, and a copy of it flies
 * there from the phone along a lit thread. Copying it means this always looks like the app's card, whatever that
 * becomes. `scale` is how much the calendar is drawn down.
 */
export async function flyToCard(card: HTMLElement, scene: HTMLElement, scale: number, director: Director) {
  const from = scene.querySelector("[data-flight-from]")?.getBoundingClientRect();
  if (!from) return;
  const s = scene.getBoundingClientRect();
  const r = card.getBoundingClientRect();
  const to = { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
  const path = route(from, s, to);

  const ticket = document.createElement("div");
  ticket.className = "pointer-events-none absolute z-[45]";
  Object.assign(ticket.style, {
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
  });
  const copy = card.cloneNode(true) as HTMLElement;
  Object.assign(copy.style, {
    left: "0",
    top: "0",
    width: `${to.width / scale}px`,
    height: `${to.height / scale}px`,
    transform: `scale(${scale})`,
    transformOrigin: "0 0",
    boxShadow: "0 12px 28px -8px rgb(20 16 60 / 0.4)",
  });
  ticket.append(copy);
  const line = thread(path);
  scene.append(line, ticket);
  const clear = director.onStop(() => {
    ticket.remove();
    line.remove();
    card.style.visibility = "";
  });

  card.style.visibility = "hidden";
  const startScale = Math.min(1, Math.max(0.55, (from.width * 0.72) / to.width));
  const options = { duration: DURATION, easing: EASE, fill: "both" as const };
  await Promise.all([
    director.play(ticket.animate(curve(path, startScale), options)),
    director.play(
      line.querySelector("path")!.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], options),
    ),
  ]);
  card.style.visibility = "";
  ticket.remove();
  clear();
  const [first, middle, last] = PRISM;
  void director
    .play(
      card.animate(
        [
          { boxShadow: `0 0 0 2px ${middle}, 0 0 22px 2px ${first}, 0 0 34px 6px ${last}` },
          { boxShadow: "0 0 0 0 transparent, 0 0 0 0 transparent, 0 0 0 0 transparent" },
        ],
        { duration: 1500, easing: "ease-out" },
      ),
    )
    .catch(() => undefined);
  await director.play(line.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: "forwards" }));
  line.remove();
}
