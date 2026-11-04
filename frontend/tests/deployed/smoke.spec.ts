import { expect, test } from "@playwright/test";

// What every deployed environment must do, checked after each deploy by the release train. Read-only.

test("the home page is the booking pitch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/booking/i);
});

test("pricing and explore render", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/explore");
  await expect(page.locator("main")).toBeVisible();
});

test("the API answers through the site", async ({ request }) => {
  const health = await request.get("/api/v1/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ status: "ok", database: "ok" });
});

test("AI assistants can discover the OAuth server on the site's origin", async ({ request, baseURL }) => {
  const metadata = await request.get("/.well-known/oauth-authorization-server");
  expect(metadata.ok()).toBe(true);
  expect((await metadata.json()) as { issuer: string }).toMatchObject({
    issuer: baseURL?.replace(/\/$/, ""),
  });
  const resource = await request.get("/.well-known/oauth-protected-resource");
  expect(resource.ok()).toBe(true);
});

test("the development pages are not deployed", async ({ request }) => {
  expect((await request.get("/dev/ui")).status()).toBe(404);
});
