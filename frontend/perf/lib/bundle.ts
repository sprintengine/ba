/**
 * Bundle-size budget: the pure half (comparison, tolerance, report). `scripts/check-bundle-budget.ts` reads the build
 * and calls these; `bundle.test.ts` covers them. Runs under Node's type stripping, so: erasable TypeScript only (no
 * enums, no parameter properties) and `.ts` extensions on relative imports.
 */

/** What one route ships on first load, in bytes. `js`/`css` are gzip sizes (what users download). */
export type RouteSize = { js: number; jsRaw: number; css: number; chunks: number };

/** Build-wide totals, gzip bytes: JS every route loads, all client JS emitted (lazy chunks too), all CSS. */
export type BundleTotals = { sharedJs: number; allJs: number; allCss: number };

export type BundleSnapshot = { routes: Record<string, RouteSize>; totals: BundleTotals };

export type BundleBaseline = BundleSnapshot & { $comment?: string; nextVersion?: string };

/**
 * A metric may grow by 3% or 10 KB (gzip), whichever is larger, before the check fails. Sizes are deterministic for
 * a given source tree, so this is not noise headroom: it lets ordinary feature work (a form, a dialog: a few KB)
 * through without a baseline bump in every PR, while catching the regressions that matter (a dependency pulled into
 * a shared layout, a client boundary moved up the tree, a lazy import made eager), which cost 15 KB or more at once.
 * At the sizes measured when this was written (290-560 KB gzip per route) 3% is 9-17 KB; the 10 KB floor keeps small
 * metrics (CSS, ~31 KB) from failing on a few hundred bytes.
 */
export const TOLERANCE = { ratio: 0.03, bytes: 10 * 1024 } as const;

export type Tolerance = { ratio: number; bytes: number };

export const allowedGrowth = (base: number, tolerance: Tolerance = TOLERANCE): number =>
  Math.max(Math.round(base * tolerance.ratio), tolerance.bytes);

export type Status = "ok" | "over" | "shrunk" | "new" | "missing";

export type Row = {
  /** `/pricing js`, `total allJs`, ... */
  name: string;
  base: number | null;
  current: number | null;
  delta: number | null;
  allowed: number | null;
  status: Status;
};

/** Metrics with a budget: per route, gzip JS and CSS; build-wide, the three totals. */
const ROUTE_METRICS = ["js", "css"] as const;
const TOTAL_METRICS = ["sharedJs", "allJs", "allCss"] as const;

function compareOne(name: string, base: number | undefined, current: number | undefined, t: Tolerance): Row {
  if (base === undefined && current === undefined) {
    return { name, base: null, current: null, delta: null, allowed: null, status: "missing" };
  }
  if (base === undefined)
    return { name, base: null, current: current!, delta: null, allowed: null, status: "new" };
  if (current === undefined)
    return { name, base, current: null, delta: null, allowed: null, status: "missing" };
  const delta = current - base;
  const allowed = allowedGrowth(base, t);
  const status: Status = delta > allowed ? "over" : delta < -allowed ? "shrunk" : "ok";
  return { name, base, current, delta, allowed, status };
}

/**
 * Compares a build against the baseline for the tracked routes. A tracked route missing from the build (renamed or
 * removed) or from the baseline (newly tracked) fails too: both need a deliberate `--update`.
 */
export function compareBundles(
  baseline: BundleSnapshot,
  current: BundleSnapshot,
  routes: readonly string[],
  tolerance: Tolerance = TOLERANCE,
): Row[] {
  const rows: Row[] = [];
  for (const route of routes) {
    const base = baseline.routes[route];
    const now = current.routes[route];
    for (const metric of ROUTE_METRICS) {
      rows.push(compareOne(`${route} ${metric}`, base?.[metric], now?.[metric], tolerance));
    }
  }
  for (const metric of TOTAL_METRICS) {
    rows.push(compareOne(`total ${metric}`, baseline.totals[metric], current.totals[metric], tolerance));
  }
  return rows;
}

export const isFailure = (row: Row): boolean =>
  row.status === "over" || row.status === "new" || row.status === "missing";

/** `123.4 KB` (1 KB = 1024 bytes), signed when [signed]. */
export function formatKb(bytes: number | null, signed = false): string {
  if (bytes === null) return "—";
  const kb = (bytes / 1024).toFixed(1);
  return signed && bytes > 0 ? `+${kb} KB` : `${kb} KB`;
}

const STATUS_LABEL: Record<Status, string> = {
  ok: "ok",
  over: "OVER BUDGET",
  shrunk: "smaller: ratchet down",
  new: "no baseline",
  missing: "missing from build",
};

/** A fixed-width table (for the terminal and CI logs): metric, baseline, now, delta (and %), allowed, status. */
export function formatTable(rows: readonly Row[]): string {
  const header = ["metric (gzip)", "baseline", "now", "delta", "allowed", "status"];
  const body = rows.map((r) => {
    const pct =
      r.delta !== null && r.base
        ? ` (${r.delta > 0 ? "+" : ""}${((r.delta / r.base) * 100).toFixed(1)}%)`
        : "";
    return [
      r.name,
      formatKb(r.base),
      formatKb(r.current),
      r.delta === null ? "—" : `${formatKb(r.delta, true)}${pct}`,
      r.allowed === null ? "—" : `+${formatKb(r.allowed)}`,
      STATUS_LABEL[r.status],
    ];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((cells) => cells[i]!.length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === 0 || i === cells.length - 1 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!)))
      .join("  ")
      .trimEnd();
  return [line(header), widths.map((w) => "-".repeat(w)).join("  "), ...body.map(line)].join("\n");
}

export type Verdict = { ok: boolean; messages: string[] };

/** What to tell the developer after the table: failures, and a nudge to re-record when something got smaller. */
export function verdict(rows: readonly Row[]): Verdict {
  const failures = rows.filter(isFailure);
  const shrunk = rows.filter((r) => r.status === "shrunk");
  const messages: string[] = [];
  if (failures.length > 0) {
    messages.push(
      `Bundle budget exceeded: ${failures.map((r) => r.name).join(", ")}.`,
      "Find what grew (`npx next experimental-analyze`) and trim it. If the growth is deliberate, re-record with " +
        "`npm run perf:bundle -- --update` and say why in the commit message.",
    );
  }
  if (shrunk.length > 0) {
    messages.push(
      `Smaller than the baseline by more than the tolerance: ${shrunk.map((r) => r.name).join(", ")}. ` +
        "Ratchet the baseline down (`npm run perf:bundle -- --update`) so the saving is kept.",
    );
  }
  if (failures.length === 0) messages.push("Bundle budget: ok.");
  return { ok: failures.length === 0, messages };
}

/** The baseline file for [snapshot], routes in tracked order (stable diffs). */
export function toBaseline(
  snapshot: BundleSnapshot,
  routes: readonly string[],
  nextVersion: string,
): BundleBaseline {
  const ordered: Record<string, RouteSize> = {};
  for (const route of routes) {
    const size = snapshot.routes[route];
    if (size) ordered[route] = size;
  }
  return {
    $comment:
      "Generated by `npm run perf:bundle -- --update` after `npm run build`. Gzip bytes on first load per route. " +
      "Re-record deliberately and say why in the commit (docs/engineering.md, Performance budgets).",
    nextVersion,
    routes: ordered,
    totals: snapshot.totals,
  };
}
