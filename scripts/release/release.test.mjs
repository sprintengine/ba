import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SITE_FILES,
  aheadOfProduction,
  mainOnly,
  nightlyGate,
  promoteCheck,
  releaseNotes,
  stageCheck,
  stagedRecord,
  stagingPassed,
  verifyStaged,
} from "./release.mjs";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);
const hash = (c) => c.repeat(64);

test("the nightly gate builds when main moved, skips a quiet day and refuses rewritten history", () => {
  assert.equal(nightlyGate({ head: A, last: null }).build, true);
  assert.equal(nightlyGate({ head: A, last: { tag: "v0.1.0-nightly.20261103.1", commit: A } }).build, false);
  assert.equal(nightlyGate({ head: B, last: { tag: "v0.1.0-nightly.20261103.1", commit: A }, lastIsAncestor: true }).build, true);
  assert.throws(
    () => nightlyGate({ head: B, last: { tag: "v0.1.0-nightly.20261103.1", commit: A }, lastIsAncestor: false }),
    /no longer contains/,
  );
});

test("the train runs from main only", () => {
  assert.doesNotThrow(() => mainOnly("refs/heads/main"));
  assert.doesNotThrow(() => mainOnly(undefined));
  assert.throws(() => mainOnly("refs/heads/topic"), /runs from main, not refs\/heads\/topic/);
  assert.throws(() => mainOnly("refs/tags/v0.1.0"), /runs from main/);
});

test("staging needs a nightly whose commit is not released yet", () => {
  assert.throws(() => stageCheck({ nightly: null }), /no nightly/);
  assert.throws(() => stageCheck({ nightly: { tag: "v0.2.0-nightly.20261104.3", commit: A }, releasedAs: "v0.2.0" }), /already released as v0\.2\.0/);
  assert.doesNotThrow(() => stageCheck({ nightly: { tag: "v0.2.0-nightly.20261104.3", commit: A } }));
});

test("production only moves forward", () => {
  const candidate = { tag: "v0.3.0-rc.9", commit: B };
  assert.doesNotThrow(() => aheadOfProduction({ candidate, production: null }));
  assert.doesNotThrow(() => aheadOfProduction({ candidate, production: { tag: "v0.2.0", commit: A }, containsProduction: true }));
  assert.throws(
    () => aheadOfProduction({ candidate, production: { tag: "v0.2.0", commit: A }, containsProduction: false }),
    /does not contain v0\.2\.0/,
  );
});

const candidate = { tag: "v0.3.0-rc.9", commit: B };
const staged = {
  tag: "v0.3.0-rc.9",
  commit: B,
  images: { backend: `ghcr.io/example/bookanything-backend@sha256:${hash("d")}` },
  sha256: { "images.json": hash("1"), [SITE_FILES.staging]: hash("2"), [SITE_FILES.production]: hash("3") },
  staging: { runId: "77", siteDeployed: true },
};
const passed = { status: "completed", conclusion: "success" };

test("a promote needs a candidate whose staging passed, unreleased, ahead of production, with its website staged", () => {
  const ok = { candidate, staged, stagingJob: passed, production: null, siteConfigured: true };
  assert.doesNotThrow(() => promoteCheck(ok));
  assert.throws(() => promoteCheck({ ...ok, candidate: null }), /Nothing has been staged/);
  assert.throws(() => promoteCheck({ ...ok, staged: { ...staged, commit: C } }), /does not describe it/);
  assert.throws(() => promoteCheck({ ...ok, stagingJob: undefined }), /no Staging job/);
  assert.throws(() => promoteCheck({ ...ok, stagingJob: { status: "completed", conclusion: "failure" } }), /did not pass staging.*\(failure\)/);
  assert.throws(() => promoteCheck({ ...ok, stagingJob: { status: "in_progress" } }), /in_progress/);
  assert.throws(() => promoteCheck({ ...ok, releasedAs: "v0.3.0" }), /already released/);
  assert.throws(
    () => promoteCheck({ ...ok, production: { tag: "v0.2.0", commit: A }, containsProduction: false }),
    /Production only moves forward/,
  );
  assert.throws(() => promoteCheck({ ...ok, staged: { ...staged, staging: { runId: "77", siteDeployed: false } } }), /without deploying the website/);
  const noProductionSite = { ...staged, sha256: { "images.json": hash("1"), [SITE_FILES.staging]: hash("2") } };
  assert.throws(() => promoteCheck({ ...ok, staged: noProductionSite }), /no production website build/);
  // Before the website is set up, the backend alone can be promoted.
  assert.doesNotThrow(() => promoteCheck({ ...ok, siteConfigured: false, staged: { ...noProductionSite, staging: { runId: "77" } } }));
  assert.equal(stagingPassed(passed), true);
  assert.equal(stagingPassed({ status: "completed", conclusion: "cancelled" }), false);
});

test("staged.json records what staging tested, and refuses an incomplete record", () => {
  const images = { commit: B, images: staged.images };
  const record = stagedRecord({
    tag: "v0.3.0-rc.9",
    version: "0.3.0-rc.9",
    nightlyTag: "v0.3.0-nightly.20261104.5",
    commit: B,
    images,
    sha256: staged.sha256,
    runId: 77,
    runAttempt: "2",
    siteDeployed: true,
    siteUrl: "https://staging.example.com",
    at: "2026-11-04T10:00:00Z",
  });
  assert.equal(record.staging.runId, "77");
  assert.equal(record.staging.runAttempt, 2);
  assert.equal(record.images.backend, staged.images.backend);
  assert.equal(record.staging.siteUrl, "https://staging.example.com");
  assert.throws(() => stagedRecord({ tag: "v0.3.0", images, commit: B, sha256: staged.sha256 }), /Not a staged tag/);
  assert.throws(() => stagedRecord({ tag: "v0.3.0-rc.9", images: { commit: A }, commit: B, sha256: staged.sha256 }), /images\.json is for/);
  assert.throws(() => stagedRecord({ tag: "v0.3.0-rc.9", images, commit: B, sha256: { "images.json": "nope" } }), /No sha256 for images\.json/);
  assert.throws(() => stagedRecord({ tag: "v0.3.0-rc.9", images, commit: B, sha256: {} }), /No sha256 for images\.json/);
});

test("a promote refuses files that are not byte for byte what staging tested", () => {
  const images = { commit: B, images: staged.images };
  const ok = { staged, tag: "v0.3.0-rc.9", ref: B, images, sha256: staged.sha256 };
  assert.doesNotThrow(() => verifyStaged(ok));
  assert.throws(() => verifyStaged({ ...ok, sha256: { ...staged.sha256, [SITE_FILES.production]: hash("9") } }), /site-production\.tar\.gz is not the file/);
  assert.throws(() => verifyStaged({ ...ok, sha256: { "images.json": hash("1"), [SITE_FILES.staging]: hash("2") } }), /site-production\.tar\.gz is missing/);
  assert.throws(() => verifyStaged({ ...ok, images: { commit: B, images: { backend: "other@sha256:x" } } }), /backend image is not the digest/);
  assert.throws(() => verifyStaged({ ...ok, ref: C }), /for commit/);
});

test("release notes group the changes and name the image", () => {
  const text = releaseNotes({
    intro: "Promotes v0.3.0-rc.9.",
    images: { backend: "ghcr.io/example/bookanything-backend@sha256:abc" },
    previous: "v0.2.0",
    commits: [
      { sha: "1111111", subject: "feat(web): book a slot", body: "" },
      { sha: "2222222", subject: "fix(backend): no double booking", body: "" },
      { sha: "3333333", subject: "feat(mcp)!: rename tools", body: "" },
      { sha: "4444444", subject: "docs: words", body: "" },
      { sha: "5555555", subject: "fix: config", body: "BREAKING CHANGE: TOKEN_SECRET is required" },
    ],
  });
  assert.match(text, /^Promotes v0\.3\.0-rc\.9\.\n\n## Image\n\n- backend: `ghcr\.io\/example\/bookanything-backend@sha256:abc`/);
  assert.match(text, /## Changes since v0\.2\.0\n\n### Breaking changes\n\n- feat\(mcp\)!: rename tools \(3333333\)\n- fix: config \(5555555\)/);
  assert.match(text, /### Features\n\n- feat\(web\): book a slot \(1111111\)/);
  assert.match(text, /### Fixes\n\n- fix\(backend\): no double booking \(2222222\)/);
  assert.match(text, /### Other\n\n- docs: words \(4444444\)/);
  assert.match(releaseNotes({ commits: [] }), /## Changes\n\n- No changes\./);
});

test("resolve picks the version, tag and commit for each channel from the repository's tags", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  const bin = mkdtempSync(join(tmpdir(), "release-bin-"));
  writeFileSync(join(bin, "gh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const script = join(dirname(fileURLToPath(import.meta.url)), "release.mjs");
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  const commit = (message) => {
    git("commit", "-q", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const resolve = (env) => {
    const out = join(dir, ".out");
    rmSync(out, { force: true });
    execFileSync("node", [script, "resolve"], {
      cwd: dir,
      env: {
        ...process.env,
        // CI runs this test on a pull request's ref: the train itself always runs on main.
        GITHUB_REF: "refs/heads/main",
        GITHUB_REPOSITORY: "example/bookanything",
        // A `gh` that finds every release (`gh release view` is how resolve checks a nightly still has its files).
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_OUTPUT: out,
        RUN_NUMBER: "7",
        RELEASE_NOW: "2026-11-04T02:17:00Z",
        ...env,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    return Object.fromEntries(readFileSync(out, "utf8").trim().split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2)));
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "dev@example.com");
  git("config", "user.name", "dev");
  commit("chore: start");
  // No release yet: the first is 0.1.0.
  const first = resolve({ EVENT_NAME: "schedule" });
  assert.equal(first.should_build, "true");
  assert.equal(first.tag, "v0.1.0-nightly.20261104.7");
  git("tag", "v0.1.0");
  // Nothing since v0.1.0: nothing to build.
  assert.equal(resolve({ EVENT_NAME: "schedule" }).should_build, "false");
  commit("fix: a");
  git("switch", "-q", "-c", "topic");
  commit("feat(web): b");
  git("switch", "-q", "main");
  git("merge", "-q", "--no-ff", "-m", "Merge pull request #2 from example/topic", "topic");
  const head = git("rev-parse", "HEAD");
  const nightly = resolve({ EVENT_NAME: "schedule" });
  assert.deepEqual([nightly.should_build, nightly.tag, nightly.ref], ["true", "v0.2.0-nightly.20261104.7", head]);
  git("tag", nightly.tag);
  // The same head again: the gate is shut.
  assert.equal(resolve({ EVENT_NAME: "schedule" }).should_build, "false");
  // Staging the newest nightly.
  const stage = resolve({ EVENT_NAME: "workflow_dispatch", DISPATCH_CHANNEL: "release", RUN_NUMBER: "9" });
  assert.deepEqual([stage.tag, stage.ref, stage.nightly_tag, stage.previous_tag], ["v0.2.0-rc.9", head, nightly.tag, "v0.1.0"]);
  assert.throws(() => resolve({ EVENT_NAME: "workflow_dispatch", DISPATCH_CHANNEL: "release", DISPATCH_NIGHTLY: "v9.9.9-nightly.20261104.1" }));
  // A nightly whose release was pruned cannot be staged; neither can anything from a branch.
  writeFileSync(join(bin, "gh"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  assert.throws(() => resolve({ EVENT_NAME: "workflow_dispatch", DISPATCH_CHANNEL: "release" }));
  assert.throws(() => resolve({ EVENT_NAME: "schedule", GITHUB_REF: "refs/heads/topic" }));
});
