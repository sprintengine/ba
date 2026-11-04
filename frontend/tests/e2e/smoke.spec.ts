import { expect, test } from "@playwright/test";

test("marketing home renders with nav and CTA", async ({ page }) => {
  await page.goto("/");
  // The headline's copy changes; that it is the booking pitch does not.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/booking/i);
  await expect(page.getByRole("link", { name: /get started|start for free/i }).first()).toBeVisible();
});

test("dev sign-in shows demo accounts", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("owner@bookanything.test")).toBeVisible();
  await expect(page.getByText("customer@bookanything.test")).toBeVisible();
});

test("protected routes redirect to sign-in with redirect_url", async ({ page }) => {
  await page.goto("/my/bookings");
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=%2Fmy%2Fbookings/);
});

test("design system kitchen sink renders", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.getByRole("heading", { name: "Design system" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "Calendar" })).toBeVisible();
});

test("site theme gallery renders every theme", async ({ page }) => {
  await page.goto("/dev/ui/sites");
  await expect(page.getByRole("heading", { name: "Site themes and sections" })).toBeVisible();
  for (const name of ["Clinical", "Calm", "Bold", "Playful", "Editorial", "Minimal"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await page.goto("/dev/ui/sites?theme=bold&mode=dark");
  await expect(page.locator('[data-theme="bold"][data-mode="dark"]')).toBeVisible();
});
