/**
 * Compares two web-vitals reports (`PERF_REPORT=... npm run perf:vitals`), e.g. a build before and after a change:
 *
 *   npm run perf:compare -- perf-report/before.json perf-report/after.json [--out comparison.md]
 *
 * Prints a Markdown table of each page's medians before and after, with the change.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { type Report, compareReports } from "../perf/lib/vitals.ts";

const [beforeFile, afterFile, ...rest] = process.argv.slice(2);
if (!beforeFile || !afterFile) {
  console.error("usage: npm run perf:compare -- <before.json> <after.json> [--out file.md]");
  process.exit(2);
}
const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Report;
const markdown = compareReports(read(beforeFile), read(afterFile));
const outAt = rest.indexOf("--out");
const out = outAt >= 0 ? rest[outAt + 1] : undefined;
if (out) writeFileSync(out, markdown);
console.log(markdown);
