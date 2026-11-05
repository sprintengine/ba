import { expect, test } from "@playwright/test";
import { OWNER, requireLiveBackend, signInAs, waitForDashboard } from "./dashboard-helpers";

test.describe("dashboard (owner)", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop flow");

  test.beforeEach(async ({ page }, testInfo) => {
    await requireLiveBackend(page, testInfo);
    await signInAs(page, OWNER);
  });

  test("creates a booking for a new customer, then cancels it from the drawer", async ({ page }) => {
    const name = `Rowan Example ${Date.now().toString(36)}`;
    await page.goto("/dashboard/gleam-car-wash/bookings");
    await waitForDashboard(page);

    await page
      .getByRole("button", { name: /new booking/i })
      .first()
      .click();
    const sheet = page.getByRole("dialog", { name: /new booking/i });
    await expect(sheet).toBeVisible();

    // Service without options keeps the flow short.
    await sheet.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /exterior wash/i }).click();

    // First free time within the next week.
    const nextAvailable = sheet.getByRole("button", { name: /next available/i });
    const slots = sheet.getByRole("radiogroup", { name: /times$/i }).getByRole("radio");
    await expect(slots.first().or(nextAvailable)).toBeVisible({ timeout: 15_000 });
    if (await nextAvailable.isVisible()) await nextAvailable.click();
    await slots.first().click();

    // New customer inline.
    await sheet.getByRole("combobox", { name: /find a/i }).click();
    await page.getByRole("button", { name: /new customer/i }).click();
    await sheet.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await sheet.getByRole("textbox", { name: /^Email/ }).fill(`${Date.now()}@example.test`);
    await sheet.getByRole("switch", { name: /email the customer/i }).click();

    await sheet.getByRole("button", { name: /create booking/i }).click();
    await expect(page.getByText(/booking created/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "View" }).click();

    const drawer = page.getByRole("dialog").filter({ hasText: name });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Confirmed").first()).toBeVisible();

    await drawer.getByRole("button", { name: /cancel booking/i }).click();
    const confirm = page.getByRole("dialog", { name: /cancel this booking/i });
    await confirm.getByRole("switch").click();
    await confirm.getByRole("button", { name: /^cancel booking$/i }).click();
    await expect(page.getByText(/booking cancelled/i)).toBeVisible({ timeout: 15_000 });
    await expect(drawer.getByText("Cancelled").first()).toBeVisible();
  });

  test("calendar shows one column per resource and supports keyboard navigation", async ({ page }) => {
    await page.goto("/dashboard/lumen-physio/calendar?resource=everything");
    await waitForDashboard(page);
    await expect(page.getByRole("group", { name: /treatment room 1/i })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("w");
    await expect(page).toHaveURL(/view=week/);
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/date=/);
    await page.keyboard.press("t");
    await page.keyboard.press("d");
    await expect(page).not.toHaveURL(/view=week/);
  });
});
