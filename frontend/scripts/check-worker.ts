/**
 * Builds the site as a Cloudflare Worker (OpenNext: `next build` with its standalone output, then the Worker bundle) and
 * checks the Worker's size against Workers' limit (perf/lib/worker.ts). CI's Frontend job runs it in place of
 * `npm run build`: .next is the same build, so the bundle-size budget reads it afterwards.
 *
 *   npm run cf:check
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipKib, judgeWorkerSize } from "../perf/lib/worker.ts";

const run = (args: string[]) =>
  execFileSync("npx", args, {
    encoding: "utf8",
    // OPEN_NEXT_DEPLOY stops `wrangler deploy` handing over to OpenNext's deploy.
    env: { ...process.env, OPEN_NEXT_DEPLOY: "true" },
    stdio: ["ignore", "pipe", "inherit"],
  });

console.log(run(["opennextjs-cloudflare", "build"]));
const out = mkdtempSync(join(tmpdir(), "worker-"));
const verdict = judgeWorkerSize(
  gzipKib(run(["wrangler", "deploy", "--dry-run", "--env", "", "--outdir", out])),
);
if (verdict.level === "fail") {
  console.error(`::error::${verdict.message}`);
  process.exit(1);
}
console.log(verdict.level === "warn" ? `::warning::${verdict.message}` : verdict.message);
