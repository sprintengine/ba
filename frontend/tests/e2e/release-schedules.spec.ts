import { expect, test } from "@playwright/test";
import { authHeader, requireLiveBackend, signInAs } from "./dashboard-helpers";
import { createBusiness, flow } from "./journey-helpers";

/**
 * Release schedules (§21): a day stays closed to online booking until its release, the booking page says when it
 * opens, and the owner can open it early from Settings.
 */
test.beforeEach(async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await requireLiveBackend(page, testInfo);
});

test("a closed day says when it opens, and opening it early shows its times", async ({ page, request }) => {
  const shop = await createBusiness(request, "car_wash");
  const services = (await (
    await request.get(`/api/v1/businesses/${shop.id}/services`, { headers: authHeader(shop.owner) })
  ).json()) as { id: string; name: string }[];
  const wash = services.find((s) => s.name === "Exterior wash");
  expect(wash).toBeDefined();
  // Every day opens at 23:59 on the day itself: whenever the test runs, the days ahead are closed.
  const created = await request.post(`/api/v1/businesses/${shop.id}/release-schedules`, {
    headers: authHeader(shop.owner),
    data: {
      name: "Late release",
      serviceIds: [wash?.id],
      everyone: true,
      groupIds: [],
      cadence: "daily",
      time: "23:59",
      daysBefore: 0,
      weekdaysOnly: false,
      weekday: null,
      weeksAhead: null,
      active: true,
    },
  });
  expect(created.status(), await created.text()).toBe(201);

  // The customer lands on the first closed day, which says when it opens.
  await flow.open(page, shop.slug);
  await flow.service(page, /Exterior wash/);
  // (Nothing to pick a time from yet: a closed day shows neither "Any bay" nor times.)
  const opens = page.getByText(/^Opens (today|tomorrow|.+) at 23:59$/).first();
  await expect(opens).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("group", { name: "Available times" })).toHaveCount(0);
  const closedDay = await page.getByRole("heading", { level: 3 }).first().textContent();

  // The owner opens that day's release now from Settings.
  await signInAs(page, shop.owner);
  await page.goto(`/dashboard/${shop.slug}/settings/release-schedules`);
  await expect(page.getByText("Each day opens the same day at 23:59.")).toBeVisible({ timeout: 20_000 });
  const upcoming = page.getByRole("list", { name: "Upcoming releases" });
  await upcoming.getByRole("listitem").first().getByRole("button", { name: "Open now" }).click();
  await expect(page.getByText("Opened for booking")).toBeVisible();

  // Back on the booking page, the day has times.
  await flow.open(page, shop.slug);
  await flow.service(page, /Exterior wash/);
  await flow.anyResourceIfAsked(page);
  await expect(page.getByRole("heading", { level: 3, name: closedDay ?? "" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("group", { name: "Available times" })).toBeVisible();
});
