import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import type { Offer } from "@/lib/api/types";
import { mockApi, renderDashboard } from "@/components/dashboard/test/render";
import { OffersPage } from "../offers-page";
import { offer, service } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => vi.unstubAllGlobals());

function api(offers: Offer[]) {
  const calls: { method: string; path: string }[] = [];
  mockApi((method, path) => {
    calls.push({ method, path });
    const action = path.match(/\/offers\/([^/]+)\/(pause|resume)$/);
    if (action) {
      const o = offers.find((x) => x.id === action[1])!;
      return { ...o, status: action[2] === "pause" ? "paused" : "active" };
    }
    if (method === "DELETE") return new Response(null, { status: 204 });
    if (path.endsWith("/offers")) return offers;
    if (path.endsWith("/services")) return [service(), service({ id: "s2", name: "Physio assessment" })];
    if (path.endsWith("/preview")) return { affectedSlots: 0, totalSlots: 0, days: [] };
    return {};
  });
  return calls;
}

describe("offers list", () => {
  it("explains deals when there are none", async () => {
    api([]);
    renderDashboard(<OffersPage />);
    expect(await screen.findByText("No offers yet")).toBeInTheDocument();
    expect(screen.getByText("Off-peak")).toBeInTheDocument();
    expect(screen.getByText("Last-minute")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new offer/i })).toBeInTheDocument();
  });

  it("opens a suggestion filled in, ready to change and create", async () => {
    api([]);
    const user = userEvent.setup();
    renderDashboard(<OffersPage />);
    await user.click(await screen.findByRole("button", { name: /Off-peak/ }));
    const sheet = await screen.findByRole("dialog", { name: "New offer" });
    expect(within(sheet).getByRole("textbox", { name: /^Name/ })).toHaveValue("Off-peak afternoons");
  });

  it("lists offers with label, status, summary, services and usage", async () => {
    api([
      offer(),
      offer({
        id: "of2",
        name: "Late deals",
        status: "paused",
        label: "€10 off",
        maxRedemptions: null,
        redemptions: 0,
        serviceIds: ["s1", "s2"],
        kind: "last_minute",
        summary: "Starting within 3 hours",
        validUntil: "2099-12-31",
      }),
    ]);
    renderDashboard(<OffersPage />);
    const items = await screen.findAllByRole("listitem");
    const [first, second] = [must(items[0], "first offer"), must(items[1], "second offer")];
    expect(first).toHaveTextContent("Quiet Tuesdays");
    expect(within(first).getByText("20% off")).toBeInTheDocument();
    expect(within(first).getByText("Active")).toBeInTheDocument();
    expect(first).toHaveTextContent("Off-peak · Tue, 13:00–17:00");
    await waitFor(() => expect(first).toHaveTextContent("Sports massage"));
    expect(first).toHaveTextContent("4 of 50 used");
    expect(within(second).getByText("Paused")).toBeInTheDocument();
    expect(second).toHaveTextContent("Sports massage, Physio assessment");
    expect(second).toHaveTextContent("0 used");
    expect(second).toHaveTextContent("Until 31 Dec 2099");
  });

  it("pauses and resumes", async () => {
    const calls = api([offer(), offer({ id: "of2", name: "Late deals", status: "paused" })]);
    const user = userEvent.setup();
    renderDashboard(<OffersPage />);
    await user.click(await screen.findByRole("button", { name: /pause quiet tuesdays/i }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "POST", path: "/v1/businesses/b1/offers/of1/pause" }),
    );
    await user.click(screen.getByRole("button", { name: /resume late deals/i }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "POST", path: "/v1/businesses/b1/offers/of2/resume" }),
    );
  });

  it("deletes after confirming", async () => {
    const calls = api([offer()]);
    const user = userEvent.setup();
    renderDashboard(<OffersPage />);
    await user.click(await screen.findByRole("button", { name: "Delete Quiet Tuesdays" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete Quiet Tuesdays?");
    await user.click(within(dialog).getByRole("button", { name: "Delete offer" }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "DELETE", path: "/v1/businesses/b1/offers/of1" }),
    );
  });

  it("is admin-only", () => {
    api([]);
    renderDashboard(<OffersPage />, "staff");
    expect(screen.getByText("Offers are for admins")).toBeInTheDocument();
  });
});
