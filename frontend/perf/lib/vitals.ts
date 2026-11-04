/**
 * Web-vitals budgets: the pure half (metric maths, budgets from measurements, checks, reports). The Playwright spec
 * (`tests/e2e/performance.spec.ts`) measures, `tests/e2e/perf/perf-reporter.ts` aggregates and
 * `scripts/compare-perf-reports.ts` diffs two reports; `vitals.test.ts` covers this file. Runs under Node's type
 * stripping too, so: erasable TypeScript only.
 */

/** One page load. Times in ms from navigation start, bytes as transferred (compressed, with headers). */
export type Metrics = {
  lcp: number;
  fcp: number;
  cls: number;
  tbt: number;
  ttfb: number;
  jsBytes: number;
  totalBytes: number;
  requests: number;
  jsRequests: number;
};

export type MetricName = keyof Metrics;

/** The metrics with a budget; the others are reported only. */
export const BUDGETED = ["lcp", "fcp", "cls", "tbt", "ttfb", "jsBytes", "requests"] as const;
export type BudgetedMetric = (typeof BUDGETED)[number];
export type Budget = Record<BudgetedMetric, number>;

const TIMINGS = new Set<MetricName>(["lcp", "fcp", "tbt", "ttfb"]);
const BYTES = new Set<MetricName>(["jsBytes", "totalBytes"]);

/** The emulated device and connection. Changing it invalidates every budget: re-record them together. */
export type Profile = {
  /** A Playwright device descriptor name (viewport, DPR, touch, user agent). */
  device: string;
  /**
   * CPU throttling is calibrated per test: a fixed JS workload is timed unthrottled and the rate chosen so that it
   * takes `benchmarkTargetMs`, which makes a fast laptop and a slow CI runner emulate the same phone. The rate is
   * clamped to [1, maxRate]; `PERF_CPU_RATE` pins it instead (for A/B comparisons on one machine).
   */
  cpu: { benchmarkTargetMs: number; maxRate: number };
  network: { latencyMs: number; downloadKbps: number; uploadKbps: number };
};

export type BudgetFile = {
  $comment?: string;
  profile: Profile;
  /** Loads per page; timings are checked on the median. */
  runs: number;
  pages: Record<string, { path: string; budget: Budget; recorded?: Partial<Metrics> }>;
};

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type LayoutShift = { startTime: number; value: number; hadRecentInput: boolean };

/**
 * CLS as Chrome defines it: the largest session window of layout shifts (shifts less than 1 s apart, a window at most
 * 5 s long), ignoring shifts right after user input.
 */
export function cumulativeLayoutShift(shifts: readonly LayoutShift[]): number {
  let max = 0;
  let current = 0;
  let windowStart = 0;
  let last = Number.NEGATIVE_INFINITY;
  for (const s of [...shifts].sort((a, b) => a.startTime - b.startTime)) {
    if (s.hadRecentInput) continue;
    if (s.startTime - last >= 1000 || s.startTime - windowStart >= 5000) {
      current = 0;
      windowStart = s.startTime;
    }
    current += s.value;
    last = s.startTime;
    max = Math.max(max, current);
  }
  return max;
}

export type LongTask = { startTime: number; duration: number };

/**
 * Total blocking time: for each long task, the part over 50 ms, counting only what falls between FCP and [end]
 * (Lighthouse clips the same way; it ends at TTI, this ends when the page has gone quiet).
 */
export function totalBlockingTime(tasks: readonly LongTask[], fcp: number, end: number): number {
  let total = 0;
  for (const t of tasks) {
    const start = Math.max(t.startTime, fcp);
    const stop = Math.min(t.startTime + t.duration, end);
    total += Math.max(0, stop - start - 50);
  }
  return total;
}

/** The CPU throttling rate that makes a [measuredMs] benchmark take [targetMs], clamped to [1, maxRate]. */
export function throttlingRate(measuredMs: number, targetMs: number, maxRate: number): number {
  if (measuredMs <= 0) return maxRate;
  const rate = targetMs / measuredMs;
  return Math.round(Math.min(maxRate, Math.max(1, rate)) * 100) / 100;
}

export type Summary = { median: Metrics; min: Metrics; max: Metrics };

export function summarize(runs: readonly Metrics[]): Summary {
  if (runs.length === 0) throw new Error("No runs to summarize");
  const pick = (f: (values: number[]) => number) =>
    Object.fromEntries(
      Object.keys(runs[0]!).map((k) => [k, f(runs.map((r) => r[k as MetricName]))]),
    ) as Metrics;
  return { median: pick(median), min: pick((v) => Math.min(...v)), max: pick((v) => Math.max(...v)) };
}

const ceilTo = (value: number, step: number) => Math.ceil(value / step - 1e-9) * step;

/**
 * Budgets from a recording. Timings vary run to run and machine to machine: the median plus 50%, and at least
 * +250 ms (so a 100 ms TTFB or a 0 ms TBT is not a coin toss), rounded up to 50 ms. CLS, bytes and request counts
 * are deterministic for a build, so they are tight: the worst run plus 0.02 CLS, plus 3% or 10 KB of JS (the bundle
 * budget's tolerance), plus 10% or 2 requests.
 */
export function budgetFrom(summary: Summary): Budget {
  const timing = (m: BudgetedMetric) =>
    ceilTo(Math.max(summary.median[m] * 1.5, summary.median[m] + 250), 50);
  const js = summary.max.jsBytes;
  return {
    lcp: timing("lcp"),
    fcp: timing("fcp"),
    tbt: timing("tbt"),
    ttfb: timing("ttfb"),
    cls: Math.round(ceilTo(summary.max.cls + 0.02, 0.01) * 100) / 100,
    jsBytes: ceilTo(js + Math.max(js * 0.03, 10 * 1024), 1024),
    requests: summary.max.requests + Math.max(2, Math.ceil(summary.max.requests * 0.1)),
  };
}

export type Check = { metric: BudgetedMetric; value: number; budget: number; ok: boolean };

/** Checks the median of every budgeted metric (CLS, bytes and requests too: a one-off outlier is not a regression). */
export function check(summary: Summary, budget: Budget): Check[] {
  return BUDGETED.map((metric) => ({
    metric,
    value: summary.median[metric],
    budget: budget[metric],
    ok: summary.median[metric] <= budget[metric],
  }));
}

export function formatMetric(metric: MetricName, value: number): string {
  if (metric === "cls") return value.toFixed(3);
  if (TIMINGS.has(metric)) return `${Math.round(value)} ms`;
  if (BYTES.has(metric)) return `${(value / 1024).toFixed(1)} KB`;
  return String(Math.round(value));
}

export type PageResult = {
  name: string;
  path: string;
  runs: Metrics[];
  summary: Summary;
  budget?: Budget;
  checks?: Check[];
  cpu: { benchmarkMs: number; rate: number; effectiveMs?: number };
  lcpElement?: string;
};

export type Report = {
  baseURL: string;
  createdAt: string;
  commit?: string;
  profile: Profile;
  pages: PageResult[];
};

const LABELS: Record<MetricName, string> = {
  lcp: "LCP",
  fcp: "FCP",
  cls: "CLS",
  tbt: "TBT",
  ttfb: "TTFB",
  jsBytes: "JS",
  totalBytes: "All bytes",
  requests: "Requests",
  jsRequests: "JS requests",
};

const SUMMARY_COLUMNS: MetricName[] = [
  "lcp",
  "fcp",
  "cls",
  "tbt",
  "ttfb",
  "jsBytes",
  "totalBytes",
  "requests",
];

const row = (cells: string[]) => `| ${cells.join(" | ")} |`;

/** A human-readable report: one summary table of medians, then per page the spread and the budget checks. */
export function renderMarkdown(report: Report): string {
  const { network, device } = report.profile;
  const out = [
    "# Web-vitals report",
    "",
    `${report.baseURL} · ${report.createdAt}${report.commit ? ` · ${report.commit}` : ""}`,
    "",
    `Profile: ${device}, ${network.downloadKbps / 1000} Mbps down / ${network.uploadKbps / 1000} Mbps up, ` +
      `${network.latencyMs} ms RTT, CPU calibrated to a ${report.profile.cpu.benchmarkTargetMs} ms benchmark. ` +
      "Medians of each page's runs, cold cache.",
    "",
    row(["Page", ...SUMMARY_COLUMNS.map((m) => LABELS[m]), "CPU rate", "Budgets"]),
    row(Array<string>(SUMMARY_COLUMNS.length + 3).fill("---")),
  ];
  for (const p of report.pages) {
    const failed = p.checks?.filter((c) => !c.ok).map((c) => LABELS[c.metric]) ?? [];
    const verdict = p.checks ? (failed.length ? `over: ${failed.join(", ")}` : "ok") : "—";
    out.push(
      row([
        `${p.name} (\`${p.path}\`)`,
        ...SUMMARY_COLUMNS.map((m) => formatMetric(m, p.summary.median[m])),
        `${p.cpu.rate}×`,
        verdict,
      ]),
    );
  }
  for (const p of report.pages) {
    out.push("", `## ${p.name} (\`${p.path}\`, ${p.runs.length} runs)`, "");
    if (p.lcpElement) out.push(`LCP element: \`${p.lcpElement}\``, "");
    out.push(row(["Metric", "Median", "Min", "Max", "Budget", ""]), row(Array<string>(6).fill("---")));
    for (const m of Object.keys(LABELS) as MetricName[]) {
      const c = p.checks?.find((x) => x.metric === m);
      out.push(
        row([
          LABELS[m],
          formatMetric(m, p.summary.median[m]),
          formatMetric(m, p.summary.min[m]),
          formatMetric(m, p.summary.max[m]),
          c ? formatMetric(m, c.budget) : "",
          c ? (c.ok ? "ok" : "**over**") : "",
        ]),
      );
    }
  }
  return `${out.join("\n")}\n`;
}

/** Before/after medians per page and metric, with the change. Pages in only one report are listed as such. */
export function compareReports(before: Report, after: Report): string {
  const out = [
    "# Web-vitals comparison",
    "",
    `Before: ${before.baseURL} (${before.createdAt})  `,
    `After: ${after.baseURL} (${after.createdAt})`,
    "",
    row(["Page", "Metric", "Before", "After", "Change"]),
    row(Array<string>(5).fill("---")),
  ];
  const afterPages = new Map(after.pages.map((p) => [p.name, p]));
  for (const b of before.pages) {
    const a = afterPages.get(b.name);
    if (!a) {
      out.push(row([b.name, "—", "measured", "not measured", ""]));
      continue;
    }
    for (const m of Object.keys(LABELS) as MetricName[]) {
      const x = b.summary.median[m];
      const y = a.summary.median[m];
      const pct =
        x === 0 ? (y === 0 ? "0%" : "new") : `${y >= x ? "+" : ""}${(((y - x) / x) * 100).toFixed(1)}%`;
      out.push(row([b.name, LABELS[m], formatMetric(m, x), formatMetric(m, y), pct]));
    }
  }
  for (const a of after.pages) {
    if (!before.pages.some((b) => b.name === a.name))
      out.push(row([a.name, "—", "not measured", "measured", ""]));
  }
  return `${out.join("\n")}\n`;
}

/** The budget file re-recorded from [pages], keeping its profile, run count and any page not measured this time. */
export function updateBudgetFile(file: BudgetFile, pages: readonly PageResult[]): BudgetFile {
  const next: BudgetFile = { ...file, pages: { ...file.pages } };
  for (const p of pages) {
    const rounded = Object.fromEntries(
      Object.entries(p.summary.median).map(([k, v]) => [
        k,
        k === "cls" ? Math.round(v * 1000) / 1000 : Math.round(v),
      ]),
    ) as Metrics;
    next.pages[p.name] = { path: p.path, budget: budgetFrom(p.summary), recorded: rounded };
  }
  return next;
}
