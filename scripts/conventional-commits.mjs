#!/usr/bin/env node
// Every pull request's title, and every commit in it, is a Conventional Commit
// (https://www.conventionalcommits.org): `type(scope)!: summary`. Pull requests
// are merged with a merge commit, so every commit lands on main as written and
// the release train reads each one (scripts/release/version.mjs); the merge
// commits themselves ("Merge pull request #12 from ...", or main merged into a
// branch) are left alone. docs/engineering.md, "Commits, pull requests and
// versions".
//
//   node scripts/conventional-commits.mjs --title "feat(web): ..." --range origin/main..HEAD
//
// The pull request workflow (.github/workflows/pull-request.yml) runs this on
// every pull request; `npm run hooks:install` runs it on each local commit.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TYPES = ["feat", "fix", "perf", "refactor", "docs", "test", "build", "ci", "chore", "revert"];

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9][a-z0-9._/-]*)\))?(?<breaking>!)?: (?<summary>\S.*)$/;
export const MAX_LENGTH = 100;

/** The parts of a Conventional Commit header, or null when `subject` is not one. */
export function parse(subject) {
  const match = HEADER.exec(subject);
  if (!match || !TYPES.includes(match.groups.type)) return null;
  return { ...match.groups, breaking: Boolean(match.groups.breaking) };
}

/** Why `subject` is not a Conventional Commit header, or null if it is. */
export function problem(subject) {
  const match = HEADER.exec(subject);
  if (!match) return `expected "type(scope): summary", with type one of ${TYPES.join(", ")}`;
  if (!TYPES.includes(match.groups.type)) return `"${match.groups.type}" is not a type; use one of ${TYPES.join(", ")}`;
  if (subject.length > MAX_LENGTH) return `${subject.length} characters; keep it to ${MAX_LENGTH}`;
  if (/\.$/.test(match.groups.summary)) return "no full stop at the end";
  return null;
}

/** A commit message's first line (git's `fixup!` and `squash!` subjects then fail `problem`, as they should). */
export function subjectOf(message) {
  return message.split(/\r?\n/, 1)[0].trim();
}

/** The subjects of the commits in `range` that are not merges. */
function subjects(range) {
  const out = execFileSync("git", ["log", "--no-merges", "--format=%h %s", range], { encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(" ");
      return { sha: line.slice(0, space), subject: line.slice(space + 1) };
    });
}

export function main(argv, { log = console.log, error = console.error } = {}) {
  const arg = (name) => {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
  };
  const title = arg("--title");
  const range = arg("--range");
  const messageFile = arg("--message-file");
  if (title === undefined && range === undefined && messageFile === undefined) {
    error("usage: conventional-commits.mjs [--title TITLE] [--range BASE..HEAD] [--message-file FILE]");
    return 2;
  }
  const failures = [];
  if (title !== undefined) {
    const why = problem(title);
    if (why) failures.push(`pull request title "${title}": ${why}`);
  }
  if (range !== undefined) {
    for (const { sha, subject } of subjects(range)) {
      const why = problem(subject);
      if (why) failures.push(`commit ${sha} "${subject}": ${why}`);
    }
  }
  if (messageFile !== undefined) {
    // The commit-msg hook: git's own merge messages pass, as they do in a range.
    const subject = subjectOf(readFileSync(messageFile, "utf8"));
    const why = subject.startsWith("Merge ") ? null : problem(subject);
    if (why) failures.push(`commit message "${subject}": ${why}`);
  }
  for (const failure of failures) error(`::error::${failure}`);
  if (failures.length) {
    error(`\n${failures.length} not a Conventional Commit. See docs/engineering.md, "Commits, pull requests and versions".`);
    return 1;
  }
  log("Every title and commit is a Conventional Commit.");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
