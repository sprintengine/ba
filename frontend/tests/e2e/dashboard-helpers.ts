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
