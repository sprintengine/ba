/**
 * Pure geometry for the app's bar charts (reports per day, AI credits per day): clean y-axis ticks, how many x-axis
 * labels fit, and each bar's rectangle. No React, so it is unit-tested on its own and the chart memoises one result
 * per data/size change (no per-frame work).
 */
import { chartTickInterval } from "@shared/dashboard/reports";

/** Room one date label ("14 Sept") needs on the x-axis (the website's TICK_SLOT_PX). */
export const TICK_SLOT = 52;
/** Bars never fill their slot: at most this wide, the rest is air. */
export const MAX_BAR = 24;
/** The surface gap between neighbouring bars. */
export const BAR_GAP = 2;
/** Rounded data-end (the baseline stays square). */
export const BAR_RADIUS = 4;

/** A "nice" step (1, 2, 2.5, 5 × 10ⁿ) at least `raw`; whole numbers when `integer`. */
export function niceStep(raw: number, integer: boolean): number {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  const step = nice * power;
  if (!integer) return step;
  // Whole numbers: 2.5 isn't one, and rounding it up to 3 isn't a nice step (0, 3, 6, 9, 12): use 5.
  return step < 1 ? 1 : Number.isInteger(step) ? step : 5 * power;
}

/**
 * Y-axis ticks from 0 to a clean maximum at or above `max`, about `target` intervals. Whole numbers when `integer`
 * (counts, cents); an all-zero series still gets an axis (0 and one step).
 */
export function yTicks(max: number, { integer = true, target = 4 } = {}): number[] {
  const step = niceStep(max > 0 ? max / target : 1, integer);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/**
 * Show every `interval + 1`-th x label (Recharts' `interval`): the website's density (`chartTickInterval`), thinned
 * further so labels never run into each other at this width.
 */
export function xLabelInterval(count: number, plotWidth: number): number {
  const fits = plotWidth > 0 ? Math.max(1, Math.floor(plotWidth / TICK_SLOT)) : count;
  return Math.max(chartTickInterval(count), Math.ceil(count / fits) - 1);
}

export type Bar = {
  index: number;
  /** The column's slot (the tap target: the whole slot, not just the painted bar). */
  slotX: number;
  slotWidth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius of the data-end (0 when the bar is too thin to round). */
  radius: number;
};

export type ChartGeometry = {
  plot: { left: number; top: number; width: number; height: number };
  ticks: { value: number; y: number }[];
  bars: Bar[];
  /** Indexes of the bars that get an x label. */
  labels: number[];
  slotWidth: number;
};

/** Every mark's position for `values` drawn in `width` × `height` with a y-axis column of `axisWidth`. */
export function chartGeometry({
  values,
  width,
  height,
  axisWidth,
  labelHeight,
  top = 8,
  integer = true,
  maxBar = MAX_BAR,
}: {
  values: number[];
  width: number;
  height: number;
  axisWidth: number;
  /** Room under the plot for the x labels. */
  labelHeight: number;
  top?: number;
  integer?: boolean;
  maxBar?: number;
}): ChartGeometry {
  const plot = {
    left: axisWidth,
    top,
    width: Math.max(0, width - axisWidth),
    height: Math.max(0, height - top - labelHeight),
  };
  const ticks = yTicks(Math.max(0, ...values), { integer });
  const topValue = ticks[ticks.length - 1] ?? 1;
  const scale = (v: number) => plot.top + plot.height - (Math.max(0, v) / topValue) * plot.height;
  const n = values.length;
  const slotWidth = n > 0 ? plot.width / n : 0;
  const gap = slotWidth > BAR_GAP * 3 ? BAR_GAP : 0;
  const barWidth = Math.max(0, Math.min(maxBar, slotWidth - gap));
  const bars = values.map((value, index) => {
    const slotX = plot.left + index * slotWidth;
    const y = scale(value);
    const h = plot.top + plot.height - y;
    return {
      index,
      slotX,
      slotWidth,
      x: slotX + (slotWidth - barWidth) / 2,
      y,
      width: barWidth,
      height: h,
      radius: Math.min(BAR_RADIUS, barWidth / 2, h),
    };
  });
  const interval = xLabelInterval(n, plot.width);
  const labels = values.map((_, i) => i).filter((i) => i % (interval + 1) === 0);
  return { plot, ticks: ticks.map((value) => ({ value, y: scale(value) })), bars, labels, slotWidth };
}

/** An SVG path for a bar: rounded top corners (the data-end), square at the baseline. */
export function barPath({
  x,
  y,
  width,
  height,
  radius: r,
}: Pick<Bar, "x" | "y" | "width" | "height" | "radius">) {
  if (height <= 0 || width <= 0) return "";
  const bottom = y + height;
  if (r <= 0) return `M${x},${bottom}V${y}H${x + width}V${bottom}Z`;
  return [
    `M${x},${bottom}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${bottom}`,
    "Z",
  ].join("");
}

/** The bar under a tap at `x` (in the chart's coordinates), or null outside the plot. */
export function barAt(
  geometry: Pick<ChartGeometry, "plot" | "slotWidth" | "bars">,
  x: number,
): number | null {
  const { plot, slotWidth, bars } = geometry;
  if (slotWidth <= 0 || x < plot.left || x >= plot.left + plot.width) return null;
  const index = Math.floor((x - plot.left) / slotWidth);
  return index >= 0 && index < bars.length ? index : null;
}

/** "1.5K", "12K", "2M" from 1,000 up; plain below. */
export function compactNumber(value: number, locale?: string): string {
  const abs = Math.abs(value);
  const [div, suffix] = abs >= 1_000_000 ? [1_000_000, "M"] : abs >= 1_000 ? [1_000, "K"] : [1, ""];
  const n = value / div;
  return `${n.toLocaleString(locale, { maximumFractionDigits: suffix ? 1 : 2 })}${suffix}`;
}
