import {
  type BundleSnapshot,
  allowedGrowth,
  compareBundles,
  formatKb,
  formatTable,
  isFailure,
  toBaseline,
  verdict,
} from "./bundle";

const KB = 1024;
const route = (js: number, css = 30 * KB) => ({ js, jsRaw: js * 3, css, chunks: 20 });
const snapshot = (
  routes: BundleSnapshot["routes"],
  totals?: Partial<BundleSnapshot["totals"]>,
): BundleSnapshot => ({
  routes,
  totals: { sharedJs: 128 * KB, allJs: 1700 * KB, allCss: 35 * KB, ...totals },
});

describe("allowedGrowth", () => {
  it("is the larger of the ratio and the absolute floor", () => {
    expect(allowedGrowth(100 * KB)).toBe(10 * KB); // 3% is 3 KB: the floor wins
    expect(allowedGrowth(1000 * KB)).toBe(30 * KB); // 3% wins
    expect(allowedGrowth(1000, { ratio: 0.5, bytes: 0 })).toBe(500);
  });
});

describe("compareBundles", () => {
  const baseline = snapshot({ "/": route(500 * KB), "/pricing": route(287 * KB) });

  it("passes growth within the tolerance", () => {
    const rows = compareBundles(baseline, snapshot({ "/": route(510 * KB), "/pricing": route(290 * KB) }), [
      "/",
      "/pricing",
    ]);
    expect(rows.filter(isFailure)).toEqual([]);
    expect(rows.find((r) => r.name === "/ js")).toMatchObject({
      delta: 10 * KB,
      allowed: 15 * KB,
      status: "ok",
    });
  });

  it("fails a route that grew beyond the tolerance", () => {
    const rows = compareBundles(baseline, snapshot({ "/": route(520 * KB), "/pricing": route(287 * KB) }), [
      "/",
      "/pricing",
    ]);
    expect(rows.filter(isFailure).map((r) => r.name)).toEqual(["/ js"]);
  });

  it("checks CSS and the totals too", () => {
    const rows = compareBundles(
      baseline,
      snapshot({ "/": route(500 * KB, 45 * KB), "/pricing": route(287 * KB) }, { allJs: 1800 * KB }),
      ["/", "/pricing"],
    );
    expect(rows.filter(isFailure).map((r) => r.name)).toEqual(["/ css", "total allJs"]);
  });

  it("marks a route that got smaller than the tolerance for ratcheting, without failing", () => {
    const rows = compareBundles(baseline, snapshot({ "/": route(400 * KB), "/pricing": route(287 * KB) }), [
      "/",
    ]);
    expect(rows.find((r) => r.name === "/ js")?.status).toBe("shrunk");
    expect(rows.some(isFailure)).toBe(false);
  });

  it("fails a tracked route with no baseline, or missing from the build", () => {
    const rows = compareBundles(baseline, snapshot({ "/": route(500 * KB), "/my": route(295 * KB) }), [
      "/",
      "/pricing",
      "/my",
    ]);
    expect(rows.find((r) => r.name === "/pricing js")).toMatchObject({ status: "missing", current: null });
    expect(rows.find((r) => r.name === "/my js")).toMatchObject({ status: "new", base: null });
    expect(compareBundles(baseline, baseline, ["/nowhere"])[0]?.status).toBe("missing");
  });
});

describe("formatting", () => {
  it("prints KB with one decimal, signed deltas and dashes for nothing", () => {
    expect(formatKb(1536)).toBe("1.5 KB");
    expect(formatKb(1536, true)).toBe("+1.5 KB");
    expect(formatKb(-1536, true)).toBe("-1.5 KB");
    expect(formatKb(null)).toBe("—");
  });

  it("renders an aligned table with percentages and statuses", () => {
    const base = snapshot({ "/": route(500 * KB) });
    const table = formatTable(
      compareBundles(base, snapshot({ "/": route(520 * KB), "/new": route(KB) }), ["/", "/new"]),
    );
    const lines = table.split("\n");
    expect(lines[0]).toMatch(/^metric \(gzip\)\s+baseline\s+now\s+delta\s+allowed\s+status$/);
    expect(table).toContain("+20.0 KB (+4.0%)");
    expect(table).toContain("OVER BUDGET");
    expect(table).toContain("no baseline");
    // Columns line up: every row's status starts under the header's.
    const statusAt = lines[0]!.indexOf("status");
    for (const l of lines.slice(2)) expect(l.slice(statusAt - 2, statusAt)).toBe("  ");
  });
});

describe("verdict", () => {
  const base = snapshot({ "/": route(500 * KB), "/pricing": route(287 * KB) });

  it("is ok with no failures", () => {
    expect(verdict(compareBundles(base, base, ["/"]))).toEqual({
      ok: true,
      messages: ["Bundle budget: ok."],
    });
  });

  it("names the failures and how to re-record", () => {
    const v = verdict(compareBundles(base, snapshot({ "/": route(600 * KB) }), ["/"]));
    expect(v.ok).toBe(false);
    expect(v.messages[0]).toBe("Bundle budget exceeded: / js.");
    expect(v.messages[1]).toContain("--update");
  });

  it("nudges to ratchet down a route that shrank", () => {
    const v = verdict(
      compareBundles(base, snapshot({ "/": route(450 * KB), "/pricing": route(287 * KB) }), ["/"]),
    );
    expect(v.ok).toBe(true);
    expect(v.messages[0]).toMatch(/^Smaller than the baseline .*: \/ js\. Ratchet/);
  });
});

describe("toBaseline", () => {
  it("keeps the tracked routes in order and drops the rest", () => {
    const b = toBaseline(
      snapshot({ "/z": route(1), "/a": route(2), "/untracked": route(3) }),
      ["/a", "/z", "/gone"],
      "16.3.7",
    );
    expect(Object.keys(b.routes)).toEqual(["/a", "/z"]);
    expect(b.nextVersion).toBe("16.3.7");
    expect(b.$comment).toContain("--update");
  });
});
