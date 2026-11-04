#!/usr/bin/env node
/**
 * The release train's decisions, for .github/workflows/release.yml (docs/releases.md).
 *
 *   resolve                 channel, version, tag and commit for the run
 *   notes OUT               release notes: the commits since the last release of its kind, and what shipped
 *   record-staged OUT       staged.json: what staging tested, for a later promote
 *   verify-staged           the downloaded staged files are exactly what staging tested
 *   prune-nightlies [KEEP]  delete all but the newest KEEP nightly releases (their tags stay)
 *
 * Main feeds a nightly; a release stages what a nightly already built, and a promote puts what staging tested into
 * production. All three are tags on this repository, SemVer derived from the Conventional Commits since the last
 * stable release (scripts/release/version.mjs):
 *
 *   v0.4.0-nightly.20261104.17   a nightly of main's head, built and accepted
 *   v0.4.0-rc.21                 a nightly that passed staging: its commit, image digest and site builds, waiting for
 *                                someone to look at staging and promote it
 *   v0.4.0                       a release: the same commit, image digest and site build as the candidate it promoted
 *
 * Every decision is a pure function exported for release.test.mjs; the commands only read git, GitHub and the
 * environment.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse } from "../conventional-commits.mjs";
import {
  NIGHTLY_TAG,
  STAGED_TAG,
  nextVersion,
  nightliesNewestFirst,
  nightlyVersion,
  stablesNewestFirst,
  stagedNewestFirst,
  stagedVersion,
} from "./version.mjs";

/** The job in release.yml that stages a build; promote asks GitHub how it ended. */
export const STAGING_JOB = "Staging";
/** What every candidate carries. */
export const STAGED_FILES = ["images.json"];
/** The website's build per environment, carried when that environment's site was configured when the nightly built. */
export const SITE_FILES = { staging: "site-staging.tar.gz", production: "site-production.tar.gz" };

/**
 * Should a scheduled nightly build main's head? Nothing new since the last nightly: no. Main moved on from it: yes.
 * Main no longer contains it (history rewritten under the train) is refused, loudly, rather than quietly building a
 * commit that skips over what shipped.
 */
export function nightlyGate({ head, last, lastIsAncestor }) {
  if (!last) return { build: true, reason: "No nightly yet: building main's head." };
  if (last.commit === head)
    return { build: false, reason: `${last.tag} already built ${head.slice(0, 12)}; main has nothing new.` };
  if (!lastIsAncestor)
    throw new Error(
      `${last.tag} built ${last.commit.slice(0, 12)}, which main (${head.slice(0, 12)}) no longer contains. ` +
        "Main was rewritten under the nightly train; dispatch a nightly by hand once that is intended.",
    );
  return { build: true, reason: `Main has moved on from ${last.tag}.` };
}

/** The train runs from main only (an unset ref is a local run, which may do anything git lets it). */
export function mainOnly(ref) {
  if (ref && ref !== "refs/heads/main")
    throw new Error(`The release train runs from main, not ${ref}: run the workflow with "Use workflow from: main".`);
}

/** A commit is staged and released once: one already released is refused. */
export function stageCheck({ nightly, releasedAs }) {
  if (!nightly) throw new Error("There is no nightly to stage: run a nightly first.");
  if (releasedAs)
    throw new Error(`${nightly.tag}'s commit ${nightly.commit.slice(0, 12)} is already released as ${releasedAs}.`);
}

/**
 * Production only moves forward: what it runs must be an ancestor of what replaces it, so every change production has
 * is still in the candidate. Going back is a revert through the train (or an emergency retag, docs/releases.md),
 * never a promote of something older. No release yet: anything goes.
 */
export function aheadOfProduction({ candidate, production, containsProduction }) {
  if (!production) return;
  if (!containsProduction)
    throw new Error(
      `${candidate.tag} (${candidate.commit.slice(0, 12)}) does not contain ${production.tag} ` +
        `(${production.commit.slice(0, 12)}), which production runs: it is older, or from history rewritten since. ` +
        "Production only moves forward; ship a revert through the train to go back.",
    );
}

/** How the job that staged a candidate ended, as GitHub's jobs API reports it. */
export function stagingPassed(job) {
  return Boolean(job && job.status === "completed" && job.conclusion === "success");
}

/**
 * Whether a staged candidate may go to production. Refused: nothing staged; a record that does not match its tag; a
 * staging job that did not pass; a commit already released; a candidate behind production; and a website that would
 * go to production without its staging build ever having been deployed to staging.
 */
export function promoteCheck({ candidate, staged, stagingJob, releasedAs, production, containsProduction, siteConfigured }) {
  if (!candidate) throw new Error("Nothing has been staged: dispatch a release first.");
  if (!staged || staged.tag !== candidate.tag || staged.commit !== candidate.commit)
    throw new Error(
      `${candidate.tag}'s staged.json does not describe it (tag ${staged?.tag}, commit ${staged?.commit}); ` +
        `the tag is on ${candidate.commit.slice(0, 12)}.`,
    );
  if (!stagingJob) throw new Error(`${candidate.tag}: run ${staged.staging?.runId} has no ${STAGING_JOB} job to vouch for it.`);
  if (!stagingPassed(stagingJob))
    throw new Error(
      `${candidate.tag} did not pass staging: its ${STAGING_JOB} job in run ${staged.staging?.runId} is ` +
        `${stagingJob.status}${stagingJob.conclusion ? ` (${stagingJob.conclusion})` : ""}.`,
    );
  if (releasedAs)
    throw new Error(`${candidate.tag}'s commit ${candidate.commit.slice(0, 12)} is already released as ${releasedAs}.`);
  aheadOfProduction({ candidate, production, containsProduction });
  if (siteConfigured && !staged.staging?.siteDeployed)
    throw new Error(
      `${candidate.tag} was staged without deploying the website (Cloudflare or STAGING_APP_URL was not set up, or ` +
        "its nightly was built before), so nobody has looked at it on staging. Stage a nightly built since.",
    );
  if (siteConfigured && !staged.sha256?.[SITE_FILES.production])
    throw new Error(
      `${candidate.tag} has no production website build (${SITE_FILES.production}): its nightly ran before ` +
        "PRODUCTION_APP_URL was set. Stage a newer nightly.",
    );
}

/** staged.json: everything promote needs to put exactly this build in production. */
export function stagedRecord({ tag, version, nightlyTag, commit, images, sha256, runId, runAttempt, siteDeployed, siteUrl, at }) {
  if (!STAGED_TAG.test(tag)) throw new Error(`Not a staged tag: ${tag}`);
  if (images?.commit !== commit) throw new Error(`images.json is for ${images?.commit}, not ${commit}`);
  for (const [file, hash] of Object.entries(sha256 ?? {}))
    if (!/^[0-9a-f]{64}$/.test(hash ?? "")) throw new Error(`No sha256 for ${file}`);
  for (const file of STAGED_FILES) if (!sha256?.[file]) throw new Error(`No sha256 for ${file}`);
  return {
    schemaVersion: 1,
    tag,
    version,
    nightly: nightlyTag,
    commit,
    images: images.images,
    sha256,
    staging: {
      job: STAGING_JOB,
      runId: String(runId),
      runAttempt: Number(runAttempt || 1),
      siteDeployed: Boolean(siteDeployed),
      siteUrl: siteDeployed ? siteUrl || "" : "",
    },
    stagedAt: at,
  };
}

/** The files downloaded from a staged candidate are byte for byte what staging tested. */
export function verifyStaged({ staged, tag, ref, images, sha256 }) {
  const problems = [];
  if (staged.tag !== tag) problems.push(`staged.json is for ${staged.tag}, not ${tag}`);
  if (staged.commit !== ref) problems.push(`staged.json is for commit ${staged.commit}, not ${ref}`);
  if (images.commit !== ref) problems.push(`images.json is for commit ${images.commit}, not ${ref}`);
  for (const [file, hash] of Object.entries(staged.sha256 ?? {}))
    if (sha256[file] !== hash)
      problems.push(
        sha256[file]
          ? `${file} is not the file staging tested (sha256 ${sha256[file]}, staged ${hash})`
          : `${file} is missing, but staging recorded it`,
      );
  for (const [name, digest] of Object.entries(staged.images ?? {}))
    if (images.images?.[name] !== digest) problems.push(`the ${name} image is not the digest staging tested`);
  if (problems.length) throw new Error(`Refusing to promote ${tag}: ${problems.join("; ")}.`);
}

/** Release notes: what this is, the image, and the changes grouped by kind (merge commits are skipped by the caller). */
export function releaseNotes({ intro, images, previous, commits }) {
  const groups = { breaking: [], feat: [], fix: [], other: [] };
  for (const { subject, sha, body } of commits) {
    const header = parse(subject);
    const line = `- ${subject} (${sha})`;
    if (header?.breaking || /^BREAKING[ -]CHANGE: \S/m.test(body ?? "")) groups.breaking.push(line);
    else if (header?.type === "feat") groups.feat.push(line);
    else if (header?.type === "fix" || header?.type === "perf") groups.fix.push(line);
    else groups.other.push(line);
  }
  const lines = [];
  if (intro) lines.push(intro, "");
  if (images) lines.push("## Image", "", ...Object.entries(images).map(([name, ref]) => `- ${name}: \`${ref}\``), "");
  lines.push(previous ? `## Changes since ${previous}` : "## Changes", "");
  const sections = [
    ["Breaking changes", groups.breaking],
    ["Features", groups.feat],
    ["Fixes", groups.fix],
    ["Other", groups.other],
  ].filter(([, items]) => items.length);
  if (!sections.length) lines.push("- No changes.", "");
  for (const [title, items] of sections) lines.push(`### ${title}`, "", ...items, "");
  return lines.join("\n");
}

// --- git, GitHub and the environment ---------------------------------------------------------------------------

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const gitOk = (...args) => {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const commitOf = (tag) => git("rev-parse", `${tag}^{commit}`);
const allTags = () => git("tag", "--list", "v*").split("\n").filter(Boolean);
const isAncestor = (a, b) => gitOk("merge-base", "--is-ancestor", a, b);
const sha256Of = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

function output(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

/** The last stable release `commit` contains, and the version `commit` would be released as. */
function versionAt(commit, tags) {
  const last = stablesNewestFirst(tags).find((tag) => isAncestor(commitOf(tag), commit)) ?? null;
  const range = last ? `${last}..${commit}` : commit;
  // Merge commits ("Merge pull request #…") are the pull requests' wrappers: the commits inside them are the changes.
  const messages = git("log", "--no-merges", "--format=%B%x1e", range).split("\x1e").map((m) => m.trim()).filter(Boolean);
  return { last, version: nextVersion(last, messages) };
}

function resolve() {
  const env = process.env;
  const now = env.RELEASE_NOW ? new Date(env.RELEASE_NOW) : new Date();
  const channel = env.EVENT_NAME === "schedule" ? "nightly" : env.DISPATCH_CHANNEL || "nightly";
  // A run from another branch would build, stage or promote that branch's commit with that branch's train.
  mainOnly(env.GITHUB_REF);
  const tags = allTags();
  const released = stablesNewestFirst(tags);
  const production = released[0] ? { tag: released[0], commit: commitOf(released[0]) } : null;
  const releasedAs = (commit) => released.find((tag) => commitOf(tag) === commit);

  if (channel === "nightly") {
    const head = env.SHA || git("rev-parse", "HEAD");
    const [lastTag] = nightliesNewestFirst(tags);
    const last = lastTag ? { tag: lastTag, commit: commitOf(lastTag) } : null;
    let gate = { build: true, reason: "Dispatched by hand: the gate is skipped." };
    if (env.EVENT_NAME === "schedule")
      gate = nightlyGate({ head, last, lastIsAncestor: last ? isAncestor(last.commit, head) : false });
    const { last: stable, version } = versionAt(head, tags);
    if (!version) gate = { build: false, reason: `Nothing to release: main is ${stable}.` };
    console.error(gate.reason);
    const full = version ? nightlyVersion(version, now, env.RUN_NUMBER) : "";
    return output({
      should_build: gate.build,
      channel,
      version: full,
      tag: full ? `v${full}` : "",
      ref: head,
      previous_tag: lastTag ?? "",
      nightly_tag: "",
      staged_tag: "",
    });
  }

  if (channel === "release") {
    const wanted = (env.DISPATCH_NIGHTLY || "").trim();
    if (wanted && !NIGHTLY_TAG.test(wanted)) throw new Error(`Not a nightly tag: ${wanted}`);
    if (wanted && !tags.includes(wanted)) throw new Error(`No such nightly: ${wanted}`);
    const tag = wanted || nightliesNewestFirst(tags)[0];
    const nightly = tag ? { tag, commit: commitOf(tag) } : null;
    stageCheck({ nightly, releasedAs: nightly ? releasedAs(nightly.commit) : undefined });
    // Its files live on its release, which pruning removes from old nightlies (their tags stay).
    if (!releaseExists(nightly.tag))
      throw new Error(`${nightly.tag} has no release with its files any more (old nightlies are pruned): stage a newer one.`);
    // Refused now rather than at promote, after staging.
    aheadOfProduction({ candidate: nightly, production, containsProduction: !production || isAncestor(production.commit, nightly.commit) });
    const { version } = versionAt(nightly.commit, tags);
    const full = stagedVersion(version, env.RUN_NUMBER);
    console.error(`Staging ${nightly.tag} (${nightly.commit.slice(0, 12)}) as v${full}.`);
    return output({
      should_build: true,
      channel,
      version: full,
      tag: `v${full}`,
      ref: nightly.commit,
      previous_tag: released[0] ?? "",
      nightly_tag: nightly.tag,
      staged_tag: "",
    });
  }

  if (channel === "promote") {
    const wanted = (env.DISPATCH_STAGED || "").trim();
    if (wanted && !STAGED_TAG.test(wanted)) throw new Error(`Not a staged tag: ${wanted}`);
    if (wanted && !tags.includes(wanted)) throw new Error(`No such staged candidate: ${wanted}`);
    let chosen = null;
    if (wanted) chosen = describeStaged(wanted);
    else {
      // The newest candidate whose staging passed. A candidate only exists once its staging reached its last step, so
      // skipping one is rare, and said.
      const skipped = [];
      for (const tag of stagedNewestFirst(tags).slice(0, 10)) {
        const described = describeStaged(tag);
        if (stagingPassed(described.stagingJob)) {
          chosen = described;
          break;
        }
        skipped.push(tag);
        console.error(`Skipping ${tag}: ${described.error ?? "its staging job did not pass"}.`);
      }
      if (!chosen && skipped.length) throw new Error(`No staged candidate passed staging (tried ${skipped.join(", ")}).`);
    }
    if (chosen?.error) throw new Error(`${chosen.candidate.tag}: ${chosen.error}`);
    const candidate = chosen?.candidate ?? null;
    promoteCheck({
      candidate,
      staged: chosen?.staged,
      stagingJob: chosen?.stagingJob,
      releasedAs: candidate ? releasedAs(candidate.commit) : undefined,
      production,
      containsProduction: candidate ? !production || isAncestor(production.commit, candidate.commit) : false,
      siteConfigured: Boolean(env.PRODUCTION_SITE_CONFIGURED === "true"),
    });
    const { version } = versionAt(candidate.commit, tags);
    if (tags.includes(`v${version}`)) throw new Error(`v${version} already exists; it cannot be released again.`);
    console.error(`Promoting ${candidate.tag} (${candidate.commit.slice(0, 12)}, staged from ${chosen.staged.nightly}) as v${version}.`);
    return output({
      should_build: true,
      channel,
      version,
      tag: `v${version}`,
      ref: candidate.commit,
      previous_tag: released[0] ?? "",
      nightly_tag: chosen.staged.nightly ?? "",
      staged_tag: candidate.tag,
    });
  }
  throw new Error(`Unknown channel: ${channel}`);
}

function releaseExists(tag) {
  try {
    gh("release", "view", tag, "--repo", process.env.GITHUB_REPOSITORY, "--json", "tagName");
    return true;
  } catch {
    return false;
  }
}

/** A candidate, its staged.json and its staging job, or the reason one is missing. */
function describeStaged(tag) {
  const candidate = { tag, commit: commitOf(tag) };
  const repo = process.env.GITHUB_REPOSITORY;
  let staged;
  try {
    staged = JSON.parse(gh("release", "download", tag, "--repo", repo, "-p", "staged.json", "-O", "-"));
  } catch (error) {
    return { candidate, error: `no readable staged.json on its release (${String(error.message).split("\n")[0]})` };
  }
  const { runId, runAttempt } = staged.staging ?? {};
  if (!/^\d+$/.test(String(runId ?? ""))) return { candidate, staged, error: "its staged.json names no staging run" };
  let jobs;
  try {
    jobs = JSON.parse(gh("api", `repos/${repo}/actions/runs/${runId}/attempts/${Number(runAttempt) || 1}/jobs?per_page=100`)).jobs;
  } catch (error) {
    return { candidate, staged, error: `could not read staging run ${runId} (${String(error.message).split("\n")[0]})` };
  }
  return { candidate, staged, stagingJob: jobs.find((job) => job.name === STAGING_JOB) };
}

function notes(out) {
  const { REF: ref, PREVIOUS_TAG: previous, NIGHTLY_TAG: nightly, STAGED_TAG: staged, IMAGES_JSON: imagesFile } = process.env;
  const range = previous ? `${previous}..${ref}` : ref;
  const limit = previous ? [] : ["-n", "50"];
  const commits = git("log", "--no-merges", "--format=%h%x00%s%x00%b%x1e", ...limit, range)
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, subject, body] = entry.split("\0");
      return { sha, subject, body };
    });
  let intro = "";
  if (staged)
    intro = `Promotes ${staged}${nightly ? `, staged from ${nightly}` : ""}: the same commit, image digest and website build staging tested.`;
  else if (nightly)
    intro = `Stages ${nightly}: the same commit and image digest, deployed to staging. Look at staging, then promote.`;
  const images = imagesFile && existsSync(imagesFile) ? readJson(imagesFile).images : null;
  const text = releaseNotes({ intro, images, previous, commits });
  writeFileSync(out, text);
  console.log(text);
}

const filesHere = () => Object.fromEntries([...STAGED_FILES, ...Object.values(SITE_FILES)].filter(existsSync).map((f) => [f, sha256Of(f)]));

/** Run beside images.json and the site builds, at the end of a staging that passed. */
function recordStaged(out) {
  const env = process.env;
  const record = stagedRecord({
    tag: env.TAG,
    version: env.VERSION,
    nightlyTag: env.NIGHTLY_TAG,
    commit: env.REF,
    images: readJson("images.json"),
    sha256: filesHere(),
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    siteDeployed: env.SITE_DEPLOYED === "true",
    siteUrl: env.SITE_URL,
    at: new Date().toISOString(),
  });
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record, null, 2));
}

function verifyStagedHere() {
  const env = process.env;
  verifyStaged({ staged: readJson("staged.json"), tag: env.STAGED_TAG, ref: env.REF, images: readJson("images.json"), sha256: filesHere() });
  console.log(`The files are byte for byte what ${env.STAGED_TAG} staged.`);
}

async function pruneNightlies(keep) {
  const { GITHUB_REPOSITORY: repo, GH_TOKEN: token } = process.env;
  const api = (path, init = {}) =>
    fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
  const releases = [];
  for (let page = 1; ; page += 1) {
    const response = await api(`/releases?per_page=100&page=${page}`);
    if (!response.ok) throw new Error(`Listing releases: ${response.status}`);
    const batch = await response.json();
    releases.push(...batch.filter((r) => NIGHTLY_TAG.test(r.tag_name) && !r.draft));
    if (batch.length < 100) break;
  }
  for (const tag of nightliesNewestFirst(releases.map((r) => r.tag_name)).slice(keep)) {
    const release = releases.find((r) => r.tag_name === tag);
    const deleted = await api(`/releases/${release.id}`, { method: "DELETE" });
    console.log(`${deleted.ok ? "Deleted" : "Could not delete"} the ${tag} release (its tag stays).`);
  }
}

async function main([command, ...args]) {
  if (command === "resolve") return resolve();
  if (command === "notes") return notes(args[0] ?? "release-notes.md");
  if (command === "record-staged") return recordStaged(args[0] ?? "staged.json");
  if (command === "verify-staged") return verifyStagedHere();
  if (command === "prune-nightlies") return pruneNightlies(Number(args[0] ?? 14));
  throw new Error("usage: release.mjs resolve | notes OUT | record-staged OUT | verify-staged | prune-nightlies [KEEP]");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
