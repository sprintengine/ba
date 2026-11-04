/** The run's report: actions by kind and outcome, violations by invariant, latency per endpoint. Markdown. */
import { INVARIANTS, KNOWN_FAILURES, type Violation } from "./invariants";
import type { Stats } from "./stats";
import { formatDuration } from "./time";

export type RunSummary = {
  seed: string;
  baseUrl: string;
  startedAt: string;
  elapsedMs: number;
  businesses: number;
  bookings: number;
  checks: number;
  harnessErrors: number;
  /** Whether paid online bookings were covered (Stripe Checkout runs; null with dev payments). */
  coverage?: string | null;
  violations: Violation[];
  passed: boolean;
};

function table(header: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) =>
    `| ${cells.map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}

export function renderReport(summary: RunSummary, stats: Stats): string {
  const out: string[] = [];
  out.push(`## Simulation ${summary.passed ? "passed" : "FAILED"}`);
  out.push("");
  out.push(
    `Seed \`${summary.seed}\` against ${summary.baseUrl}: ${formatDuration(summary.elapsedMs)}, ${stats.actionCount()} actions, ` +
      `${stats.requests} requests, ${summary.businesses} businesses, ${summary.bookings} bookings the bots know, ` +
      `${summary.checks} invariant checks, ${summary.harnessErrors} harness errors.`,
  );
  out.push("");
  if (summary.coverage) {
    out.push(summary.coverage);
    out.push("");
  }
  out.push(
    `Replay: \`npm --prefix simulation run replay -- --seed ${summary.seed}\` (or \`--from-log\` with this run's log).`,
  );
  out.push("");

  out.push("### Invariants");
  out.push("");
  const counts = new Map<string, Violation[]>();
  for (const v of summary.violations) counts.set(v.invariant, [...(counts.get(v.invariant) ?? []), v]);
  out.push(
    table(
      ["Invariant", "Result", "Violations"],
      Object.keys(INVARIANTS).map((id) => {
        const found = counts.get(id) ?? [];
        const known = id in KNOWN_FAILURES;
        const result = found.length === 0 ? "ok" : known ? "known failure" : "FAILED";
        return [id, result, found.length];
      }),
    ),
  );
  out.push("");
  if (summary.violations.length > 0) {
    out.push("### Violations (first 30)");
    out.push("");
    for (const v of summary.violations.slice(0, 30)) {
      const req = v.context.requestId ? ` (request ${String(v.context.requestId)})` : "";
      out.push(`- **${v.invariant}**${v.known ? " (known)" : ""}: ${v.message}${req}`);
    }
    out.push("");
  }

  out.push("### Actions");
  out.push("");
  out.push(
    table(
      ["Action", "Count", "Outcomes"],
      stats.actionRows().map((r) => [
        r.kind,
        r.total,
        Object.entries(r.outcomes)
          .map(([o, n]) => `${o} ${n}`)
          .join(", "),
      ]),
    ),
  );
  out.push("");

  out.push("### Latency by endpoint (ms)");
  out.push("");
  out.push(
    table(
      ["Endpoint", "Requests", "p50", "p95", "max", "5xx"],
      stats.latencyRows().map((r) => [r.endpoint, r.count, r.p50, r.p95, r.max, r.errors]),
    ),
  );
  out.push("");
  out.push(
    `Statuses: ${Object.entries(stats.statusCounts())
      .map(([s, n]) => `${s} × ${n}`)
      .join(", ")}`,
  );
  out.push("");
  return out.join("\n");
}
