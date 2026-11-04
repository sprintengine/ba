import { describe, expect, it } from "vitest";
import { WORKER_LIMIT_KIB, WORKER_WARN_KIB, gzipKib, judgeWorkerSize } from "./worker";

describe("the Worker's size", () => {
  it("reads the gzipped size from wrangler's dry run", () => {
    expect(gzipKib("Read 282 files\nTotal Upload: 20060.89 KiB / gzip: 4650.54 KiB\nbindings")).toBe(4650.54);
    expect(() => gzipKib("--dry-run: exiting now.")).toThrow(/did not report/);
  });

  it("passes, warns near the limit and fails over it", () => {
    expect(judgeWorkerSize(4650.54)).toEqual({
      level: "ok",
      message: "The Worker is 4.54 MiB gzipped (limit 10 MiB).",
    });
    expect(judgeWorkerSize(WORKER_WARN_KIB + 1).level).toBe("warn");
    expect(judgeWorkerSize(WORKER_LIMIT_KIB + 1)).toEqual({
      level: "fail",
      message: "The Worker is 10.00 MiB gzipped, over Workers' 10 MiB limit.",
    });
  });
});
