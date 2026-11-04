import { describe, expect, it } from "vitest";
import {
  ctaProgress,
  faceLayout,
  facesFor,
  heroAngles,
  heroRegion,
  isShortLandscape,
  isStacked,
  PHONE_FACES,
  STACKED_MEDIA,
  type Viewport,
} from "../choreography";

const desk: Viewport = { vw: 1440, vh: 900, heroTop: 640 };
const phone: Viewport = { vw: 390, vh: 844, heroTop: 470 };

describe("layout", () => {
  it("stacks on phones and upright tablets, sits side by side on desktops and landscape tablets", () => {
    expect(isStacked(390, 844)).toBe(true);
    expect(isStacked(820, 1180)).toBe(true);
    expect(isStacked(1180, 820)).toBe(false);
    expect(isStacked(1440, 900)).toBe(false);
    expect(isStacked(1024, 1366)).toBe(true);
    expect(facesFor(390)).toBe(PHONE_FACES);
  });

  it("has a media query for the stacked layout that agrees with isStacked", () => {
    /** Evaluates the query's subset: a list of `and`ed max-width, min-height and max-aspect-ratio features. */
    const matches = (query: string, vw: number, vh: number) =>
      query.split(/,\s*/).some((alt) =>
        [...alt.matchAll(/\(([a-z-]+):\s*([\d.]+)(?:px|\/(\d+))?\)/g)].every(([, feature, a, b]) => {
          const n = Number(a);
          if (feature === "max-width") return vw <= n;
          if (feature === "min-height") return vh >= n;
          if (feature === "max-aspect-ratio") return vw / vh <= n / Number(b);
          throw new Error(`unexpected feature ${String(feature)}`);
        }),
      );
    // Odd widths: never exactly on the 20/23 edge, where CSS (inclusive) and isStacked (strict) may differ.
    for (let vw = 301; vw <= 2001; vw += 20)
      for (let vh = 300; vh <= 1500; vh += 20)
        expect(matches(STACKED_MEDIA, vw, vh), `${String(vw)}×${String(vh)}`).toBe(isStacked(vw, vh));
  });

  it("puts a sideways phone's slab on the right half, below the nav", () => {
    expect(isShortLandscape(844, 390)).toBe(true);
    expect(isShortLandscape(1180, 820)).toBe(false);
    expect(isStacked(844, 390)).toBe(false);
    const vp: Viewport = { vw: 844, vh: 390, heroTop: 0 };
    const L = faceLayout(0, vp);
    expect(vp.vw / 2 + L.cx - (L.w * L.k) / 2).toBeGreaterThanOrEqual(844 * 0.5 - 0.5);
    expect(vp.vh / 2 + L.cy - (L.h * L.k) / 2).toBeGreaterThanOrEqual(72 - 0.5);
  });

  it("keeps the hero slab inside its region", () => {
    for (const vp of [desk, phone]) {
      const g = heroRegion(vp);
      const L = faceLayout(0, vp);
      const half = { w: (L.w * L.k) / 2, h: (L.h * L.k) / 2 };
      const cx = vp.vw / 2 + L.cx;
      const cy = vp.vh / 2 + L.cy;
      expect(cx - half.w).toBeGreaterThanOrEqual(g.x0 - 0.5);
      expect(cx + half.w).toBeLessThanOrEqual(g.x1 + 0.5);
      expect(cy - half.h).toBeGreaterThanOrEqual(g.y0 - 0.5);
      expect(cy + half.h).toBeLessThanOrEqual(g.y1 + 0.5);
    }
  });

  it("puts the hero slab above the hero copy on phones", () => {
    expect(heroRegion(phone).y1).toBeLessThanOrEqual(phone.heroTop);
  });

  it("keeps the slab above the copy however tall the copy is (a small phone, browser bars, larger text)", () => {
    // An iPhone SE: the copy is taller than half the screen, so the stage grows and the copy starts at 250px.
    const se: Viewport = { vw: 320, vh: 820, heroTop: 250 };
    expect(heroRegion(se).y1).toBeLessThanOrEqual(se.heroTop);
    const L = faceLayout(0, se);
    expect(se.vh / 2 + L.cy + (L.h * L.k) / 2).toBeLessThanOrEqual(se.heroTop);
  });

  it("turns the hero slab less on phones", () => {
    expect(heroAngles(false)).toEqual({ rx: 9, ry: -17 });
    expect(Math.abs(heroAngles(true).ry)).toBeLessThan(17);
  });

  it("lands the closing face in its anchor without enlarging it", () => {
    const L = faceLayout(7, desk, { x0: 440, x1: 1000, y0: 330, y1: 670 });
    expect(L.k).toBe(1);
    expect(L.cx).toBe(0);
  });
});

describe("closing section", () => {
  it("turns the closing slab in as the section arrives", () => {
    expect(ctaProgress(900, 900)).toBe(0);
    expect(ctaProgress(-2000, 900)).toBe(1);
  });
});
