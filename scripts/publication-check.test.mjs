import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addedLines, denylist, findings, main } from "./publication-check.mjs";

test("passes placeholders, example domains and the product's own addresses", () => {
  const text = [
    "ssh build-box.tail1234.ts.net, the tailnet tail1234",
    "/Users/dev/bookanything, /home/runner/work, /Volumes/dev/repo, /opt/bookanything",
    "dev@example.com, owner@bookanything.test, bookings@bookanything.ie, a@b.example",
    "Co-Authored-By: Claude <noreply@anthropic.com>, 1+someone@users.noreply.github.com",
    "Signed-off-by: dependabot[bot] <support@github.com>",
    "198.51.100.20 and 10.0.0.7 and 100.63.0.1 are not tailnet addresses",
  ].join("\n");
  assert.deepEqual(findings(text), []);
});

test("finds tailnets, Tailscale addresses, home directories, volumes and emails", () => {
  const found = findings(
    "mac.tailab12cd.ts.net tailab12cd 100.101.102.103 /Users/someone/x /home/someone /Volumes/backup me@gmail.com",
  );
  assert.deepEqual(found, [
    "a real tailnet name (mac.tailab12cd.ts.net)",
    "a real tailnet id (tailab12cd)",
    "a real tailnet id (tailab12cd)",
    "a Tailscale address (100.101.102.103)",
    "a home directory or local volume (/Users/someone)",
    "a home directory or local volume (/home/someone)",
    "a home directory or local volume (/Volumes/backup)",
    "an email address (me@gmail.com)",
  ]);
  // Only Dependabot's sign-off is allowed at github.com, not the domain.
  assert.deepEqual(findings("someone@github.com, notsupport@github.com, support@github.com.example.io"), [
    "an email address (someone@github.com)",
    "an email address (notsupport@github.com)",
    "an email address (support@github.com.example.io)",
  ]);
});

test("the denylist matches case-insensitively, `=` lines exactly, and never echoes the match", () => {
  const deny = denylist("# a comment\nacme ?book\n=Rival\n\n");
  assert.equal(deny.length, 2);
  assert.deepEqual(findings("Like ACME Book does", deny), ["a denylisted name (PUBLICATION_DENYLIST)"]);
  assert.deepEqual(findings("a rival product", deny), []);
  assert.deepEqual(findings("Rival", deny), ["a denylisted name (PUBLICATION_DENYLIST)"]);
  // A global pattern is reused across texts: its lastIndex must not hide a second match.
  assert.equal(findings("Rival", deny).length, 1);
});

test("addedLines reads a -U0 diff, with file and line, skipping this check's own files and lockfiles", () => {
  const diff = [
    "diff --git a/docs/a.md b/docs/a.md",
    "+++ b/docs/a.md",
    "@@ -1,0 +4,2 @@",
    "+first",
    "+second",
    "+++ b/scripts/publication-check.test.mjs",
    "@@ -0,0 +1 @@",
    "+/Users/someone",
    "+++ b/frontend/package-lock.json",
    "@@ -0,0 +1 @@",
    '+      "deprecated": "write to someone@example.org"',
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
  ].join("\n");
  assert.deepEqual(addedLines(diff), [
    { where: "docs/a.md:4", text: "first" },
    { where: "docs/a.md:5", text: "second" },
  ]);
});

test("checks the texts, commit messages and added lines of a range", () => {
  const dir = mkdtempSync(join(tmpdir(), "pc-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "dev@example.com");
  git("config", "user.name", "dev");
  git("commit", "-q", "--allow-empty", "-m", "chore: start");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(dir, "notes.md"), "fine\n");
  git("add", ".");
  git("commit", "-q", "-m", "docs: notes");
  const cwd = process.cwd();
  process.chdir(dir);
  const run = (env) => {
    const errors = [];
    const code = main(["--text-env", "TITLE", "--range", `${base}..HEAD`], {
      env,
      log: () => {},
      error: (e) => errors.push(e),
    });
    return { code, errors };
  };
  try {
    assert.equal(run({ TITLE: "docs: notes" }).code, 0);
    assert.match(run({ TITLE: "docs: from /Users/someone" }).errors[0], /pull request title: a home directory/);
    writeFileSync(join(dir, "notes.md"), "fine\nask me@gmail.com\n");
    git("commit", "-q", "-am", "docs: a contact");
    const { code, errors } = run({ TITLE: "docs: notes", PUBLICATION_DENYLIST: "contact" });
    assert.equal(code, 1);
    assert.ok(errors.some((e) => /commit [0-9a-f]+: a denylisted name/.test(e)));
    assert.ok(errors.some((e) => /notes\.md:2: an email address \(me@gmail\.com\)/.test(e)));
    // A pull request from this repository must be checked against the denylist.
    const required = (env) => main(["--range", `${base}..${base}`, "--require-denylist"], { env, log: () => {}, error: () => {} });
    assert.equal(required({}), 1);
    assert.equal(required({ PUBLICATION_DENYLIST: "# only a comment\n" }), 1);
    assert.equal(required({ PUBLICATION_DENYLIST: "acme" }), 0);
  } finally {
    process.chdir(cwd);
  }
});
