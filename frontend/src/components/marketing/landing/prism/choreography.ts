/**
 * Where the glass slab sits, as pure functions: the hero's slab above (or beside) the hero copy, and the closing
 * slab in its anchor under the last call to action. The stage feeds these from the viewport each frame.
 *
 * Faces: 0 hero · 1 today · 2 calendar · 3 reminders · 4 payments · 5 an AI assistant (Bo, or the owner's own) ·
 * 6 the client's booking page · 7 closing CTA. Faces 0 and 7 ride the slab; 1–6 are glass cards in the page's flow,
 * one per story beat (see story-beats.tsx).
 */

export type FaceSize = { w: number; h: number; r: number };

/** Design sizes of each face (px), before scaling to the viewport. */
export const DESK_FACES: readonly FaceSize[] = [
  { w: 700, h: 420, r: 50 },
  { w: 560, h: 440, r: 42 },
  { w: 840, h: 540, r: 34 },
  { w: 520, h: 108, r: 54 },
  { w: 380, h: 476, r: 42 },
  { w: 520, h: 350, r: 42 },
  { w: 310, h: 640, r: 54 },
  { w: 560, h: 340, r: 44 },
];
export const PHONE_FACES: readonly FaceSize[] = [
  { w: 350, h: 256, r: 36 },
  { w: 350, h: 392, r: 32 },
  { w: 358, h: 470, r: 28 },
  { w: 350, h: 92, r: 46 },
  { w: 320, h: 420, r: 36 },
  { w: 350, h: 340, r: 32 },
  { w: 300, h: 650, r: 50 },
  { w: 350, h: 320, r: 34 },
];
export const FACE_COUNT = DESK_FACES.length;

/** Below this width the faces use the phone designs. */
export const PHONE_MAX = 760;

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Cubic ease in-out. */
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export type Viewport = {
  vw: number;
  vh: number;
  /** Top of the hero copy (px from the top), for stacked layouts. */
  heroTop: number;
};
export type Rect = { x0: number; x1: number; y0: number; y1: number };
export type SlabLayout = { cx: number; cy: number; w: number; h: number; r: number; k: number };

export const isPhone = (vw: number) => vw < PHONE_MAX;
/** A phone held sideways: too short to stack, so copy sits left and the slab right (see prism.module.css). */
export const isShortLandscape = (vw: number, vh: number) => vh < 560 && vw > vh * 1.3;
/** Hero copy below the slab: phones, and tablets held upright. Otherwise the copy sits along the bottom edge. */
export const isStacked = (vw: number, vh: number) =>
  !isShortLandscape(vw, vh) && (vw < 1024 || vh > vw * 1.15);
/** `isStacked` as a media query: prism.module.css stacks the hero copy with the same rule. */
export const STACKED_MEDIA =
  "(max-aspect-ratio: 20/23), (max-width: 1023.98px) and (min-height: 560px), (max-width: 1023.98px) and (max-aspect-ratio: 13/10)";
export const facesFor = (vw: number) => (isPhone(vw) ? PHONE_FACES : DESK_FACES);

/** The part of the viewport the hero slab may occupy, clear of the nav and the hero copy. */
export function heroRegion(vp: Viewport): Rect {
  const { vw, vh } = vp;
  if (isShortLandscape(vw, vh)) return { x0: vw * 0.53, x1: vw - 24, y0: 72, y1: vh - 14 };
  const side = isPhone(vw) ? 14 : 40;
  const top = isPhone(vw) ? 74 : 96;
  // The slab stops above wherever the copy starts. Stacked, the copy is in the stage's flow under the room it keeps
  // for the slab (prism.module.css), so a longer headline moves the copy down instead of running under the glass.
  return isStacked(vw, vh)
    ? { x0: side, x1: vw - side, y0: top, y1: Math.max(vp.heroTop - 20, top + 120) }
    : { x0: 80, x1: vw - 80, y0: 92, y1: Math.min(vh - 236, Math.max(vp.heroTop - 24, 92 + 160)) };
}

/**
 * Where a slab face sits (centre offset from the viewport centre) and its scale: the hero (0) in its region, the
 * closing face (7) in `cta`, the closing anchor's rect.
 */
export function faceLayout(face: 0 | 7, vp: Viewport, cta?: Rect): SlabLayout {
  const d = facesFor(vp.vw)[face]!;
  const g = face === 7 && cta ? cta : heroRegion(vp);
  const pad = face === 7 ? 1 : 1.08;
  const k = Math.max(
    0.1,
    Math.min(face === 7 ? 1 : 1.12, (g.x1 - g.x0) / (d.w * pad), (g.y1 - g.y0) / (d.h * pad)),
  );
  return { cx: (g.x0 + g.x1) / 2 - vp.vw / 2, cy: (g.y0 + g.y1) / 2 - vp.vh / 2, w: d.w, h: d.h, r: d.r, k };
}

/** The hero slab's resting angles (degrees). Phones turn it less. */
export const heroAngles = (phone: boolean) => ({ rx: 9, ry: -17 * (phone ? 0.6 : 1) });

/** Closing section: how far the slab has turned into the light, from the CTA's top edge. */
export function ctaProgress(ctaTop: number, vh: number): number {
  return clamp((vh - ctaTop) / (vh + 520));
}
