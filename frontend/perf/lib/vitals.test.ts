import {
  type BudgetFile,
  type Metrics,
  type PageResult,
  type Report,
  budgetFrom,
  check,
  compareReports,
  cumulativeLayoutShift,
  formatMetric,
  median,
  renderMarkdown,
  summarize,
  throttlingRate,
  totalBlockingTime,
  updateBudgetFile,
} from "./vitals";

const metrics = (over: Partial<Metrics> = {}): Metrics => ({
  lcp: 1000,
  fcp: 500,
  cls: 0,
  tbt: 100,
  ttfb: 20,
  jsBytes: 500 * 1024,
  totalBytes: 700 * 1024,
  requests: 40,
  jsRequests: 28,
  ...over,
});

const profile: BudgetFile["profile"] = {
  device: "Pixel 7",
  cpu: { benchmarkTargetMs: 450, maxRate: 10 },
  network: { latencyMs: 150, downloadKbps: 9000, uploadKbps: 1500 },
};

const page = (name: string, runs: Metrics[], withBudget = true): PageResult => {
  const summary = summarize(runs);
  const budget = withBudget ? budgetFrom(summary) : undefined;
  return {
    name,
    path: `/${name}`,
    runs,
    summary,
    budget,
    checks: budget ? check(summary, budget) : undefined,
    cpu: { benchmarkMs: 100, rate: 4.5, effectiveMs: 450 },
    lcpElement: 'h1 "Hello"',
  };
};

describe("median", () => {
  it("takes the middle value, or the mean of the two middle values", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("cumulativeLayoutShift", () => {
  it("is the largest session window, not the sum of all shifts", () => {
    const shifts = [
      { startTime: 100, value: 0.05, hadRecentInput: false },
      { startTime: 600, value: 0.05, hadRecentInput: false }, // same window: 0.1
      { startTime: 3000, value: 0.08, hadRecentInput: false }, // gap of more than 1 s: a new window
    ];
    expect(cumulativeLayoutShift(shifts)).toBeCloseTo(0.1);
  });

  it("caps a window at 5 s and ignores shifts after input", () => {
    const every800ms = Array.from({ length: 10 }, (_, i) => ({
      startTime: i * 800,
      value: 0.01,
      hadRecentInput: false,
    }));
    expect(cumulativeLayoutShift(every800ms)).toBeCloseTo(0.07); // 0, 800, ..., 4800 in the first window
    expect(cumulativeLayoutShift([{ startTime: 1, value: 0.5, hadRecentInput: true }])).toBe(0);
    expect(cumulativeLayoutShift([])).toBe(0);
  });
});

describe("totalBlockingTime", () => {
  it("sums the part of each long task over 50 ms between FCP and the end", () => {
    const tasks = [
      { startTime: 100, duration: 200 }, // before FCP at 250: 50 ms after it, not blocking
      { startTime: 400, duration: 120 }, // 70
      { startTime: 1000, duration: 50 }, // 0
      { startTime: 1900, duration: 300 }, // clipped at 2000: 100 ms, 50 blocking
    ];
    expect(totalBlockingTime(tasks, 250, 2000)).toBe(120);
  });
});

describe("throttlingRate", () => {
  it("slows the machine to the target, between 1 and the maximum", () => {
    expect(throttlingRate(100, 450, 10)).toBe(4.5);
    expect(throttlingRate(30, 450, 10)).toBe(10);
    expect(throttlingRate(900, 450, 10)).toBe(1);
    expect(throttlingRate(0, 450, 10)).toBe(10);
  });
});

describe("summarize", () => {
  it("gives the median, min and max of every metric", () => {
    const s = summarize([metrics({ lcp: 900 }), metrics({ lcp: 1200 }), metrics({ lcp: 1000 })]);
    expect(s.median.lcp).toBe(1000);
    expect(s.min.lcp).toBe(900);
    expect(s.max.lcp).toBe(1200);
    expect(() => summarize([])).toThrow();
  });
});

describe("budgetFrom", () => {
  it("gives timings 50% headroom and at least 250 ms, rounded up to 50 ms", () => {
    const b = budgetFrom(summarize([metrics({ lcp: 2000, fcp: 500, tbt: 0, ttfb: 20 })]));
    expect(b.lcp).toBe(3000);
    expect(b.fcp).toBe(750);
    expect(b.tbt).toBe(250);
    expect(b.ttfb).toBe(300);
  });

  it("keeps deterministic metrics tight, from the worst run", () => {
    const b = budgetFrom(
      summarize([
        metrics({ cls: 0.001, requests: 40 }),
        metrics({ cls: 0.012, jsBytes: 600 * 1024, requests: 41 }),
      ]),
    );
    expect(b.cls).toBe(0.04);
    expect(b.jsBytes).toBe(618 * 1024); // +3% (18 KB) beats +10 KB
    expect(b.requests).toBe(46); // +10% rounded up beats +2
    expect(budgetFrom(summarize([metrics({ jsBytes: 100 * 1024, requests: 5 })]))).toMatchObject({
      jsBytes: 110 * 1024,
      requests: 7,
    });
  });
});

describe("check", () => {
  it("compares each budgeted median, inclusive", () => {
    const s = summarize([metrics()]);
    const checks = check(s, { ...budgetFrom(s), lcp: 999, fcp: 500 });
    expect(checks.filter((c) => !c.ok).map((c) => c.metric)).toEqual(["lcp"]);
    expect(checks.map((c) => c.metric)).toEqual(["lcp", "fcp", "cls", "tbt", "ttfb", "jsBytes", "requests"]);
  });
});

describe("formatMetric", () => {
  it("formats by kind", () => {
    expect(formatMetric("lcp", 1234.4)).toBe("1234 ms");
    expect(formatMetric("cls", 0.01234)).toBe("0.012");
    expect(formatMetric("jsBytes", 1536)).toBe("1.5 KB");
    expect(formatMetric("requests", 40)).toBe("40");
  });
});

const report = (pages: PageResult[], baseURL = "http://localhost:3003"): Report => ({
  baseURL,
  createdAt: "2026-10-07T12:00:00.000Z",
  commit: "abc123",
  profile,
  pages,
});

describe("renderMarkdown", () => {
  it("summarises every page and details its runs and budgets", () => {
    const over = page("over", [metrics({ lcp: 2000 })]);
    over.checks = check(over.summary, { ...over.budget!, lcp: 1500 });
    const md = renderMarkdown(
      report([page("home", [metrics(), metrics({ lcp: 1400 })]), over, page("new", [metrics()], false)]),
    );
    expect(md).toContain("http://localhost:3003 · 2026-10-07T12:00:00.000Z · abc123");
    expect(md).toContain("Pixel 7, 9 Mbps down / 1.5 Mbps up, 150 ms RTT");
    expect(md).toContain(
      "| home (`/home`) | 1200 ms | 500 ms | 0.000 | 100 ms | 20 ms | 500.0 KB | 700.0 KB | 40 | 4.5× | ok |",
    );
    expect(md).toContain("| over: LCP |");
    expect(md).toMatch(/\| new \(`\/new`\) \|.*\| — \|/);
    expect(md).toContain("## home (`/home`, 2 runs)");
    expect(md).toContain('LCP element: `h1 "Hello"`');
    expect(md).toContain("| LCP | 1200 ms | 1000 ms | 1400 ms | 1800 ms | ok |");
    expect(md).toContain("| LCP | 2000 ms | 2000 ms | 2000 ms | 1500 ms | **over** |");
  });
});

describe("compareReports", () => {
  it("lists before and after medians with the change", () => {
    const before = report([page("home", [metrics()]), page("gone", [metrics()])]);
    const after = report(
      [page("home", [metrics({ lcp: 800, tbt: 0, jsBytes: 400 * 1024 })]), page("added", [metrics()])],
      "http://localhost:3004",
    );
    const md = compareReports(before, after);
    expect(md).toContain("Before: http://localhost:3003");
    expect(md).toContain("After: http://localhost:3004");
    expect(md).toContain("| home | LCP | 1000 ms | 800 ms | -20.0% |");
    expect(md).toContain("| home | TBT | 100 ms | 0 ms | -100.0% |");
    expect(md).toContain("| home | CLS | 0.000 | 0.000 | 0% |");
    expect(md).toContain("| home | Requests | 40 | 40 | +0.0% |");
    expect(md).toContain("| gone | — | measured | not measured |  |");
    expect(md).toContain("| added | — | not measured | measured |  |");
    const grown = compareReports(
      report([page("p", [metrics({ cls: 0 })])]),
      report([page("p", [metrics({ cls: 0.1 })])]),
    );
    expect(grown).toContain("| p | CLS | 0.000 | 0.100 | new |");
  });
});

describe("updateBudgetFile", () => {
  it("re-records measured pages and keeps the profile, run count and other pages", () => {
    const file: BudgetFile = {
      profile,
      runs: 5,
      pages: { kept: { path: "/kept", budget: budgetFrom(summarize([metrics()])) } },
    };
    const next = updateBudgetFile(file, [page("home", [metrics({ cls: 0.01234, lcp: 999.6 })])]);
    expect(next.profile).toBe(profile);
    expect(next.runs).toBe(5);
    expect(Object.keys(next.pages)).toEqual(["kept", "home"]);
    expect(next.pages.home).toMatchObject({ path: "/home", recorded: { cls: 0.012, lcp: 1000 } });
    expect(next.pages.home?.budget.lcp).toBe(1500);
    expect(file.pages.home).toBeUndefined();
  });
});
