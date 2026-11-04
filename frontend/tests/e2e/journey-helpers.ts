import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { authHeader, signInAs } from "./dashboard-helpers";
import type { Identity } from "./site-helpers";

/**
 * Shared steps for end-to-end journeys. Every journey works on a throwaway business made from an industry template
 * and owned by a fresh dev user, so specs (and the desktop and mobile projects) never compete for the same slots or
 * change the demo data. Names are obviously fictional.
 */

/** A short random suffix, unique per call. */
export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A dev identity nobody else uses (dev auth accepts any `dev_` subject and treats the email as verified). */
export function newIdentity(prefix: string, name: string): Identity {
  const id = uniq();
  return { sub: `dev_e2e_${prefix}_${id}`, email: `e2e-${prefix}-${id}@example.test`, name };
}

type Setup = Record<string, unknown> & {
  services: Array<Record<string, unknown> & { name: string }>;
};

export type TestBusiness = { id: string; slug: string; name: string; owner: Identity };

/**
 * Creates a business from an industry template (`physio`, `car_wash`, `music_lessons`, `gp_practice`, …) as a
 * fresh owner. [customize] may change the setup first (e.g. make a service need approval).
 */
export async function createBusiness(
  request: APIRequestContext,
  template: string,
  customize: (setup: Setup) => Setup = (s) => s,
): Promise<TestBusiness> {
  const owner = newIdentity("owner", "Testbed Owner");
  const setup = (await (await request.get(`/api/v1/public/templates/${template}`)).json()) as Setup;
  const id = uniq();
  const name = `Testbed ${template.replace(/_/g, " ")} ${id.slice(-4).toUpperCase()}`;
  const res = await request.post("/api/v1/businesses", {
    headers: authHeader(owner),
    data: { ...customize(setup), name, slug: `e2e-${template.replace(/_/g, "-")}-${id}` },
  });
  expect(res.status(), await res.text()).toBe(201);
  const business = (await res.json()) as { id: string; slug: string };
  return { id: business.id, slug: business.slug, name, owner };
}

/** Changes one service of a setup. */
export function withService(
  setup: Setup,
  name: string,
  change: (service: Record<string, unknown>) => Record<string, unknown>,
): Setup {
  return { ...setup, services: setup.services.map((s) => (s.name === name ? { ...s, ...change(s) } : s)) };
}

/** The step's primary button; on phones it lives in the bottom bar, so take the visible one. */
export const action = (page: Page, name: RegExp) =>
  page.getByRole("button", { name }).filter({ visible: true }).first();

/** The public booking flow, step by step. */
export const flow = {
  heading: (page: Page, name: string | RegExp) => page.getByRole("heading", { name, level: 2 }),

  async open(page: Page, slug: string, query = "") {
    await page.goto(`/${slug}/book${query ? `?${query}` : ""}`);
  },

  async group(page: Page, name: RegExp) {
    // Choosing moves straight on to the services.
    await page.getByRole("radiogroup", { name: "Who is booking" }).getByRole("radio", { name }).click();
    await expect(flow.heading(page, "Choose a service")).toBeVisible();
  },

  async service(page: Page, name: RegExp) {
    await page.getByRole("button", { name }).first().click();
  },

  async option(page: Page, name: RegExp) {
    await page.getByRole("radiogroup", { name: "Option" }).getByRole("radio", { name }).click();
  },

  async addon(page: Page, name: RegExp) {
    const extra = page.getByRole("group", { name: "Extras" }).getByRole("checkbox", { name });
    await extra.click();
    await expect(extra).toHaveAttribute("aria-checked", "true");
  },

  async continue(page: Page) {
    await action(page, /^Continue/).click();
  },

  /** Picks [resource] on the resource step ("any" picks "Any …"). */
  async resource(page: Page, name: RegExp | "any") {
    // Choosing moves straight on to the times.
    await page.getByRole("radio", { name: name === "any" ? /^Any / : name }).click();
  },

  /** Picks "Any …" when the service lets the customer choose who (or which room) they book with. */
  async anyResourceIfAsked(page: Page) {
    const any = page.getByRole("radio", { name: /^Any / });
    const times = page.getByRole("group", { name: "Available times" });
    await expect(any.or(times).first()).toBeVisible({ timeout: 20_000 });
    if (await any.isVisible()) await any.click();
  },

  /** The chosen date and time from the flow's URL (`?date=…&time=…`). */
  chosen(page: Page): { date: string; time: string } {
    const url = new URL(page.url());
    return { date: url.searchParams.get("date") ?? "", time: url.searchParams.get("time") ?? "" };
  },

  /** The first free time shown (moving on to the next day with times if needed); returns its label. */
  async firstTime(page: Page): Promise<string> {
    const times = page.getByRole("group", { name: "Available times" });
    await expect(times).toBeVisible({ timeout: 20_000 });
    const first = times.getByRole("button").first();
    const label = (await first.textContent())?.trim() ?? "";
    await first.click();
    return label;
  },

  /** Fills the details form; [answers] maps question labels to values (select questions pick the option). */
  async details(
    page: Page,
    who: { name: string; email: string; phone?: string },
    answers: Record<string, string> = {},
  ) {
    await expect(flow.heading(page, "Your details")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(/Full name/).fill(who.name);
    await page.getByLabel(/^Email/).fill(who.email);
    await page.getByLabel(/^Phone/).fill(who.phone ?? "+353 87 555 0100");
    for (const [label, value] of Object.entries(answers)) await answer(page, label, value);
    await action(page, /^Review/).click();
    await expect(flow.heading(page, /^Review (and confirm|your request)$/)).toBeVisible({ timeout: 15_000 });
  },

  /** The review step's submit button (its label says what happens: pay, confirm or send a request). */
  submit: (page: Page) => action(page, /^(Continue to payment|Confirm|Send request)/),
};

async function answer(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: false }).first();
  if ((await field.getAttribute("role")) === "combobox") {
    await field.click();
    await page.getByRole("option", { name: value, exact: true }).click();
  } else {
    await field.fill(value);
  }
}

/** Pays on the development checkout page and waits for the manage page. */
export async function payOnDevCheckout(page: Page) {
  await expect(page).toHaveURL(/\/dev\/checkout\//, { timeout: 20_000 });
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page).toHaveURL(/\/manage\/.+payment=succeeded/, { timeout: 20_000 });
}

/** The manage page's booking reference (`BA-…`). */
export const reference = (page: Page): Locator => page.getByText(/^BA-[A-Z0-9-]+$/).first();

/** Signs in as [who] and opens My bookings. */
export async function openMyBookings(page: Page, who: Identity) {
  await signInAs(page, who);
  await page.goto("/my/bookings");
  await expect(page.getByRole("tablist", { name: "Bookings" })).toBeVisible({ timeout: 20_000 });
}

/**
 * Adds [who] to the business as [role] (linked to the resource named [resource]); their first `/v1/me` accepts the
 * invitation, as signing in does.
 */
export async function addMember(
  request: APIRequestContext,
  b: TestBusiness,
  who: Identity,
  role: "admin" | "staff",
  resource?: string,
) {
  const resources = (await (
    await request.get(`/api/v1/businesses/${b.id}/resources`, { headers: authHeader(b.owner) })
  ).json()) as Array<{ id: string; name: string }>;
  const resourceId = resource ? resources.find((r) => r.name === resource)?.id : null;
  const invited = await request.post(`/api/v1/businesses/${b.id}/team/invitations`, {
    headers: authHeader(b.owner),
    data: { email: who.email, role, resourceId },
  });
  expect(invited.status(), await invited.text()).toBe(201);
  expect((await request.get("/api/v1/me", { headers: authHeader(who) })).ok()).toBe(true);
}

/** API helpers for the business owner. */
export const ownerApi = {
  /** The business's bookings from yesterday to [days] ahead (any status). */
  async bookings(request: APIRequestContext, b: TestBusiness, days = 120) {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const res = await request.get(`/api/v1/businesses/${b.id}/bookings?from=${day(-1)}&to=${day(days)}`, {
      headers: authHeader(b.owner),
    });
    expect(res.ok(), await res.text()).toBe(true);
    return ((await res.json()) as { items: Array<Record<string, unknown> & { id: string; status: string }> })
      .items;
  },
};
