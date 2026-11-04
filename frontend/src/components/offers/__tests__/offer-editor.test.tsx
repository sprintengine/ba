import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import type { OfferInput, Service } from "@/lib/api/types";
import { mockApi, renderDashboard } from "@/components/dashboard/test/render";
import { OffersPage } from "../offers-page";
import { apiError, offer, preview, service } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => vi.unstubAllGlobals());

type Call = { method: string; path: string; body: unknown };

function api({
  services = [service()],
  create,
}: { services?: Service[]; create?: (body: OfferInput) => unknown } = {}) {
  const calls: Call[] = [];
  mockApi((method, path, body) => {
    calls.push({ method, path, body });
    if (path.endsWith("/offers/preview")) return preview;
    if (path.endsWith("/offers") && method === "POST") return create ? create(body as OfferInput) : offer();
    if (path.endsWith("/offers")) return [];
    if (path.endsWith("/services")) return services;
    return {};
  });
  return calls;
}

const previewCalls = (calls: Call[]) => calls.filter((c) => c.path.endsWith("/offers/preview"));

async function openEditor() {
  const user = userEvent.setup();
  renderDashboard(<OffersPage previewDelay={0} />);
  await user.click(await screen.findByRole("button", { name: /new offer/i }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog };
}

describe("offer editor", () => {
  it("shows validation messages and doesn't submit an invalid offer", async () => {
    const calls = api();
    const { user, dialog } = await openEditor();
    await user.click(within(dialog).getByRole("checkbox", { name: "Sports massage" }));
    await user.click(within(dialog).getByRole("button", { name: "Create offer" }));
    expect(await within(dialog).findByText("Give the deal a name")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose at least one service")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/offers"))).toBe(false);
  });

  it("creates the offer with the right input", async () => {
    let sent: OfferInput | null = null;
    api({
      create: (body) => {
        sent = body;
        return offer({ name: body.name });
      },
    });
    const { user, dialog } = await openEditor();
    await user.type(within(dialog).getByRole("textbox", { name: /^name/i }), "Quiet Tuesdays");
    const percent = within(dialog).getByRole("textbox", { name: /percentage off/i });
    await user.clear(percent);
    await user.type(percent, "25");
    await user.click(within(dialog).getByRole("button", { name: "Tuesday" }));
    await user.click(within(dialog).getByRole("button", { name: /add hours/i }));
    await user.click(within(dialog).getByRole("switch", { name: /last-minute only/i }));
    await user.click(within(dialog).getByRole("button", { name: "Create offer" }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toEqual({
      name: "Quiet Tuesdays",
      description: null,
      serviceIds: ["s1"],
      discount: { type: "percent", percent: 25 },
      schedule: { daysOfWeek: [2], timeWindows: [{ start: "13:00", end: "17:00" }], lastMinuteHours: 3 },
      validFrom: null,
      validUntil: null,
      maxRedemptions: null,
      active: true,
    });
  });

  it("sends a fixed amount in cents", async () => {
    let sent: OfferInput | null = null;
    api({ create: (body) => ((sent = body), offer()) });
    const { user, dialog } = await openEditor();
    await user.type(within(dialog).getByRole("textbox", { name: /^name/i }), "Fiver off");
    await user.click(within(dialog).getByRole("radio", { name: /fixed amount/i }));
    await user.type(within(dialog).getByRole("textbox", { name: /amount off/i }), "5");
    await user.click(within(dialog).getByRole("button", { name: "Create offer" }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.discount).toEqual({ type: "fixed", amountCents: 500 });
  });

  it("maps API field errors onto the form", async () => {
    api({
      create: () =>
        apiError(400, "INVALID_REQUEST", "Please check the highlighted fields.", {
          "discount.percent": "Too generous for this service",
          "schedule.daysOfWeek[0]": "Must be 1 (Monday) to 7 (Sunday)",
        }),
    });
    const { user, dialog } = await openEditor();
    await user.type(within(dialog).getByRole("textbox", { name: /^name/i }), "Quiet Tuesdays");
    await user.click(within(dialog).getByRole("button", { name: "Create offer" }));
    expect(await within(dialog).findByText("Too generous for this service")).toBeInTheDocument();
    expect(within(dialog).getByText("Must be 1 (Monday) to 7 (Sunday)")).toBeInTheDocument();
  });
});

describe("affected times preview", () => {
  it("shows how many times are discounted, with struck-through prices", async () => {
    const calls = api();
    const { dialog } = await openEditor();
    const section = within(dialog).getByRole("region", { name: "Affected times" });
    await waitFor(() => expect(section).toHaveTextContent("2 of 12 times in the next 7 days"));
    const struck = section.querySelectorAll("s");
    expect(struck).toHaveLength(2);
    expect(struck[0]).toHaveTextContent("€50");
    expect(within(section).getAllByText("was €50, now €40")).toHaveLength(2);
    const request = must(previewCalls(calls)[0], "a preview call").body as {
      offer: OfferInput;
      days: number;
    };
    expect(request.days).toBe(7);
    expect(request.offer.serviceIds).toEqual(["s1"]);
    expect(request.offer.discount).toEqual({ type: "percent", percent: 20 });
  });

  it("isn't requested while the draft is invalid", async () => {
    const calls = api({ services: [] });
    const { dialog } = await openEditor();
    expect(await within(dialog).findByText("Nothing to preview yet")).toBeInTheDocument();
    // Give a debounced request every chance to fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(previewCalls(calls)).toHaveLength(0);
  });

  it("stops previewing when the draft becomes invalid", async () => {
    const calls = api();
    const { user, dialog } = await openEditor();
    await waitFor(() => expect(previewCalls(calls)).toHaveLength(1));
    await user.click(within(dialog).getByRole("checkbox", { name: "Sports massage" }));
    expect(await within(dialog).findByText("Nothing to preview yet")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(previewCalls(calls)).toHaveLength(1);
  });
});
