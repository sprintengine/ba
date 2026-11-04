import { expect, test } from "@playwright/test";
import { requireLiveBackend, signInAs } from "./dashboard-helpers";
import { createSiteBusiness, TINY_PNG } from "./site-helpers";

test.beforeEach(async ({ page }, testInfo) => {
  await requireLiveBackend(page, testInfo);
});

test("owner uploads a logo and it appears on the booking page", async ({ page, request }) => {
  const { slug, owner } = await createSiteBusiness(request);
  await signInAs(page, owner);
  await page.goto(`/dashboard/${slug}/settings/branding`);
  await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible({ timeout: 20_000 });

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: TINY_PNG });
  const url = page.getByRole("textbox", { name: "Logo image address" });
  await expect(url).toHaveValue(/\/api\/v1\/public\/uploads\/[0-9a-f-]+\/[0-9a-f-]+\.png$/, {
    timeout: 20_000,
  });
  const logoUrl = await url.inputValue();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0, { timeout: 15_000 });

  // The file is served with safe headers.
  const served = await request.get(logoUrl);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");

  await page.goto(`/${slug}`);
  await expect(page.locator(`header img[src="${logoUrl}"]`).first()).toBeVisible();
});

test("wrong file types are refused before uploading", async ({ page, request }) => {
  const { slug, owner } = await createSiteBusiness(request);
  await signInAs(page, owner);
  await page.goto(`/dashboard/${slug}/settings/branding`);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "logo.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(page.getByRole("alert").filter({ hasText: "Use a PNG, JPEG or WebP image." })).toBeVisible();
});
