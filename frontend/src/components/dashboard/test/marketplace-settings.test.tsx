import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceSettings as Settings } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { MarketplaceSettings } from "../settings/marketplace-settings";
import { mockApi, renderDashboard } from "./render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => vi.unstubAllGlobals());

const settings = (patch: Partial<Settings> = {}): Settings => ({
  listed: false,
  category: "physio",
  eligible: true,
  location: null,
  locationStatus: "missing_address",
  categories: [
    { key: "physio", label: "Physiotherapy", plural: "Physiotherapists" },
    { key: "massage", label: "Massage", plural: "Massage therapists" },
  ],
  ...patch,
});

function api(initial: Settings, put?: (body: { listed: boolean; category?: string }) => unknown) {
  const puts: unknown[] = [];
  mockApi((method, path, body) => {
    if (!path.endsWith("/marketplace")) return {};
    if (method === "PUT") {
      puts.push(body);
      return put ? put(body as { listed: boolean; category?: string }) : { ...initial, ...(body as object) };
    }
    return initial;
  });
  return puts;
}

describe("marketplace settings", () => {
  it("Free plan: shows the upgrade prompt and a disabled switch", async () => {
    api(settings({ eligible: false }));
    const { container } = renderDashboard(<MarketplaceSettings />);
    const toggle = await screen.findByRole("switch", { name: /list on the bookanything marketplace/i });
    expect(toggle).toBeDisabled();
    expect(screen.getByText("Included in the Pro and Business plans.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see plans/i })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/settings/billing",
    );
    await expectNoAxeViolations(container);
  });

  it("Pro: lists the business with the chosen category", async () => {
    const puts = api(settings());
    const user = userEvent.setup();
    const { container } = renderDashboard(<MarketplaceSettings />);
    const toggle = await screen.findByRole("switch", { name: /list on the bookanything marketplace/i });
    expect(toggle).toBeEnabled();
    expect(screen.queryByText("Included in the Pro and Business plans")).not.toBeInTheDocument();
    expect(screen.getByText(/commission-free/i)).toBeInTheDocument();
    await user.click(toggle);
    await waitFor(() => expect(puts).toEqual([{ listed: true, category: "physio" }]));
    await waitFor(() => expect(toggle).toBeChecked());
    await expectNoAxeViolations(container);
  });

  it("turns a 409 PLAN_LIMIT_REACHED into the upgrade prompt", async () => {
    api(
      settings(),
      () =>
        new Response(
          JSON.stringify({
            error: { code: "PLAN_LIMIT_REACHED", message: "Listing is included in Pro.", fields: {} },
          }),
          { status: 409 },
        ),
    );
    const user = userEvent.setup();
    renderDashboard(<MarketplaceSettings />);
    await user.click(await screen.findByRole("switch", { name: /list on the bookanything marketplace/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Listing is included in Pro.");
    expect(screen.getByRole("switch", { name: /list on the bookanything marketplace/i })).toBeDisabled();
  });

  it("explains the location status", async () => {
    api(settings({ locationStatus: "not_found" }));
    renderDashboard(<MarketplaceSettings />);
    expect(await screen.findByText("We couldn't find your address")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /general settings/i })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/settings/general",
    );
  });

  it("shows how precisely a located business is placed", async () => {
    api(
      settings({
        listed: true,
        locationStatus: "located",
        location: {
          latitude: 53.3,
          longitude: -6.2,
          precision: "postcode",
          source: "mapbox",
          geocodedAt: "2026-09-01T10:00:00Z",
        },
      }),
    );
    renderDashboard(<MarketplaceSettings />);
    expect(await screen.findByText("You're on the map")).toBeInTheDocument();
    expect(screen.getByText(/Eircode \/ postcode area/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /find yourself on the marketplace/i })).toHaveAttribute(
      "href",
      "/explore?q=Lumen%20Physiotherapy",
    );
  });
});
