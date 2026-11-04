import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Public booking against a live stack (Next dev + Ktor with the demo seed and the
 * dev payment provider). Skipped when the backend isn't reachable.
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/booking.spec.ts
 */
const SLUG = "lumen-physio";
const SERVICE = /Follow-up treatment/;

async function backendUp(request: APIRequestContext) {
  try {
    const res = await request.get("/api/v1/health", { timeout: 5000 });
    return res.ok();
  } catch {
    return false;
  }
}

// Tests (and the desktop/mobile projects) book real slots: run serially and pick
// a random free slot so parallel runs don't collide with each other.
test.describe.configure({ mode: "serial" });

async function pickRandomSlot(page: Page) {
  const times = page.getByRole("group", { name: "Available times" });
  await expect(times).toBeVisible({ timeout: 15_000 });
  const buttons = times.getByRole("button");
  // The times re-render when availability refreshes (after a time was taken): count again if the pick went away.
  for (let attempt = 0; attempt < 5; attempt++) {
    await expect(page.getByRole("status", { name: "Loading available times" })).toHaveCount(0);
    const count = await buttons.count();
    try {
      await buttons.nth(Math.floor(Math.random() * count)).click({ timeout: 3_000 });
      return;
    } catch {
      // Detached mid-refresh: try again with the fresh list.
    }
  }
  throw new Error("no time could be picked");
}

test.beforeEach(async ({ request }) => {
  test.skip(!(await backendUp(request)), "Backend not reachable at /api/v1/health");
});

const visible = (page: Page, name: RegExp) =>
  page.getByRole("button", { name }).filter({ visible: true }).first();

/** From the business's link (`/[slug]`, the booking portal): pick the service, then a therapist and a time. */
async function chooseServiceAndTime(page: Page, therapist: RegExp | "any") {
  await page.goto(`/${SLUG}`);
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/book$`));
  // The portal wears the business's style preset (Lumen: Calm).
  await expect(page.locator("[data-theme]").first()).toHaveAttribute("data-theme", "calm");
  await page
    .getByRole("button", { name: /Follow-up treatment/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/book\\?service=`));
  await page.getByRole("radio", { name: therapist === "any" ? /^Any / : therapist }).click();
  await pickRandomSlot(page);
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
}

async function fillDetails(page: Page, name: string) {
  await page.getByLabel(/Full name/).fill(name);
  await page.getByLabel(/^Email/).fill(`e2e+${Date.now()}@example.com`);
  await page.getByLabel(/^Phone/).fill("+353 87 555 0100");
  await page.getByLabel(/What would you like help with/).fill("Follow-up for a sore shoulder.");
  await visible(page, /^Review/).click();
  await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
}

/**
 * Continue to the dev checkout. Other tests book random times on the same calendar in parallel, so the time may be
 * taken meanwhile: then, like a customer, pick another (the flow keeps the details) and try again.
 */
async function continueToCheckout(page: Page) {
  const taken = page.getByText(/Someone just booked that time/);
  for (let attempt = 0; attempt < 3; attempt++) {
    await visible(page, /Continue to payment/).click();
    await expect(page.getByText(/Development payment — no real money/).or(taken)).toBeVisible({
      timeout: 15_000,
    });
    if (!(await taken.isVisible())) return;
    await pickRandomSlot(page);
    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
    await visible(page, /^Review/).click();
    await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
  }
  throw new Error("every time picked was taken meanwhile");
}

test("goes from the booking link to a paid booking, pays through dev checkout and lands on the manage page", async ({
  page,
}) => {
  await chooseServiceAndTime(page, "any");
  await fillDetails(page, "Alex Morgan");
  await continueToCheckout(page);

  await expect(page).toHaveURL(/\/dev\/checkout\//);
  await page.getByRole("button", { name: /^Pay / }).click();

  await expect(page).toHaveURL(/\/manage\/.+payment=succeeded/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /you're booked/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^BA-/)).toBeVisible();

  // Cancel through the manage link.
  await page.getByRole("button", { name: /Cancel appointment/i }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /Cancel appointment/i })
    .click();
  await expect(page.getByRole("heading", { name: "Cancelled" })).toBeVisible({ timeout: 15_000 });
});

test("sends the customer back to pick another time when the slot is taken meanwhile", async ({
  page,
  request,
}) => {
  // A specific therapist, so a competing booking for the same slot must conflict. The other
  // project runs these tests in parallel on the same data, so if our random slot was taken
  // before we could book it ourselves, pick again.
  let competed = false;
  for (let attempt = 0; attempt < 3 && !competed; attempt++) {
    await page.goto(`/${SLUG}/book`);
    await page.getByRole("button", { name: SERVICE }).click();
    await page.getByRole("radio").nth(1).click();
    await pickRandomSlot(page);
    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
    competed = await bookSameSlotElsewhere(page, request);
  }
  expect(competed, "booked the chosen slot through the API").toBe(true);

  // The customer finishes their details after someone else took the time.
  await fillDetails(page, "Jordan Casey");
  await visible(page, /Continue to payment|Confirm/).click();
  await expect(page.getByRole("heading", { name: "Pick a time" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("alert").filter({ hasText: /someone just booked that time/i })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("time")).toBeNull();
});

/** Books the slot currently chosen in the flow (from its URL) as another customer. False if it's no longer free. */
async function bookSameSlotElsewhere(page: Page, request: APIRequestContext): Promise<boolean> {
  const url = new URL(page.url());
  const serviceId = url.searchParams.get("service")!;
  const resourceId = url.searchParams.get("with")!;
  const date = url.searchParams.get("date")!;
  const time = url.searchParams.get("time")!;
  const services = await (await request.get(`/api/v1/public/businesses/${SLUG}/services`)).json();
  const service = services.find((s: { id: string }) => s.id === serviceId);
  const availability = await (
    await request.get(
      `/api/v1/public/businesses/${SLUG}/availability?serviceId=${serviceId}&resourceId=${resourceId}&from=${date}&to=${date}`,
    )
  ).json();
  const slot = availability.days[0].slots.find((s: { start: string }) => s.start.includes(`T${time}`));
  if (!slot) return false;
  const answers = Object.fromEntries(
    service.questions
      .filter((q: { required: boolean }) => q.required)
      .map((q: { id: string }) => [q.id, "No"]),
  );
  const competing = await request.post(`/api/v1/public/businesses/${SLUG}/bookings`, {
    headers: { "Idempotency-Key": `e2e-${Date.now()}` },
    data: {
      serviceId,
      optionId: null,
      addonIds: [],
      groupId: null,
      resourceId,
      start: slot.start,
      customer: {
        name: "Sam Rivers",
        email: `e2e-rival+${Date.now()}@example.com`,
        phone: "+353 87 555 0101",
      },
      answers,
      customerNotes: null,
    },
  });
  if (competing.status() === 409) return false;
  expect(competing.status(), await competing.text()).toBe(201);
  return true;
}
