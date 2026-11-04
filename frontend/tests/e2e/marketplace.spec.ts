import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { OWNER, authHeader, requireLiveBackend, signInAs } from "./dashboard-helpers";

/**
 * Marketplace and deals against a live stack with the demo seed (architecture §18, §19):
 * a visitor finds a car wash in Cork with a deal and books a discounted time; an owner creates an offer that then shows
 * on /explore and in booking; a Free business sees the upgrade prompt for listing.
 */
test.describe.configure({ mode: "serial" });

type Biz = { id: string; slug: string };
type Svc = { id: string; name: string };

async function business(request: APIRequestContext, slug: string): Promise<Biz> {
  const res = await request.get(`/api/v1/public/businesses/${slug}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Biz;
}

async function service(request: APIRequestContext, b: Biz, name: string): Promise<Svc> {
  const services = (await (
    await request.get(`/api/v1/businesses/${b.id}/services`, { headers: authHeader(OWNER) })
  ).json()) as Svc[];
  return services.find((s) => s.name === name)!;
}

/** An always-on deal (every time of [serviceName]) created through the API; returns its id for clean-up. */
async function createDeal(
  request: APIRequestContext,
  b: Biz,
  serviceName: string,
  name: string,
  percent: number,
) {
  const s = await service(request, b, serviceName);
  const res = await request.post(`/api/v1/businesses/${b.id}/offers`, {
    headers: authHeader(OWNER),
    data: {
      name,
      description: null,
      serviceIds: [s.id],
      discount: { type: "percent", percent },
      schedule: { daysOfWeek: [], timeWindows: [], lastMinuteHours: null },
      validFrom: null,
      validUntil: null,
      maxRedemptions: null,
      active: true,
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function deleteOffersNamed(request: APIRequestContext, b: Biz, prefix: string) {
  const offers = (await (
    await request.get(`/api/v1/businesses/${b.id}/offers`, { headers: authHeader(OWNER) })
  ).json()) as { id: string; name: string }[];
  for (const o of offers.filter((x) => x.name.startsWith(prefix))) {
    await request.delete(`/api/v1/businesses/${b.id}/offers/${o.id}`, { headers: authHeader(OWNER) });
  }
}

/** The first discounted time in the booking flow (moving on a week at a time if needed). */
async function pickDiscountedSlot(page: Page) {
  const times = page.getByRole("group", { name: "Available times" });
  await expect(times).toBeVisible({ timeout: 20_000 });
  const discounted = times.getByRole("button").filter({ hasText: /% off/ }).first();
  await expect(discounted).toBeVisible({ timeout: 15_000 });
  await expect(discounted.locator("s, del, .line-through").first()).toBeVisible();
  await discounted.click();
}

test.beforeEach(async ({ page }, testInfo) => {
  await requireLiveBackend(page, testInfo);
});

test("a visitor finds a car wash in Cork with a deal and books a discounted time through dev checkout", async ({
  page,
  request,
}, testInfo) => {
  const gleam = await business(request, "gleam-car-wash");
  const prefix = `E2E visitor deal ${testInfo.project.name}`;
  await deleteOffersNamed(request, gleam, prefix);
  await createDeal(request, gleam, "Exterior wash", `${prefix} ${Date.now()}`, 25);
  try {
    await page.goto("/explore");
    await page
      .getByRole("group", { name: "Categories" })
      .getByRole("button", { name: /Car wash/ })
      .click();
    await page.getByRole("combobox", { name: "City" }).click();
    await page.getByRole("option", { name: /^Cork/ }).click();
    await expect(page).toHaveURL(/\/explore\/cork\/car-wash/, { timeout: 15_000 });

    const card = page.getByRole("article").filter({ hasText: "Gleam Car Wash" }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText("Deals")).toBeVisible();
    await card.getByRole("link", { name: /Gleam Car Wash/ }).click();
    // The business link: its booking portal (or its site, where business websites are on).
    await expect(page).toHaveURL(/\/gleam-car-wash(\/book)?$/, { timeout: 15_000 });

    await page.goto("/gleam-car-wash/book");
    await page
      .getByRole("button", { name: /Exterior wash/ })
      .filter({ visible: true })
      .first()
      .click();
    await pickDiscountedSlot(page);

    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
    await page.getByLabel(/Full name/).fill("Sam Visitor");
    await page.getByLabel(/^Email/).fill(`e2e+deal${Date.now()}@example.com`);
    await page.getByLabel(/^Phone/).fill("+353 87 555 0199");
    await page.getByLabel(/Vehicle registration/).fill("261-D-12345");
    await page
      .getByRole("button", { name: /^Review/ })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
    // Both device projects add an equal deal; the older one wins the tie, so match either.
    // Visible matches only: the portal's deals panel (above the flow, hidden from here on) names it too.
    await expect(
      page
        .getByText(/E2E visitor deal/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Continue to payment/ })
      .filter({ visible: true })
      .first()
      .click();

    await expect(page).toHaveURL(/\/dev\/checkout\//, { timeout: 15_000 });
    // Exterior wash is €15; 25% off → €11.25 at checkout.
    await expect(page.getByText(/11\.25/).first()).toBeVisible();
    await page.getByRole("button", { name: /^Pay / }).click();
    await expect(page).toHaveURL(/\/manage\/.+payment=succeeded/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /you're booked/i })).toBeVisible({ timeout: 15_000 });
  } finally {
    await deleteOffersNamed(request, gleam, prefix);
  }
});

test("an owner creates an offer and it appears on explore and in booking", async ({
  page,
  request,
}, testInfo) => {
  const lumen = await business(request, "lumen-physio");
  const prefix = `E2E owner offer ${testInfo.project.name}`;
  const name = `${prefix} ${Date.now()}`;
  try {
    await signInAs(page, OWNER);
    await page.goto("/dashboard/lumen-physio/offers");
    // Desktop and mobile: the page heading (the mobile sidebar is a drawer).
    await expect(page.getByRole("heading", { name: "Offers", level: 1 })).toBeVisible({ timeout: 20_000 });
    await page
      .getByRole("button", { name: /New offer/ })
      .first()
      .click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel(/^Name/).fill(name);
    await sheet.getByLabel(/Percentage off/).fill("30");
    // The live preview shows which times the deal covers before saving.
    await expect(sheet.getByText(/of \d+ times/)).toBeVisible({ timeout: 20_000 });
    await sheet.getByRole("button", { name: "Create offer" }).click();
    await expect(sheet).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(name).first()).toBeVisible();

    await page.goto("/explore?q=lumen");
    const card = page.getByRole("article").filter({ hasText: "Lumen Physiotherapy" }).first();
    await expect(card.getByText(/30% off/).first()).toBeVisible({ timeout: 20_000 });

    await page.goto("/lumen-physio/book");
    await page
      .getByRole("button", { name: /Follow-up treatment/ })
      .filter({ visible: true })
      .first()
      .click();
    // A business with a team asks for a therapist first: wait for that step or the times, as the journey helpers do.
    const anyone = page.getByRole("radio", { name: /^Any / });
    const times = page.getByRole("group", { name: "Available times" });
    await expect(anyone.or(times).first()).toBeVisible({ timeout: 20_000 });
    if (await anyone.isVisible()) await anyone.click();
    await expect(times).toBeVisible({ timeout: 20_000 });
    await expect(
      times
        .getByRole("button")
        .filter({ hasText: /30% off/ })
        .first(),
    ).toBeVisible();
  } finally {
    await deleteOffersNamed(request, lumen, prefix);
  }
});

test("a Free business sees the upgrade prompt for listing on the marketplace", async ({ page }) => {
  await signInAs(page, OWNER);
  await page.goto("/dashboard/cadence-music/settings/marketplace");
  await expect(page.getByText("Get found by new students with Pro")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: /See plans/ })).toBeVisible();
  await expect(page.getByRole("switch")).toBeDisabled();
});
