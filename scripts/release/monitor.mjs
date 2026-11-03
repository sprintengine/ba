#!/usr/bin/env node
/**
 * Is production up and whole? .github/workflows/monitor.yml runs this every two hours (docs/releases.md, "The
 * production monitor").
 *
 *   node scripts/release/monitor.mjs check --api https://api.example.com --site https://example.com --json out.json
 *   node scripts/release/monitor.mjs issue out.json     # in Actions: open, comment on or close the monitor issue
 *
 * It checks the API's health (database included), that it runs a release, and the headers every API answer carries;
 * the website's home page and headers, the API through the website (the Worker's /api rewrite) and OAuth discovery
 * on the website's origin. Problems open the one "Production monitor: problem" issue (label `monitor`); a different
 * set of problems comments on it; the first clean run closes it.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const ISSUE_TITLE = "Production monitor: problem";
export const ISSUE_LABEL = "monitor";
const SIGNATURE = /<!-- production-monitor signature: ([^>]*?) -->/;
const USER_AGENT = "bookanything-production-monitor";

/** One request, retried once; never throws: a failure is a response with `error`. */
export async function fetchOnce(fetchImpl, url, init = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": USER_AGENT, ...init.headers },
      });
      return { status: response.status, headers: response.headers, body: await response.text() };
    } catch (error) {
      if (attempt >= 2) return { status: 0, headers: new Headers(), body: "", error: String(error.message ?? error) };
    }
  }
}

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Every check, as `{ code, ok, detail }`. `code` is stable: the issue's signature is made of the failing ones. */
export async function runChecks({ api, site, fetchImpl = fetch }) {
  const results = [];
  const add = (code, ok, detail) => results.push({ code, ok: Boolean(ok), detail });
  const describe = (r) => (r.error ? r.error : `HTTP ${r.status}`);

  const health = await fetchOnce(fetchImpl, `${api}/v1/health`);
  const body = parseJson(health.body);
  add(
    "api-health",
    health.status === 200 && body?.status === "ok" && body?.database === "ok",
    health.status === 200 ? `${health.body.slice(0, 200)}` : `${describe(health)} ${health.body.slice(0, 200)}`,
  );
  add("api-version", typeof body?.version === "string" && body.version !== "dev", `version ${body?.version ?? "unknown"}`);
  add(
    "api-no-store",
    /no-store/.test(health.headers.get("cache-control") ?? ""),
    `cache-control: ${health.headers.get("cache-control") ?? "none"}`,
  );
  add("api-request-id", Boolean(health.headers.get("x-request-id")), "every API answer carries X-Request-Id");

  if (site) {
    const home = await fetchOnce(fetchImpl, `${site}/`);
    add(
      "site-home",
      home.status === 200 && /text\/html/.test(home.headers.get("content-type") ?? "") && /<h1/i.test(home.body),
      describe(home),
    );
    add("site-powered-by", !home.headers.get("x-powered-by"), "no X-Powered-By header");
    const proxied = await fetchOnce(fetchImpl, `${site}/api/v1/health`);
    add("site-api", proxied.status === 200 && parseJson(proxied.body)?.status === "ok", `/api/v1/health: ${describe(proxied)}`);
    const discovery = await fetchOnce(fetchImpl, `${site}/.well-known/oauth-authorization-server`);
    add(
      "site-oauth-discovery",
      discovery.status === 200 && parseJson(discovery.body)?.issuer === site,
      `issuer ${parseJson(discovery.body)?.issuer ?? describe(discovery)}`,
    );
  }
  return { api, site: site || null, checkedAt: new Date().toISOString(), results };
}

export const problems = (result) => result.results.filter((r) => !r.ok);
export const signature = (result) => problems(result).map((r) => r.code).sort().join(",");

export function report(result) {
  const failing = problems(result);
  const lines = [
    `### Production monitor: ${failing.length ? `${failing.length} problem${failing.length > 1 ? "s" : ""}` : "all good"}`,
    "",
    "| Check | | Detail |",
    "| --- | --- | --- |",
    ...result.results.map((r) => `| ${r.code} | ${r.ok ? "ok" : "**problem**"} | ${String(r.detail).replace(/\|/g, "\\|").replace(/\n/g, " ")} |`),
    "",
  ];
  return lines.join("\n");
}

/** What to do with the monitor issue: open, comment, close or nothing. */
export function issueAction({ openIssue, lastSignature, current }) {
  if (!current) return openIssue ? "close" : "none";
  if (!openIssue) return "open";
  return current !== lastSignature ? "comment" : "none";
}

/** The newest signature in an issue's body and comments, oldest first. */
export function lastSignature(texts) {
  let last = null;
  for (const text of texts) {
    const match = SIGNATURE.exec(text ?? "");
    if (match) last = match[1];
  }
  return last;
}

export function issueText(result, runUrl) {
  return `${report(result)}\nRun: ${runUrl}\n\n<!-- production-monitor signature: ${signature(result)} -->\n`;
}

async function check(argv) {
  const arg = (name) => {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
  };
  const api = (arg("--api") ?? "").replace(/\/+$/, "");
  const site = (arg("--site") ?? "").replace(/\/+$/, "");
  if (!api) throw new Error("--api is required");
  const result = await runChecks({ api, site });
  const text = report(result);
  console.log(text);
  if (arg("--json")) writeFileSync(arg("--json"), `${JSON.stringify(result, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  return problems(result).length ? 1 : 0;
}

async function issue(file) {
  const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token, GITHUB_SERVER_URL: server, GITHUB_RUN_ID: runId } = process.env;
  const runUrl = `${server}/${repo}/actions/runs/${runId}`;
  let result;
  try {
    result = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // The check crashed before writing a result: that is a problem too.
    result = { results: [{ code: "monitor-crashed", ok: false, detail: "the check did not finish; see the run" }] };
  }
  const github = async (path, init = {}) => {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...init.headers },
    });
    if (!response.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  const open = (await github(`/issues?state=open&labels=${ISSUE_LABEL}&per_page=10`)).find((i) => i.title === ISSUE_TITLE);
  const comments = open ? await github(`/issues/${open.number}/comments?per_page=100`) : [];
  const action = issueAction({
    openIssue: open,
    lastSignature: open ? lastSignature([open.body, ...comments.map((c) => c.body)]) : null,
    current: signature(result),
  });
  const post = (path, body) => github(path, { method: "POST", body: JSON.stringify(body) });
  if (action === "open")
    await post("/issues", {
      title: ISSUE_TITLE,
      labels: [ISSUE_LABEL],
      body: `The production monitor found a problem. It comments when the problems change and closes this issue when every check passes again (docs/releases.md).\n\n${issueText(result, runUrl)}`,
    });
  if (action === "comment") await post(`/issues/${open.number}/comments`, { body: issueText(result, runUrl) });
  if (action === "close") {
    await post(`/issues/${open.number}/comments`, { body: `Every check passes again.\n\n${report(result)}\nRun: ${runUrl}\n` });
    await github(`/issues/${open.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
  }
  console.log(`monitor issue: ${action}`);
}

async function main([command, ...args]) {
  if (command === "check") return check(args);
  if (command === "issue") return issue(args[0]).then(() => 0);
  throw new Error("usage: monitor.mjs check --api URL [--site URL] [--json FILE] | issue FILE");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code ?? 0),
    (error) => {
      console.error(`::error::${error.message}`);
      process.exit(1);
    },
  );
}
