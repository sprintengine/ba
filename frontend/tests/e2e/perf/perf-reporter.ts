import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullConfig, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import {
  type BudgetFile,
  type PageResult,
  type Report,
  renderMarkdown,
  updateBudgetFile,
} from "../../../perf/lib/vitals";
import { BUDGET_FILE } from "./measure";

/**
 * Collects the `web-vitals` attachments of `performance.spec.ts` (the last attempt of each test) and, when there are
 * any: writes `$PERF_REPORT.json` and `.md`, appends the Markdown to the GitHub job summary, and with `PERF_UPDATE=1`
 * re-records `perf/web-vitals-budget.json`. A run without performance tests leaves everything untouched.
 */
export default class PerfReporter implements Reporter {
  private baseURL = "";
  private readonly results = new Map<string, PageResult>();

  onBegin(config: FullConfig) {
    const project = config.projects.find((p) => p.name === "performance") ?? config.projects[0];
    this.baseURL = project?.use.baseURL ?? "";
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const attachment = result.attachments.find((a) => a.name === "web-vitals");
    if (attachment?.body)
      this.results.set(test.id, JSON.parse(attachment.body.toString("utf8")) as PageResult);
  }

  onEnd() {
    if (this.results.size === 0) return;
    const budgets = JSON.parse(readFileSync(BUDGET_FILE, "utf8")) as BudgetFile;
    const order = Object.keys(budgets.pages);
    const pages = [...this.results.values()].sort((a, b) => rank(order, a.name) - rank(order, b.name));
    const report: Report = {
      baseURL: this.baseURL,
      createdAt: new Date().toISOString(),
      commit: process.env.GITHUB_SHA,
      profile: budgets.profile,
      pages,
    };
    const markdown = renderMarkdown(report);

    const target = process.env.PERF_REPORT;
    if (target) {
      const base = path.resolve(target.replace(/\.(json|md)$/, ""));
      mkdirSync(path.dirname(base), { recursive: true });
      writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
      writeFileSync(`${base}.md`, markdown);
      console.log(`Web-vitals report: ${base}.json, ${base}.md`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    if (process.env.PERF_UPDATE === "1") {
      writeFileSync(BUDGET_FILE, `${JSON.stringify(updateBudgetFile(budgets, pages), null, 2)}\n`);
      console.log(`Re-recorded ${path.relative(process.cwd(), BUDGET_FILE)} for ${pages.length} page(s).`);
    }
  }

  printsToStdio() {
    return false;
  }
}

const rank = (order: string[], name: string) => {
  const i = order.indexOf(name);
  return i < 0 ? order.length : i;
};
