import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { requireLiveBackend } from "./dashboard-helpers";
import { MAIN_PAGES } from "./main-pages";
import { BUDGET_FILE, calibrateCpu, measureOnce } from "./perf/measure";
import { type BudgetFile, type PageResult, check, formatMetric, summarize } from "../../perf/lib/vitals";

/**
 * Web-vitals budgets (docs/engineering.md, Performance budgets): each page is loaded cold `runs` times on an emulated
 * mid-range phone (profile in `perf/web-vitals-budget.json`), and the medians are checked against that file's
 * budgets. Runs only in the `performance` project (Chromium: it throttles through the DevTools protocol), one page at
 * a time, and should run alone (`npm run perf:vitals`): other tests in parallel slow the CPU it measures.
 *
 *   PERF_REPORT=perf-report/before  JSON + Markdown report of every run (perf-reporter.ts), against any E2E_BASE_URL
 *   PERF_UPDATE=1                   re-record the budgets from this run (deliberately; say why in the commit)
 *   PERF_ASSERT=0                   measure and report without failing on budgets (comparing two builds)
 *   PERF_RUNS=n, PERF_CPU_RATE=x    override the run count / pin the CPU throttling rate
 */
const PAGES = ["marketing home", "pricing", "explore", "booking flow", "dashboard overview"];

const budgets = JSON.parse(readFileSync(BUDGET_FILE, "utf8")) as BudgetFile;
const runs = Number(process.env.PERF_RUNS) || budgets.runs;
const recording = process.env.PERF_UPDATE === "1";
const asserting = !recording && process.env.PERF_ASSERT !== "0";

test.beforeEach(async ({ page }, testInfo) => {
  await requireLiveBackend(page, testInfo);
});

for (const name of PAGES) {
  const main = MAIN_PAGES.find((p) => p.name === name);
  if (!main) throw new Error(`No main page named "${name}" in main-pages.ts`);

  test(`${name} stays within its web-vitals budget`, async ({ browser }, testInfo) => {
    test.setTimeout(60_000 + runs * 45_000);
    const cpu = await calibrateCpu(browser, budgets.profile);
    const measured = [];
    for (let i = 0; i < runs; i++) measured.push(await measureOnce(browser, main, budgets.profile, cpu.rate));

    const summary = summarize(measured.map((r) => r.metrics));
    const budget = budgets.pages[name]?.budget;
    const checks = budget ? check(summary, budget) : undefined;
    const result: PageResult = {
      name,
      path: main.path,
      runs: measured.map((r) => r.metrics),
      summary,
      budget,
      checks,
      cpu,
      lcpElement: measured.at(-1)?.lcpElement,
    };
    await testInfo.attach("web-vitals", { body: JSON.stringify(result), contentType: "application/json" });
    const m = summary.median;
    testInfo.annotations.push({
      type: "web-vitals",
      description:
        (["lcp", "fcp", "cls", "tbt", "ttfb", "jsBytes", "requests"] as const)
          .map((k) => `${k} ${formatMetric(k, m[k])}`)
          .join(" · ") + ` · CPU ${cpu.rate}× (benchmark ${cpu.benchmarkMs} → ${cpu.effectiveMs} ms)`,
    });

    if (!asserting) return;
    expect(budget, `No budget for "${name}": record one with PERF_UPDATE=1`).toBeDefined();
    for (const c of checks ?? []) {
      expect
        .soft(c.value, `${name}: median ${c.metric} ${formatMetric(c.metric, c.value)} over budget`)
        .toBeLessThanOrEqual(c.budget);
    }
  });
}
