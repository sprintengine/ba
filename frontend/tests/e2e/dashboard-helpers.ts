import { expect, type Page, type TestInfo } from "@playwright/test";

/** Dev-auth identities seeded by the backend (`seed-demo`). */
export const OWNER = { sub: "dev_owner", email: "owner@bookanything.test", name: "Avery Morgan" };
export const STAFF = { sub: "dev_staff", email: "staff@bookanything.test", name: "Casey Lane" };
export const CUSTOMER = { sub: "dev_customer", email: "customer@bookanything.test", name: "Charlie Stone" };

const token = (id: typeof OWNER) => `dev.${Buffer.from(JSON.stringify(id)).toString("base64url")}`;

/** `Authorization` header for direct API calls as a dev identity. */
export const authHeader = (id: typeof OWNER) => ({ Authorization: `Bearer ${token(id)}` });

/**
 * Skip the test unless the frontend can reach a live backend with the demo
 * seed (these specs exercise real data, not mocks).
 */
export async function requireLiveBackend(page: Page, testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
  let ok = false;
  try {
    const res = await page.request.get(`${baseURL}/api/v1/health`, { timeout: 5000 });
    ok = res.ok();
  } catch {
    ok = false;
  }
  testInfo.skip(
    !ok,
    "Backend not reachable through /api — start it with the demo seed to run dashboard e2e tests.",
  );
}

/**
 * Whether this run's backend offers Bo: on unless `E2E_ASSISTANT=off`. The suite runs against a backend with
 * `ASSISTANT_ENABLED=true` (CI's e2e job and `scripts/e2e-stack.sh`); `assistant-off.spec.ts` runs on its own against
 * one with it off (`scripts/e2e-stack.sh test-assistant-off`).
 */
export const BO_SWITCHED_ON = process.env.E2E_ASSISTANT !== "off";

/**
 * Bo's specs: skipped in a run with Bo off, and failing loudly (not skipping) when the backend doesn't offer it in a
 * run that expects it, so a misconfigured stack can't pass them silently.
 */
export async function requireAssistant(page: Page, testInfo: TestInfo) {
  testInfo.skip(!BO_SWITCHED_ON, "Bo is switched off for this run (E2E_ASSISTANT=off).");
  const res = await page.request.get("/api/v1/businesses/lumen-physio", { headers: authHeader(OWNER) });
  expect(res.ok(), "needs the demo seed").toBe(true);
  expect(
    (await res.json()).assistantAvailable,
    "the backend doesn't offer Bo: start it with ASSISTANT_ENABLED=true and a model (AI_FAKE_SCRIPT=demo in development)",
  ).toBe(true);
}

/** Sign in with dev auth (the token lives in localStorage). */
export async function signInAs(page: Page, identity: typeof OWNER) {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    "bookanything.devAuth",
    token(identity),
  ] as const);
}

export async function waitForDashboard(page: Page) {
  await expect(page.getByRole("navigation", { name: "Dashboard" }).first()).toBeVisible({ timeout: 20_000 });
}
