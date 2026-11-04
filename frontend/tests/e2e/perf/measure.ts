import path from "node:path";
import { type Browser, type CDPSession, devices, type Page } from "@playwright/test";
import { type MainPage } from "../main-pages";
import { signInAs } from "../dashboard-helpers";
import {
  type LayoutShift,
  type LongTask,
  type Metrics,
  type Profile,
  cumulativeLayoutShift,
  median,
  throttlingRate,
  totalBlockingTime,
} from "../../../perf/lib/vitals";

export const BUDGET_FILE = path.resolve(import.meta.dirname, "../../../perf/web-vitals-budget.json");

/** What the init script collects in the page (`window.__perf`), from before the first byte of the page's own JS. */
type InPage = { lcp: number; lcpElement: string; fcp: number; shifts: LayoutShift[]; longTasks: LongTask[] };

declare global {
  interface Window {
    __perf?: InPage;
  }
}

/** Runs in every document before its scripts: buffered observers for paint, LCP, layout shifts and long tasks. */
function installObservers() {
  if (window !== window.top) return;
  const perf: InPage = { lcp: 0, lcpElement: "", fcp: 0, shifts: [], longTasks: [] };
  window.__perf = perf;
  const describe = (el: Element | null) => {
    if (!el) return "";
    const id = el.id ? `#${el.id}` : "";
    const text = el.textContent.trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${text ? ` "${text}"` : ""}`;
  };
  const observe = (type: string, onEntry: (entry: PerformanceEntry) => void) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true });
    } catch {
      // Unsupported entry type: the metric stays 0.
    }
  };
  observe("paint", (e) => {
    if (e.name === "first-contentful-paint") perf.fcp = e.startTime;
  });
  observe("largest-contentful-paint", (e) => {
    perf.lcp = e.startTime;
    perf.lcpElement = describe((e as PerformanceEntry & { element: Element | null }).element);
  });
  observe("layout-shift", (e) => {
    const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
    perf.shifts.push({
      startTime: shift.startTime,
      value: shift.value,
      hadRecentInput: shift.hadRecentInput,
    });
  });
  observe("longtask", (e) => perf.longTasks.push({ startTime: e.startTime, duration: e.duration }));
}

/** A fixed, allocation-heavy JS workload (sorting, string building, JSON): its time stands for "CPU speed". */
function benchmark(): number {
  const start = performance.now();
  let checksum = 0;
  for (let round = 0; round < 60; round++) {
    const items = Array.from({ length: 4000 }, (_, i) => ({
      id: i,
      name: `item-${(i * 7919) % 4000}`,
      v: Math.sin(i),
    }));
    items.sort((a, b) => (a.name < b.name ? -1 : 1));
    const json = JSON.stringify(items);
    checksum += (JSON.parse(json) as unknown[]).length + json.length;
  }
  return checksum > 0 ? performance.now() - start : -1;
}

async function timeBenchmark(page: Page, times: number): Promise<number> {
  await page.evaluate(benchmark); // warm-up (JIT)
  const samples: number[] = [];
  for (let i = 0; i < times; i++) samples.push(await page.evaluate(benchmark));
  return median(samples);
}

export type Calibration = { benchmarkMs: number; rate: number; effectiveMs: number };

/**
 * Picks the CPU throttling rate that makes this machine, right now, run the benchmark in the profile's target time
 * (or uses `PERF_CPU_RATE`). Throttling is not quite linear, so the rate is corrected once from a throttled run.
 */
export async function calibrateCpu(browser: Browser, profile: Profile): Promise<Calibration> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const { benchmarkTargetMs: target, maxRate } = profile.cpu;
    const benchmarkMs = await timeBenchmark(page, 5);
    const pinned = Number(process.env.PERF_CPU_RATE);
    let rate = pinned > 0 ? pinned : throttlingRate(benchmarkMs, target, maxRate);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    let effectiveMs = await timeBenchmark(page, 3);
    if (!(pinned > 0) && rate > 1 && rate < maxRate) {
      rate = throttlingRate(benchmarkMs, (target * target) / effectiveMs, maxRate);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      effectiveMs = await timeBenchmark(page, 3);
    }
    return { benchmarkMs: Math.round(benchmarkMs), rate, effectiveMs: Math.round(effectiveMs) };
  } finally {
    await context.close();
  }
}

/** Requests and transferred bytes from the DevTools protocol (complete, unlike Resource Timing across origins). */
function trackNetwork(cdp: CDPSession) {
  const types = new Map<string, string>();
  const bytes = new Map<string, number>();
  let requests = 0;
  let jsRequests = 0;
  cdp.on("Network.requestWillBeSent", (e) => {
    if (/^(data|blob):/.test(e.request.url) || types.has(e.requestId)) return;
    types.set(e.requestId, e.type ?? "Other");
    requests++;
    if (e.type === "Script") jsRequests++;
  });
  cdp.on("Network.responseReceived", (e) => {
    if (types.has(e.requestId)) types.set(e.requestId, e.type);
  });
  cdp.on("Network.loadingFinished", (e) => {
    if (types.has(e.requestId)) bytes.set(e.requestId, e.encodedDataLength);
  });
  return () => {
    let jsBytes = 0;
    let totalBytes = 0;
    for (const [id, size] of bytes) {
      totalBytes += size;
      if (types.get(id) === "Script") jsBytes += size;
    }
    return { requests, jsRequests, jsBytes, totalBytes };
  };
}

export type Run = { metrics: Metrics; lcpElement: string };

/**
 * Quiet = the network is idle and there was no long task in the last second (hydration and effects have run). A page
 * that never goes quiet within 15 s has a busy main thread, which is a failure in itself.
 */
async function waitUntilQuiet(page: Page) {
  await page.waitForLoadState("networkidle");
  try {
    await page.waitForFunction(
      () => {
        const tasks = window.__perf?.longTasks ?? [];
        const lastEnd = tasks.reduce((end, t) => Math.max(end, t.startTime + t.duration), 0);
        return performance.now() - lastEnd > 1000;
      },
      undefined,
      { polling: 250, timeout: 15_000 },
    );
  } catch (e) {
    throw new Error(`${page.url()} kept running long tasks for 15 s after load (a busy main thread?)`, {
      cause: e,
    });
  }
}

/** One cold load of [main] in a fresh context (empty cache), throttled per [profile] at CPU [rate]. */
export async function measureOnce(
  browser: Browser,
  main: MainPage,
  profile: Profile,
  rate: number,
): Promise<Run> {
  const device = devices[profile.device];
  if (!device) throw new Error(`Unknown Playwright device "${profile.device}"`);
  const context = await browser.newContext({ ...device });
  try {
    const page = await context.newPage();
    if (main.as) await signInAs(page, main.as);
    await page.addInitScript(installObservers);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.network.latencyMs,
      downloadThroughput: (profile.network.downloadKbps * 1000) / 8,
      uploadThroughput: (profile.network.uploadKbps * 1000) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const network = trackNetwork(cdp);

    await page.goto(main.path, { timeout: 60_000 });
    await main.ready(page);
    await waitUntilQuiet(page);

    const inPage = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return { ...window.__perf!, ttfb: nav?.responseStart ?? 0, now: performance.now() };
    });
    const net = network();
    return {
      lcpElement: inPage.lcpElement,
      metrics: {
        lcp: inPage.lcp,
        fcp: inPage.fcp,
        cls: cumulativeLayoutShift(inPage.shifts),
        tbt: totalBlockingTime(inPage.longTasks, inPage.fcp, inPage.now),
        ttfb: inPage.ttfb,
        ...net,
      },
    };
  } finally {
    await context.close();
  }
}
