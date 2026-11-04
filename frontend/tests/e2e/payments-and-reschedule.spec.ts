import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  CUSTOMER,
  OWNER,
  authHeader,
  requireLiveBackend,
  signInAs,
  waitForDashboard,
} from "./dashboard-helpers";

/**
 * Payment links for dashboard bookings, and reschedule slots that ignore the
 * booking being moved. Runs against the live stack with the demo seed; every
 * booking it creates is cancelled again.
 */
const SLUG = "gleam-car-wash";

test.describe("payment links and rescheduling", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop flow");

  test.beforeEach(async ({ page }, testInfo) => {
    await requireLiveBackend(page, testInfo);
  });

  test("a booking that collects online shows, copies and resends its payment link", async ({ page }) => {
    await signInAs(page, OWNER);
    const name = `Morgan Example ${Date.now().toString(36)}`;
    await page.goto(`/dashboard/${SLUG}/bookings`);
    await waitForDashboard(page);

    await page
      .getByRole("button", { name: /new booking/i })
      .first()
      .click();
    const sheet = page.getByRole("dialog", { name: /new booking/i });
    await sheet.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /exterior wash/i }).click();
    const nextAvailable = sheet.getByRole("button", { name: /next available/i });
    const slots = sheet.getByRole("radiogroup", { name: /times$/i }).getByRole("radio");
    await expect(slots.first().or(nextAvailable)).toBeVisible({ timeout: 15_000 });
    if (await nextAvailable.isVisible()) await nextAvailable.click();
    await slots.last().click();

    await sheet.getByRole("combobox", { name: /find a/i }).click();
    await page.getByRole("button", { name: /new customer/i }).click();
    await sheet.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await sheet.getByRole("textbox", { name: /^Email/ }).fill(`morgan+${Date.now()}@example.test`);
    await sheet.getByRole("radio", { name: /^online/i }).click();
    await sheet.getByRole("button", { name: /create booking/i }).click();

    // Success state: the booking is held and its payment link is ready to share.
    const held = page.getByRole("dialog", { name: /booking held for payment/i });
    await expect(held).toBeVisible({ timeout: 15_000 });
    await expect(held.getByRole("textbox", { name: "Payment link" })).toHaveValue(/\/dev\/checkout\//);
    await expect(held.getByText(/we've emailed this link/i)).toBeVisible();
    await held.getByRole("button", { name: /view booking/i }).click();

    const drawer = page.getByRole("dialog").filter({ hasText: name });
    await expect(drawer.getByRole("button", { name: /copy payment link/i })).toBeVisible();
    await drawer.getByRole("button", { name: /resend payment link/i }).click();
    await expect(page.getByText(/payment link sent to/i)).toBeVisible({ timeout: 15_000 });

    // Clean up: cancel the held booking.
    await drawer.getByRole("button", { name: /cancel booking/i }).click();
    const confirm = page.getByRole("dialog", { name: /cancel this booking/i });
    await confirm.getByRole("switch").click();
    await confirm.getByRole("button", { name: /^cancel booking$/i }).click();
    await expect(drawer.getByText("Cancelled").first()).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard reschedule asks for slots that ignore the booking itself", async ({ page, request }) => {
    const created = await createConfirmedBooking(request);
    try {
      await signInAs(page, OWNER);
      await page.goto(`/dashboard/${SLUG}/bookings?q=${encodeURIComponent(created.name)}`);
      await waitForDashboard(page);
      await page.getByText(created.name).first().click();
      const drawer = page.getByRole("dialog").filter({ hasText: created.name });
      const slotsRequest = page.waitForRequest((r) => r.url().includes(`excludeBookingId=${created.id}`));
      await drawer.getByRole("button", { name: /reschedule/i }).click();
      await slotsRequest;
      const dialog = page.getByRole("dialog", { name: "Reschedule" });
      await expect(dialog.getByRole("radiogroup", { name: /times$/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await request.post(`/api/v1/businesses/${created.businessId}/bookings/${created.id}/cancel`, {
        headers: authHeader(OWNER),
        data: { refund: "none", notifyCustomer: false },
      });
    }
  });

  test("my bookings reschedules with the booking's own availability", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/my/bookings");
    await expect(page.getByRole("heading", { name: "My bookings" })).toBeVisible({ timeout: 20_000 });
    const reschedule = page.getByRole("button", { name: /reschedule/i }).first();
    await expect(reschedule).toBeVisible({ timeout: 15_000 });
    const own = page.waitForRequest((r) => /\/api\/v1\/me\/bookings\/[^/]+\/availability/.test(r.url()));
    await reschedule.click();
    await own;
    await expect(page.getByRole("dialog", { name: /^reschedule/i })).toBeVisible();
  });
});

/** Creates a confirmed at-venue booking at the first free slot through the API. */
async function createConfirmedBooking(request: APIRequestContext) {
  const headers = authHeader(OWNER);
  const me = await (await request.get("/api/v1/me", { headers })).json();
  const businessId: string = me.memberships.find((m: { slug: string }) => m.slug === SLUG).businessId;
  const services = await (await request.get(`/api/v1/businesses/${businessId}/services`, { headers })).json();
  const service = services.find((s: { name: string }) => /exterior wash/i.test(s.name));
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 13 * 86_400_000).toISOString().slice(0, 10);
  const availability = await (
    await request.get(
      `/api/v1/businesses/${businessId}/availability?serviceId=${service.id}&from=${from}&to=${to}`,
      { headers },
    )
  ).json();
  const slots = availability.days.flatMap((d: { slots: { start: string }[] }) => d.slots);
  const slot = slots[Math.floor(Math.random() * slots.length)];
  const name = `Riley Example ${Date.now().toString(36)}`;
  const res = await request.post(`/api/v1/businesses/${businessId}/bookings`, {
    headers,
    data: {
      serviceId: service.id,
      optionId: null,
      addonIds: [],
      groupId: null,
      resourceIds: null,
      start: slot.start,
      customerId: null,
      customer: { name, email: null, phone: null },
      answers: {},
      internalNotes: null,
      paymentMode: "at_venue",
      notifyCustomer: false,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const booking = await res.json();
  return { id: booking.id as string, businessId, name };
}
