import { expect, test } from "@playwright/test";
import { STAFF, requireLiveBackend, signInAs, waitForDashboard } from "./dashboard-helpers";
import { addMember, createBusiness, newIdentity } from "./journey-helpers";

test.describe("dashboard (staff scoping)", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop flow");

  test.beforeEach(async ({ page }, testInfo) => {
    await requireLiveBackend(page, testInfo);
    await signInAs(page, STAFF);
  });

  test("staff see only their own calendar and no admin areas", async ({ page }) => {
    await page.goto("/dashboard/lumen-physio/calendar");
    await waitForDashboard(page);
    const nav = page.getByRole("navigation", { name: "Dashboard" }).first();
    await expect(nav.getByRole("link", { name: "Calendar" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Reports" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);

    // Exactly one resource column: the one linked to this staff member.
    await expect(page.getByRole("group", { name: /casey lane/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("group", { name: /treatment room/i })).toHaveCount(0);
  });

  test("staff can view their hours but not add resources or services", async ({ page }) => {
    await page.goto("/dashboard/lumen-physio/resources");
    await waitForDashboard(page);
    await expect(page.getByRole("heading", { name: "Regular hours" })).toBeVisible({ timeout: 15_000 });
    // Staff can edit their own hours, but can't add or edit resources themselves.
    await expect(page.getByRole("button", { name: /add person or room/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^edit$/i })).toHaveCount(0);

    await page.goto("/dashboard/lumen-physio/services");
    await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
    await expect(page.getByRole("button", { name: /new service/i })).toHaveCount(0);
  });

  // A business of its own: on the shared demo calendar, the first free slot is the one other specs book too.
  test("staff can book on their own calendar and cancel it", async ({ page, request }) => {
    const clinic = await createBusiness(request, "physio");
    const therapist = newIdentity("staff", "Quinn Therapist");
    await addMember(request, clinic, therapist, "staff", "Sam Rivers");
    await signInAs(page, therapist);

    await page.goto(`/dashboard/${clinic.slug}/calendar`);
    await waitForDashboard(page);
    await expect(page.getByRole("group", { name: /sam rivers/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("group", { name: /robin ashby/i })).toHaveCount(0);
    await page.keyboard.press("n");
    const sheet = page.getByRole("dialog", { name: /^new /i });
    await sheet.getByRole("button", { name: /follow-up/i }).click();
    const next = sheet.getByRole("button", { name: /next available/i });
    const slots = sheet.getByRole("radiogroup", { name: /times$/i }).getByRole("radio");
    await expect(slots.first().or(next)).toBeVisible({ timeout: 15_000 });
    if (await next.isVisible()) await next.click();
    await slots.first().click();
    await sheet.getByRole("combobox", { name: /find a/i }).click();
    await page.getByRole("button", { name: /^new /i }).click();
    const name = `Quinn Example ${Date.now().toString(36)}`;
    await sheet.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await sheet.getByRole("button", { name: /^payment/i }).click();
    await sheet.getByRole("switch", { name: /^email the/i }).click();
    await sheet.getByRole("button", { name: /^create /i }).click();
    await expect(page.getByText(/created/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "View" }).click();
    const drawer = page.getByRole("dialog").filter({ hasText: name });
    await expect(drawer.getByText("Sam Rivers").first()).toBeVisible();
    await drawer.getByRole("button", { name: /^cancel /i }).click();
    const confirm = page.getByRole("dialog", { name: /^cancel this/i });
    await confirm.getByRole("switch").click();
    await confirm
      .getByRole("button", { name: /^cancel /i })
      .last()
      .click();
    await expect(drawer.getByText("Cancelled").first()).toBeVisible({ timeout: 15_000 });
  });

  test("staff cannot reach the site editor", async ({ page }) => {
    await page.goto("/dashboard/lumen-physio/calendar");
    await waitForDashboard(page);
    const nav = page.getByRole("navigation", { name: "Dashboard" }).first();
    await expect(nav.getByRole("link", { name: "Site", exact: true })).toHaveCount(0);
    await page.goto("/dashboard/lumen-physio/site");
    // Business websites are off (SITES_ENABLED): the page points to Branding instead.
    await expect(page.getByText("Your booking page is set up in Branding")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
  });

  test("settings explain they are for admins", async ({ page }) => {
    await page.goto("/dashboard/lumen-physio/settings/general");
    await expect(page.getByText(/settings are for admins/i)).toBeVisible({ timeout: 20_000 });
  });
});
