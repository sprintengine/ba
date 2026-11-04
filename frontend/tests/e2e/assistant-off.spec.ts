import { expect, test } from "@playwright/test";
import {
  authHeader,
  BO_SWITCHED_ON,
  requireLiveBackend,
  signInAs,
  waitForDashboard,
} from "./dashboard-helpers";
import { createSiteBusiness } from "./site-helpers";

/**
 * Bo switched off, the production default (`ASSISTANT_ENABLED` unset on the backend, `NEXT_PUBLIC_ASSISTANT_ENABLED`
 * unset for the build): no trace of it in the dashboard, its routes answer 404, and the public pages don't offer it.
 * Runs on its own against such a backend (`E2E_ASSISTANT=off`: CI's e2e job restarts its backend for it, locally
 * `scripts/e2e-stack.sh test-assistant-off`); the rest of the suite runs with Bo on.
 */
test.beforeEach(async ({ page }, testInfo) => {
  testInfo.skip(
    BO_SWITCHED_ON,
    "needs a backend with Bo off: E2E_ASSISTANT=off (scripts/e2e-stack.sh test-assistant-off)",
  );
  test.setTimeout(90_000);
  await requireLiveBackend(page, testInfo);
});

test("the dashboard has no Bo: no launcher, ⌘J or Ask Bo, and its routes aren't there", async ({
  page,
  request,
}) => {
  const { slug, id, owner } = await createSiteBusiness(request);
  const headers = authHeader(owner);
  expect((await (await request.get(`/api/v1/businesses/${id}`, { headers })).json()).assistantAvailable).toBe(
    false,
  );
  expect((await request.get(`/api/v1/businesses/${id}/assistant`, { headers })).status()).toBe(404);

  const asked: string[] = [];
  page.on("request", (r) => asked.push(new URL(r.url()).pathname));
  await signInAs(page, owner);
  await page.goto(`/dashboard/${slug}`);
  await waitForDashboard(page);
  await expect(page.getByRole("button", { name: /^Open Bo/ })).toHaveCount(0);

  // ⌘J first; then ⌘K, which loads after the page as Bo's panel would: once it's up, a panel would be too.
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("ControlOrMeta+k");
  const menu = page.getByRole("dialog");
  await expect(menu.getByRole("option", { name: /^New / })).toBeVisible({ timeout: 20_000 });
  await expect(menu).toHaveCount(1);
  await expect(menu.getByRole("option", { name: /Ask Bo/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Billing has no AI credits: nothing here uses them (no Bo, and business websites are off).
  await page.goto(`/dashboard/${slug}/settings/billing`);
  await expect(page.getByText("Current plan:")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^One monthly allowance for/)).toHaveCount(0);
  expect(asked.filter((p) => p.endsWith("/ai/usage"))).toEqual([]);
  expect(asked.filter((p) => /\/assistant(\/|$)/.test(p))).toEqual([]);
});

test("members' own AI apps are still offered in Settings", async ({ page, request }) => {
  const { slug, owner } = await createSiteBusiness(request);
  await signInAs(page, owner);
  await page.goto(`/dashboard/${slug}/settings/ai-agents`);
  await expect(page.getByRole("radio", { name: /Nobody/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Every agent is stopped.", { exact: true })).toBeVisible();
  await expect(page.getByText(/The assistant in the dashboard/)).toHaveCount(0);
});

test("the landing page offers connecting your own AI assistant, not Bo", async ({ page }) => {
  await page.goto("/");
  const connect = page.getByRole("link", { name: "How to connect your assistant" });
  await expect(connect).toHaveAttribute("href", "/help/ai-agents-for-business");
  await expect(page.getByRole("heading", { name: "Bring your own AI assistant" })).toHaveCount(1);
  await expect(page.locator("main")).not.toContainText(/\bBo\b/);
});
