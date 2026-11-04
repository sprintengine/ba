import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main, parse, problem, subjectOf } from "./conventional-commits.mjs";

const quiet = { log: () => {}, error: () => {} };

test("accepts every type, a scope, a breaking mark and the length limit", () => {
  for (const subject of [
    "feat: book a slot",
    "fix(backend): refuse a double booking",
    "feat(web)!: drop the old booking page",
    "build(deps): bump the minor-and-patch group in /frontend with 3 updates",
    "ci(deps): bump actions/checkout from 4 to 5",
    "revert: feat(web): book a slot",
    `docs: ${"x".repeat(94)}`,
  ])
    assert.equal(problem(subject), null, subject);
});

test("refuses what is not a Conventional Commit, and says why", () => {
  assert.match(problem("Add booking"), /expected "type\(scope\): summary"/);
  assert.match(problem("feature: add booking"), /"feature" is not a type/);
  assert.match(problem("style: tidy"), /"style" is not a type/);
  assert.match(problem("feat(Web): add"), /expected/);
  assert.match(problem("feat:add"), /expected/);
  assert.match(problem("feat: add booking."), /no full stop/);
  assert.match(problem(`docs: ${"x".repeat(95)}`), /101 characters/);
  assert.match(problem("fixup! feat: add booking"), /expected/);
});

test("parse reads the type, scope and breaking mark", () => {
  assert.deepEqual(parse("feat(web)!: drop it"), { type: "feat", scope: "web", breaking: true, summary: "drop it" });
  assert.deepEqual(parse("fix: it"), { type: "fix", scope: undefined, breaking: false, summary: "it" });
  assert.equal(parse("Merge pull request #3 from org/branch"), null);
  assert.equal(parse("wip: things"), null);
});

test("subjectOf is the first line", () => {
  assert.equal(subjectOf("feat: a\n\nbody\nBREAKING CHANGE: x"), "feat: a");
  assert.equal(subjectOf("fix: b\r\nbody"), "fix: b");
});

test("checks a title, a message file and every non-merge commit in a range", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "dev@example.com");
  git("config", "user.name", "dev");
  git("commit", "-q", "--allow-empty", "-m", "chore: start");
  const base = git("rev-parse", "HEAD");
  git("switch", "-q", "-c", "topic");
  git("commit", "-q", "--allow-empty", "-m", "feat(web): good");
  git("switch", "-q", "main");
  git("commit", "-q", "--allow-empty", "-m", "fix: on main");
  git("switch", "-q", "topic");
  git("merge", "-q", "--no-ff", "-m", "Merge branch 'main' into topic", "main");
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    assert.equal(main(["--title", "feat(web): good", "--range", `${base}..HEAD`], quiet), 0);
    assert.equal(main(["--title", "Good things"], quiet), 1);
    git("commit", "-q", "--allow-empty", "-m", "oops forgot a type");
    const errors = [];
    assert.equal(main(["--range", `${base}..HEAD`], { log: () => {}, error: (e) => errors.push(e) }), 1);
    assert.match(errors[0], /commit [0-9a-f]+ "oops forgot a type"/);
  } finally {
    process.chdir(cwd);
  }
  const message = join(dir, "MSG");
  writeFileSync(message, "fix(backend): a thing\n\nWhy.\n");
  assert.equal(main(["--message-file", message], quiet), 0);
  writeFileSync(message, "Merge branch 'main' into topic\n");
  assert.equal(main(["--message-file", message], quiet), 0);
  writeFileSync(message, "a thing\n");
  assert.equal(main(["--message-file", message], quiet), 1);
  assert.equal(main([], quiet), 2);
});
