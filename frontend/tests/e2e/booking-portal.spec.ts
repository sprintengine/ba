import { expect, test } from "@playwright/test";
import { requireLiveBackend, signInAs } from "./dashboard-helpers";
import { createSiteBusiness } from "./site-helpers";

/**
 * The production default: no business websites (`SITES_ENABLED` off). `/[slug]` is the booking portal, and its look is
 * the business's colour, logo, cover and style preset, chosen in Settings → Branding.
 */
test.beforeEach(async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await requireLiveBackend(page, testInfo);
});

test("the business link opens the booking portal, with the clinic's deal above the services", async ({
  page,
}) => {
  await page.goto("/lumen-physio?utm_source=e2e");
  await expect(page).toHaveURL(/\/lumen-physio\/book\?utm_source=e2e$/);
  await expect(page.getByRole("heading", { name: "Choose a service" })).toBeVisible({ timeout: 20_000 });
  const deals = page.getByRole("region", { name: /^Current deals?$/ });
  await expect(deals.getByText("Last-minute physio")).toBeVisible();
  await expect(deals.getByText("€15 off")).toBeVisible();
});

test("owner picks a booking page style in Branding and the portal follows; there is no site builder", async ({
  page,
  request,
}) => {
  const { slug, owner } = await createSiteBusiness(request);
  await page.goto(`/${slug}/book`);
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-theme", "calm", {
    timeout: 20_000,
  });

  await signInAs(page, owner);
  await page.goto(`/dashboard/${slug}/settings/branding`);
  const styles = page.getByRole("radiogroup", { name: "Booking page style" });
  await expect(styles.getByRole("radio", { name: /^Calm/ })).toHaveAttribute("aria-checked", "true", {
    timeout: 20_000,
  });
  await styles.getByRole("radio", { name: /^Bold/ }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0, { timeout: 15_000 });

  const nav = page.getByRole("navigation", { name: "Dashboard" }).first();
  await expect(nav.getByRole("link", { name: "Site", exact: true })).toHaveCount(0);

  await page.goto(`/${slug}/book`);
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-theme", "bold", {
    timeout: 20_000,
  });
});
