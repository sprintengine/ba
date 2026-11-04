import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIRST_VERSION,
  bumpVersion,
  commitBump,
  nextVersion,
  nightliesNewestFirst,
  nightlyVersion,
  stablesNewestFirst,
  stagedNewestFirst,
  stagedVersion,
  strongestBump,
} from "./version.mjs";

test("each commit asks for the bump its type and breaking marks say", () => {
  assert.equal(commitBump("feat(web): book a slot"), "minor");
  assert.equal(commitBump("fix: a crash"), "patch");
  assert.equal(commitBump("docs: words"), "patch");
  assert.equal(commitBump("build(deps): bump next"), "patch");
  assert.equal(commitBump("feat(mcp)!: rename the tools"), "major");
  assert.equal(commitBump("fix: tighten\n\nBREAKING CHANGE: TOKEN_SECRET is now required"), "major");
  assert.equal(commitBump("fix: tighten\n\nBREAKING-CHANGE: it"), "major");
  // History from before the convention counts as a patch.
  assert.equal(commitBump("Backend: something old"), "patch");
});

test("the strongest bump wins, and no commits means nothing to release", () => {
  assert.equal(strongestBump(["fix: a", "feat: b", "docs: c"]), "minor");
  assert.equal(strongestBump(["feat: b", "fix: a"]), "minor");
  assert.equal(strongestBump(["fix: a", "feat!: b", "feat: c"]), "major");
  assert.equal(strongestBump(["chore: a"]), "patch");
  assert.equal(strongestBump([]), null);
});

test("bumps, with breaking changes moving the minor version before 1.0", () => {
  assert.equal(bumpVersion("0.3.4", "patch"), "0.3.5");
  assert.equal(bumpVersion("0.3.4", "minor"), "0.4.0");
  assert.equal(bumpVersion("0.3.4", "major"), "0.4.0");
  assert.equal(bumpVersion("1.3.4", "major"), "2.0.0");
  assert.equal(bumpVersion("1.3.4", "minor"), "1.4.0");
  assert.throws(() => bumpVersion("1.3", "patch"), /Not a version/);
  assert.throws(() => bumpVersion("1.3.0", "huge"), /Unknown bump/);
});

test("the next version comes from the last stable release and the commits since", () => {
  assert.equal(nextVersion(null, ["fix: a"]), FIRST_VERSION);
  assert.equal(nextVersion("v0.1.0", ["fix: a"]), "0.1.1");
  assert.equal(nextVersion("v0.1.0", ["feat: a"]), "0.2.0");
  assert.equal(nextVersion("v1.1.0", ["feat!: a"]), "2.0.0");
  assert.equal(nextVersion("v0.1.0", []), null);
});

test("prerelease versions carry the release they would become", () => {
  const now = new Date("2026-11-04T02:17:00Z");
  assert.equal(nightlyVersion("0.4.0", now, 17), "0.4.0-nightly.20261104.17");
  assert.equal(stagedVersion("0.4.0", "21"), "0.4.0-rc.21");
  assert.throws(() => nightlyVersion("0.4.0", now, "x"), /Not a run number/);
});

test("orders each kind of tag newest first, ignoring the others", () => {
  const tags = [
    "v0.2.0",
    "v0.10.0",
    "v0.9.1",
    "v0.3.0-nightly.20261103.9",
    "v0.3.0-nightly.20261104.2",
    "v0.3.0-nightly.20261103.12",
    "v0.3.0-rc.8",
    "v0.3.0-rc.31",
    "v1.2",
    "release-1",
  ];
  assert.deepEqual(stablesNewestFirst(tags), ["v0.10.0", "v0.9.1", "v0.2.0"]);
  assert.deepEqual(nightliesNewestFirst(tags), [
    "v0.3.0-nightly.20261104.2",
    "v0.3.0-nightly.20261103.12",
    "v0.3.0-nightly.20261103.9",
  ]);
  assert.deepEqual(stagedNewestFirst(tags), ["v0.3.0-rc.31", "v0.3.0-rc.8"]);
});
