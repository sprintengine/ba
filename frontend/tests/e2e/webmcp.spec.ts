import { expect, test, type Page } from "@playwright/test";
import { CUSTOMER, requireLiveBackend, signInAs } from "./dashboard-helpers";

/**
 * WebMCP against a live stack with the demo seed: a stand-in for the browser's `document.modelContext` (installed before
 * the page's scripts) keeps the tools each page registers, and the test calls them as an agent in the browser would.
 * The marketplace finds a business and opens its booking page, whose own tools take over; on My bookings a cancellation
 * only opens the page's dialog, and nothing changes until the customer confirms.
 */

type Agent = {
  names: () => string[];
  call: (name: string, input?: object) => Promise<Record<string, unknown>>;
};

async function installModelContext(page: Page) {
  await page.addInitScript(() => {
    type Tool = {
      name: string;
      execute: (input: object, options: { signal: AbortSignal }) => unknown;
    };
    const tools = new Map<string, Tool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: Tool, options?: { signal?: AbortSignal }) {
          tools.set(tool.name, tool);
          options?.signal?.addEventListener("abort", () => tools.delete(tool.name), { once: true });
          return Promise.resolve();
        },
      },
    });
    const agent: Agent = {
      names: () => [...tools.keys()],
      call: async (name, input = {}) => {
        const tool = tools.get(name);
        if (!tool) throw new Error(`No tool ${name}`);
        const result = await tool.execute(input, { signal: new AbortController().signal });
        return JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
      },
    };
    (window as unknown as { agent: Agent }).agent = agent;
  });
}

const toolNames = (page: Page) => page.evaluate(() => (window as unknown as { agent: Agent }).agent.names());
const callTool = (page: Page, name: string, input: object = {}) =>
  page.evaluate(([n, i]) => (window as unknown as { agent: Agent }).agent.call(n, i), [name, input] as const);

test.beforeEach(async ({ page }, testInfo) => {
  await requireLiveBackend(page, testInfo);
  await installModelContext(page);
});

test("an agent searches the marketplace and opens a booking page, whose tools take over", async ({
  page,
}) => {
  await page.goto("/explore");
  await expect
    .poll(() => toolNames(page), { timeout: 20_000 })
    .toEqual(["search_businesses", "open_business"]);

  const found = await callTool(page, "search_businesses", { city: "cork", category: "car-wash" });
  await expect(page).toHaveURL(/\/explore\/cork\/car-wash/);
  const results = found.results as { slug: string; name: string }[];
  expect(results.length).toBeGreaterThan(0);
  const first = results[0]!;
  await expect(page.getByRole("link", { name: first.name }).first()).toBeVisible();

  // The tools stay registered while the search moves to the city's page.
  expect(await toolNames(page)).toContain("open_business");
  await callTool(page, "open_business", { slug: first.slug, book: true });
  await expect(page).toHaveURL(new RegExp(`/${first.slug}/book`), { timeout: 15_000 });
  await expect.poll(() => toolNames(page), { timeout: 20_000 }).toContain("get_booking_options");
  expect(await toolNames(page)).not.toContain("search_businesses");
  const options = await callTool(page, "get_booking_options");
  expect((options.services as unknown[]).length).toBeGreaterThan(0);
});

test("on My bookings an agent opens a cancellation, and nothing changes until the customer confirms", async ({
  page,
}) => {
  await signInAs(page, CUSTOMER);
  await page.goto("/my/bookings");
  await expect(page.getByRole("heading", { name: "My bookings" })).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => toolNames(page), { timeout: 20_000 })
    .toEqual(["list_my_bookings", "cancel_booking", "reschedule_booking"]);
  type Listed = { id: string; canCancel: boolean; status: string };
  // Bookings load after the tools register: the tool says so until they have.
  await expect
    .poll(async () => (await callTool(page, "list_my_bookings")).error ?? null, { timeout: 15_000 })
    .toBeNull();
  const listed = (await callTool(page, "list_my_bookings")).bookings as Listed[];
  const cancellable = listed.find((b) => b.canCancel);
  test.skip(!cancellable, "The demo customer has no booking that can be cancelled online.");

  const opened = await callTool(page, "cancel_booking", { bookingId: cancellable!.id });
  expect(opened.shown).toMatch(/Nothing is cancelled until they do/);
  const dialog = page.getByRole("alertdialog", { name: "Cancel your booking?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const after = (await callTool(page, "list_my_bookings")).bookings as Listed[];
  expect(after.find((b) => b.id === cancellable!.id)?.status).toBe(cancellable!.status);
});
