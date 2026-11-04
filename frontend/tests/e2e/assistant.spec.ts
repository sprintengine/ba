import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  authHeader,
  OWNER,
  requireAssistant,
  requireLiveBackend,
  signInAs,
  STAFF,
} from "./dashboard-helpers";
import { createSiteBusiness, type Identity } from "./site-helpers";

/**
 * Bo against a live stack with Bo switched on (`ASSISTANT_ENABLED=true`; off is `assistant-off.spec.ts`). The
 * conversation specs need the backend's scripted fake model (`AI_FAKE_SCRIPT=demo`, development only) and skip
 * otherwise. Each spec uses a throwaway business except the staff one (the demo seed's staff member).
 */
test.beforeEach(async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await requireLiveBackend(page, testInfo);
  await requireAssistant(page, testInfo);
});

async function usesFakeModel(request: APIRequestContext, businessId: string, owner: Identity) {
  const res = await request.get(`/api/v1/businesses/${businessId}/ai/usage`, { headers: authHeader(owner) });
  return (await res.json()).model?.name === "fake-scripted";
}

async function openBo(page: Page, slug: string, who: Identity) {
  await signInAs(page, who);
  await page.goto(`/dashboard/${slug}`);
  await page.getByRole("button", { name: /^Open Bo/ }).click({ timeout: 30_000 });
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("img", { name: /^Bo, / })).toBeVisible();
  return panel;
}

async function ask(panel: ReturnType<Page["getByRole"]>, text: string) {
  const box = panel.getByRole("textbox", { name: "Message Bo" });
  await box.fill(text);
  await box.press("Enter");
}

test("owner opens Bo and sees quick actions, with no site to publish", async ({ page, request }) => {
  const { slug, owner } = await createSiteBusiness(request);
  await signInAs(page, owner);
  await page.goto(`/dashboard/${slug}`);
  const launcher = page.getByRole("button", { name: /^Open Bo/ });
  await expect(launcher).toBeVisible({ timeout: 30_000 });
  await launcher.click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("list", { name: "Quick actions" })).toBeVisible();
  // Business websites are off (SITES_ENABLED): nothing to publish.
  await expect(panel.getByText("Your site isn't published yet")).toHaveCount(0);
});

test("owner asks Bo to book someone in, confirms, and the calendar shows it", async ({ page, request }) => {
  const { slug, id, owner } = await createSiteBusiness(request);
  test.skip(!(await usesFakeModel(request, id, owner)), "needs a backend with AI_FAKE_SCRIPT=demo");
  const panel = await openBo(page, slug, owner);
  await ask(panel, "Can you book someone in for me?");
  const card = panel.getByRole("region", { name: /^New / });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("Needs your OK")).toBeVisible();
  await expect(card.getByText("Robin Example (new)")).toBeVisible();
  await card.getByRole("button", { name: "Book it" }).click();
  await expect(card.getByText("Done")).toBeVisible();
  await expect(card.getByText(/Booked .* for Robin Example/)).toBeVisible();
  await card.getByRole("link", { name: "Open calendar" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${slug}/calendar\\?date=`));
  await expect(page.getByText("Robin Example").first()).toBeVisible({ timeout: 20_000 });
});

test("Bo says so when the month's AI credits are used up", async ({ page, request }) => {
  const { slug, id, owner } = await createSiteBusiness(request);
  test.skip(!(await usesFakeModel(request, id, owner)), "needs a backend with AI_FAKE_SCRIPT=demo");
  const panel = await openBo(page, slug, owner);
  await ask(panel, "Please use lots of credits");
  await expect(panel.getByText("Done. That was an expensive one.")).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText("0 AI credits left")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Message Bo" })).toBeDisabled();
  await expect(panel.getByRole("textbox", { name: "Message Bo" })).toHaveAttribute(
    "placeholder",
    "Out of AI credits this month",
  );
  // The usage page agrees.
  await page.goto(`/dashboard/${slug}/settings/billing`);
  await expect(
    page.getByRole("status").filter({ hasText: "This month's AI credits are used up." }),
  ).toBeVisible({ timeout: 20_000 });
});

test("staff only see their own calendar through Bo", async ({ page, request }) => {
  const me = await (await request.get("/api/v1/me", { headers: authHeader(OWNER) })).json();
  const lumen = me.memberships.find((m: { slug: string }) => m.slug === "lumen-physio");
  test.skip(
    !lumen || !(await usesFakeModel(request, lumen.businessId, OWNER)),
    "needs the demo seed and AI_FAKE_SCRIPT=demo",
  );
  const panel = await openBo(page, "lumen-physio", STAFF);
  await ask(panel, "What's on this week?");
  const answer = panel.getByRole("log").getByText(/^This week you have \d+ bookings/);
  await expect(answer).toBeVisible({ timeout: 30_000 });
  await expect(answer).toContainText("Casey Lane");
  await expect(answer).not.toContainText("Sam Rivers");
});

test("the AI credits meter is in Settings → Billing", async ({ page, request }) => {
  const { slug, owner } = await createSiteBusiness(request);
  await signInAs(page, owner);
  await page.goto(`/dashboard/${slug}/settings/billing`);
  const meter = page.getByRole("meter", { name: "AI credits this month" });
  await expect(meter).toBeVisible({ timeout: 30_000 });
  // Nothing used yet, whatever the Free plan's configured allowance is.
  await expect(meter).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("radio", { name: "Table" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});
