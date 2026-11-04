// SemVer from Conventional Commits (docs/engineering.md §14, docs/releases.md). Pure: the release train
// (scripts/release/release.mjs) reads the tags and the commit messages from git and asks these.
import { parse } from "../conventional-commits.mjs";

export const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
/** v0.4.0-nightly.20261104.17: a nightly of main, built and accepted, carrying the version it would release as. */
export const NIGHTLY_TAG = /^v(\d+\.\d+\.\d+)-nightly\.(\d{8})\.(\d+)$/;
/** v0.4.0-rc.21: a nightly that passed staging (21 is the release workflow's run number). */
export const STAGED_TAG = /^v(\d+\.\d+\.\d+)-rc\.(\d+)$/;

/** The first release, when there is none to bump from. */
export const FIRST_VERSION = "0.1.0";

export function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Not a version: ${version}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * The bump one commit asks for; a message that is not conventional (history from before the convention), a patch.
 * Merge commits are left out by the caller (`git log --no-merges`), as the pull request check leaves them out.
 */
export function commitBump(message) {
  const header = parse(message.split(/\r?\n/, 1)[0]);
  if (header?.breaking || /^BREAKING[ -]CHANGE: \S/m.test(message)) return "major";
  return header?.type === "feat" ? "minor" : "patch";
}

/** The strongest bump among `messages`, or null when there are none (nothing to release). */
export function strongestBump(messages) {
  let strongest = null;
  for (const message of messages) {
    const bump = commitBump(message);
    if (bump === "major") return "major";
    if (bump === "minor" || strongest === null) strongest = bump;
  }
  return strongest;
}

/**
 * Before 1.0 nothing is promised, so a breaking change moves the minor version: 1.0.0 is never derived, only chosen
 * (by tagging it, docs/releases.md).
 */
export function bumpVersion(version, bump) {
  const { major, minor, patch } = parseVersion(version);
  if (bump === "major") return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump: ${bump}`);
}

/**
 * The version a commit would be released as: the last stable release's, bumped by the strongest of the non-merge
 * commits since. No stable release yet: FIRST_VERSION. No commits since the last release: null, nothing to release.
 */
export function nextVersion(lastStableTag, messagesSince) {
  if (!lastStableTag) return FIRST_VERSION;
  const bump = strongestBump(messagesSince);
  return bump ? bumpVersion(lastStableTag.slice(1), bump) : null;
}

/** 20261104, in UTC: the date a run starts is the date it is named for. */
export function dateStamp(now) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
}

const runNumber = (run) => {
  if (!/^\d+$/.test(String(run))) throw new Error(`Not a run number: ${run}`);
  return Number(run);
};

export const nightlyVersion = (version, now, run) => `${version}-nightly.${dateStamp(now)}.${runNumber(run)}`;

/** Named for the run, not a counter: a staging that fails leaves no tag, and a counter would hand its number on. */
export const stagedVersion = (version, run) => `${version}-rc.${runNumber(run)}`;

const compareCore = (a, b) => {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
};

/** Stable tags, newest version first. */
export function stablesNewestFirst(tags) {
  return tags.filter((tag) => STABLE_TAG.test(tag)).sort((a, b) => compareCore(b.slice(1), a.slice(1)));
}

/** Nightly tags, newest first (by date, then run). */
export function nightliesNewestFirst(tags) {
  const key = (tag) => {
    const [, , date, run] = NIGHTLY_TAG.exec(tag);
    return Number(date) * 1e7 + Number(run);
  };
  return tags.filter((tag) => NIGHTLY_TAG.test(tag)).sort((a, b) => key(b) - key(a));
}

/** Staged candidates, newest first (run numbers only grow). */
export function stagedNewestFirst(tags) {
  const run = (tag) => Number(STAGED_TAG.exec(tag)[2]);
  return tags.filter((tag) => STAGED_TAG.test(tag)).sort((a, b) => run(b) - run(a));
}
