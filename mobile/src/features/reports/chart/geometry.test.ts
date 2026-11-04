import {
  barAt,
  barPath,
  BAR_RADIUS,
  chartGeometry,
  compactNumber,
  MAX_BAR,
  niceStep,
  xLabelInterval,
  yTicks,
} from "./geometry";

describe("chart geometry", () => {
  it("picks nice steps (1, 2, 2.5, 5 × 10ⁿ), whole when asked", () => {
    expect(niceStep(0, true)).toBe(1);
    expect(niceStep(Number.NaN, true)).toBe(1);
    expect(niceStep(0.8, false)).toBe(1);
    expect(niceStep(1.5, false)).toBe(2);
    expect(niceStep(2.2, false)).toBe(2.5);
    expect(niceStep(2.2, true)).toBe(5);
    expect(niceStep(22, true)).toBe(25);
    expect(niceStep(4, false)).toBe(5);
    expect(niceStep(7, false)).toBe(10);
    expect(niceStep(0.3, true)).toBe(1);
    expect(niceStep(1200, true)).toBe(2000);
  });

  it("puts y ticks from 0 to a clean top at or above the maximum", () => {
    expect(yTicks(10)).toEqual([0, 5, 10]);
    expect(yTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(yTicks(184_000)).toEqual([0, 50_000, 100_000, 150_000, 200_000]);
    // An all-zero series still gets an axis.
    expect(yTicks(0)).toEqual([0, 1]);
    expect(yTicks(1, { integer: false })).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("thins x labels to the website's density and to what fits", () => {
    expect(xLabelInterval(7, 700)).toBe(0);
    // 30 days: the website shows about 10 labels.
    expect(xLabelInterval(30, 2000)).toBe(2);
    // A phone's width fits fewer: ~6 labels of 52pt in 320pt.
    expect(xLabelInterval(30, 320)).toBe(4);
    expect(xLabelInterval(90, 2000)).toBe(7);
    expect(xLabelInterval(10, 0)).toBe(0);
  });

  it("lays out bars in their slots, capped in width, from one baseline", () => {
    const g = chartGeometry({
      values: [0, 5, 10],
      width: 332,
      height: 208,
      axisWidth: 32,
      labelHeight: 20,
    });
    expect(g.plot).toEqual({ left: 32, top: 8, width: 300, height: 180 });
    expect(g.slotWidth).toBe(100);
    expect(g.ticks.map((t) => t.value)).toEqual([0, 5, 10]);
    expect(g.ticks[0]!.y).toBe(188);
    expect(g.ticks[2]!.y).toBe(8);
    const [empty, half, full] = g.bars;
    expect(empty).toMatchObject({ height: 0, radius: 0, width: MAX_BAR });
    expect(half).toMatchObject({ slotX: 132, x: 132 + (100 - MAX_BAR) / 2, y: 98, height: 90 });
    expect(full).toMatchObject({ y: 8, height: 180, radius: BAR_RADIUS });
    expect(g.labels).toEqual([0, 1, 2]);
  });

  it("drops the gap and rounding on very thin bars, and copes with no data or no room", () => {
    const thin = chartGeometry({
      values: [1, 2, 3, 4],
      width: 24,
      height: 100,
      axisWidth: 20,
      labelHeight: 10,
    });
    expect(thin.bars[0]!.width).toBe(1);
    expect(thin.bars[0]!.radius).toBeLessThanOrEqual(0.5);
    const none = chartGeometry({ values: [], width: 0, height: 0, axisWidth: 32, labelHeight: 20 });
    expect(none.bars).toEqual([]);
    expect(none.slotWidth).toBe(0);
    expect(none.plot).toEqual({ left: 32, top: 8, width: 0, height: 0 });
  });

  it("draws bars with a rounded data-end and a square baseline", () => {
    expect(barPath({ x: 0, y: 0, width: 10, height: 0, radius: 0 })).toBe("");
    expect(barPath({ x: 0, y: 0, width: 0, height: 10, radius: 0 })).toBe("");
    expect(barPath({ x: 1, y: 2, width: 10, height: 20, radius: 0 })).toBe("M1,22V2H11V22Z");
    expect(barPath({ x: 0, y: 0, width: 10, height: 20, radius: 4 })).toBe("M0,20V4Q0,0 4,0H6Q10,0 10,4V20Z");
  });

  it("finds the bar under a tap, anywhere in its slot", () => {
    const g = chartGeometry({ values: [1, 2, 3], width: 332, height: 208, axisWidth: 32, labelHeight: 20 });
    expect(barAt(g, 10)).toBeNull();
    expect(barAt(g, 33)).toBe(0);
    expect(barAt(g, 140)).toBe(1);
    expect(barAt(g, 331)).toBe(2);
    expect(barAt(g, 332)).toBeNull();
    expect(barAt({ ...g, slotWidth: 0 }, 100)).toBeNull();
  });

  it("writes big numbers compactly", () => {
    expect(compactNumber(950, "en-IE")).toBe("950");
    expect(compactNumber(12.345, "en-IE")).toBe("12.35");
    expect(compactNumber(1500, "en-IE")).toBe("1.5K");
    expect(compactNumber(12_000, "en-IE")).toBe("12K");
    expect(compactNumber(2_000_000, "en-IE")).toBe("2M");
    expect(compactNumber(-1500, "en-IE")).toBe("-1.5K");
  });
});
