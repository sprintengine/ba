// Design-token gate for the app's own source (app/, src/), the React Native counterpart of the website's Tailwind
// token discipline (and of multicode-mobile's scripts/lint-design-tokens.mjs):
//
//   raw-color    a hex or rgb() colour outside src/ui/tokens.ts
//   raw-spacing  a number on padding/margin/gap (use space[n]; 0 is fine)
//   raw-font     a fontFamily string (use fontFamily.* via <Text>)
//   raw-weight   a fontWeight (Figtree is one family per weight: use <Text weight>)
//
// Escape hatch: `design-tokens-allow: <reason>` on the line or one of the two above. The reason is mandatory.
// `--selftest` proves every rule can fail; CI runs it, so a refactor can't quietly neuter the gate.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const TOKEN_FILES = ["src/ui/tokens.ts"];

const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
const SPACING =
  /\b(padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|paddingStart|paddingEnd|margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical|marginStart|marginEnd|gap|rowGap|columnGap)\s*:\s*(-?\d+(?:\.\d+)?)\s*[,}]/;
const FONT_FAMILY = /\bfontFamily\s*:\s*["'`]/;
const FONT_WEIGHT = /\bfontWeight\s*:/;
const ALLOW = /design-tokens-allow:\s*\S/;

function files(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const allowed = (lines, i) => lines.slice(Math.max(0, i - 2), i + 1).some((l) => ALLOW.test(l));

export function checkSource(relPath, source) {
  if (TOKEN_FILES.includes(relPath) || relPath.startsWith("src/test/")) return [];
  const lines = source.split("\n");
  const violations = [];
  lines.forEach((raw, i) => {
    if (allowed(lines, i)) return;
    const line = raw.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
    const at = `${relPath}:${i + 1}`;
    if (COLOR.test(line))
      violations.push({ rule: "raw-color", at, text: "colour literal: use a theme colour" });
    const spacing = SPACING.exec(line);
    if (spacing && spacing[2] !== "0")
      violations.push({ rule: "raw-spacing", at, text: `${spacing[1]}: ${spacing[2]}: use space[n]` });
    if (FONT_FAMILY.test(line))
      violations.push({ rule: "raw-font", at, text: "fontFamily: use <Text> (fontFamily.*)" });
    if (FONT_WEIGHT.test(line))
      violations.push({ rule: "raw-weight", at, text: "fontWeight: use <Text weight>" });
  });
  return violations;
}

function selftest() {
  const cases = [
    ["raw-color", 'const a = { color: "#ff0000" };'],
    ["raw-color", 'const a = { color: "rgba(0,0,0,0.5)" };'],
    ["raw-spacing", "const a = { padding: 13 };"],
    ["raw-font", 'const a = { fontFamily: "Comic Sans" };'],
    ["raw-weight", 'const a = { fontWeight: "700" };'],
  ];
  const failures = cases
    .filter(([rule, source]) => !checkSource("src/fixture.ts", source).some((v) => v.rule === rule))
    .map(([rule, source]) => `${rule} did not fire on: ${source}`);
  if (checkSource("src/fixture.ts", "// design-tokens-allow: keyed artwork\nconst a = '#ff0000';").length) {
    failures.push("the allow comment did not suppress a violation");
  }
  if (checkSource("src/fixture.ts", "const a = { padding: 0, margin: space[2] };").length) {
    failures.push("zero or a token was flagged");
  }
  if (checkSource("src/ui/tokens.ts", 'const a = "#ff0000";').length)
    failures.push("the token file was flagged");
  if (failures.length) {
    console.error(`lint-design-tokens SELFTEST FAILED:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(
    "lint-design-tokens selftest: every rule fires, the allow comment and the token file are exempt",
  );
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const violations = ["app", "src"]
    .flatMap((dir) => files(join(root, dir)))
    .flatMap((file) => checkSource(relative(root, file), readFileSync(file, "utf8")));
  for (const v of violations) console.error(`${v.at}  ${v.rule}  ${v.text}`);
  console.log(`lint-design-tokens: ${violations.length} violation(s)`);
  process.exit(violations.length ? 1 : 0);
}
