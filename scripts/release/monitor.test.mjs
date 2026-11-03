import assert from "node:assert/strict";
import { test } from "node:test";
import { issueAction, issueText, lastSignature, report, runChecks, signature } from "./monitor.mjs";

const API = "https://api.example.com";
const SITE = "https://example.com";
const healthy = { status: "ok", database: "ok", version: "0.4.0-nightly.20261104.17" };

/** A fake fetch: `routes` maps a URL to [status, body, headers]; anything else fails like a network error. */
function fakeFetch(routes) {
  return async (url) => {
    const route = routes[url];
    if (!route) throw new Error(`connect ECONNREFUSED ${url}`);
    const [status, body, headers = {}] = route;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  };
}

const allGood = {
  [`${API}/v1/health`]: [200, healthy, { "cache-control": "no-store", "x-request-id": "abc" }],
  [`${SITE}/`]: [200, "<html><h1>Online booking</h1></html>", { "content-type": "text/html; charset=utf-8" }],
  [`${SITE}/api/v1/health`]: [200, healthy],
  [`${SITE}/.well-known/oauth-authorization-server`]: [200, { issuer: SITE }],
};

test("a healthy production passes every check", async () => {
  const result = await runChecks({ api: API, site: SITE, fetchImpl: fakeFetch(allGood) });
  assert.deepEqual(result.results.filter((r) => !r.ok), []);
  assert.equal(signature(result), "");
  assert.match(report(result), /all good/);
});

test("each problem is named by a stable code", async () => {
  const result = await runChecks({
    api: API,
    site: SITE,
    fetchImpl: fakeFetch({
      ...allGood,
      [`${API}/v1/health`]: [503, { status: "degraded", database: "unavailable", version: "dev" }, {}],
      [`${SITE}/`]: [200, "<html></html>", { "content-type": "text/html", "x-powered-by": "Next.js" }],
      [`${SITE}/.well-known/oauth-authorization-server`]: [200, { issuer: "https://other.example.com" }],
    }),
  });
  assert.equal(signature(result), "api-health,api-no-store,api-request-id,api-version,site-home,site-oauth-discovery,site-powered-by");
  assert.match(report(result), /\| api-health \| \*\*problem\*\* \| HTTP 503/);
});

test("an unreachable API is a problem, not a crash, and the website is optional", async () => {
  const result = await runChecks({ api: API, site: "", fetchImpl: fakeFetch({}) });
  assert.equal(result.site, null);
  assert.equal(signature(result), "api-health,api-no-store,api-request-id,api-version");
  assert.match(result.results[0].detail, /ECONNREFUSED/);
});

test("the issue opens, comments when the problems change, and closes when they are gone", () => {
  assert.equal(issueAction({ openIssue: null, current: "" }), "none");
  assert.equal(issueAction({ openIssue: null, current: "api-health" }), "open");
  assert.equal(issueAction({ openIssue: { number: 1 }, lastSignature: "api-health", current: "api-health" }), "none");
  assert.equal(issueAction({ openIssue: { number: 1 }, lastSignature: "api-health", current: "api-health,site-home" }), "comment");
  assert.equal(issueAction({ openIssue: { number: 1 }, lastSignature: "api-health", current: "" }), "close");
});

test("the signature travels in the issue text and the newest one wins", () => {
  const text = issueText({ results: [{ code: "site-home", ok: false, detail: "HTTP 500" }] }, "https://github.com/run/1");
  assert.match(text, /<!-- production-monitor signature: site-home -->/);
  assert.equal(lastSignature(["intro <!-- production-monitor signature: api-health -->", "a human comment", text]), "site-home");
  assert.equal(lastSignature(["nothing here", null]), null);
});
