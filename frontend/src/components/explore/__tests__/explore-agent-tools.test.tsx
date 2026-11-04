/**
 * The marketplace's WebMCP tools, driven as a browser agent would through `document.modelContext`: search with the
 * page's own filters (the visitor sees the same results), then open a business.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fakeModelContext, removeModelContext } from "@/test/model-context";
import { ExploreAgentToolsHost } from "../explore-agent-tools-host";
import { ExplorePage } from "../explore-page";
import { listing, mockMarketplace, page, searchCalls } from "./fixtures";
import { navigation } from "./navigation-mock";

vi.mock("next/navigation", async () => (await import("./navigation-mock")).nextNavigation);

let agent: ReturnType<typeof fakeModelContext>;

beforeEach(() => {
  agent = fakeModelContext();
});
afterEach(() => {
  removeModelContext();
  vi.unstubAllGlobals();
});

/** Mirrors the routes: `/explore/[city]/[category]` presets + the query string. */
function Route() {
  const [, , city, category] = usePathname().split("/");
  return <ExplorePage preset={{ city, category }} />;
}

async function renderExplore() {
  navigation.reset("/explore");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ExploreAgentToolsHost />
        <Route />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(agent.tools.size).toBe(2));
  return view;
}

describe("explore WebMCP tools", () => {
  it("registers search and open, only while Explore is shown", async () => {
    mockMarketplace({ search: () => page([]) });
    const view = await renderExplore();
    expect([...agent.tools.keys()]).toEqual(["search_businesses", "open_business"]);
    expect(agent.tools.get("search_businesses")?.tool.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    view.unmount();
    expect(agent.tools.size).toBe(0);
  });

  it("searches with the page's filters, so the visitor sees what the agent reads", async () => {
    const api = mockMarketplace({ search: () => page([listing()], "c2") });
    await renderExplore();
    const result = await agent.call("search_businesses", {
      query: "sports massage",
      category: "physio",
      city: "galway",
      available: "week",
      dealsOnly: true,
    });
    expect(navigation.url.pathname).toBe("/explore/galway/physio");
    expect(Object.fromEntries(navigation.url.searchParams)).toEqual({
      q: "sports massage",
      available: "week",
      deals: "true",
    });
    const sent = searchCalls(api).at(-1);
    expect(sent?.get("q")).toBe("sports massage");
    expect(sent?.get("city")).toBe("galway");
    expect(result).toEqual({
      shown: expect.stringContaining("The page shows these results"),
      more: true,
      results: [
        {
          slug: "lumen-physio",
          name: "Lumen Physiotherapy",
          category: "Physiotherapy",
          address: "1 Dame Street, Dublin",
          distanceKm: 1.24,
          priceFrom: "€45",
          nextFreeTimes: [
            { date: "2026-10-01", time: "14:00", service: "Assessment", price: "€60", deal: null },
            { date: "2026-10-02", time: "13:30", service: "Follow-up", price: "€36", deal: "20% off" },
          ],
          deals: ["Quiet afternoons: 20% off"],
        },
      ],
    });
    expect(await screen.findByRole("link", { name: "Lumen Physiotherapy" })).toBeInTheDocument();
  });

  it("names the categories and cities there are when given an unknown one, and checks its input", async () => {
    mockMarketplace({ search: () => page([]) });
    await renderExplore();
    expect(await agent.call("search_businesses", { category: "astrology" })).toEqual({
      error: "Unknown category astrology.",
      categories: ["physio", "barber", "car-wash"],
    });
    expect(await agent.call("search_businesses", { city: "atlantis" })).toEqual({
      error: "Unknown city atlantis.",
      cities: ["dublin", "galway"],
    });
    expect(await agent.call("search_businesses", { available: "someday" })).toEqual({
      error: "available must be any, today or week.",
    });
    expect(await agent.call("search_businesses", { dealsOnly: "yes" })).toEqual({
      error: "dealsOnly must be true or false",
    });
  });

  it("opens a business's page or its booking page", async () => {
    mockMarketplace({ search: () => page([]) });
    await renderExplore();
    expect(await agent.call("open_business", { slug: "lumen-physio", book: true })).toEqual({
      opened: "/lumen-physio/book",
      next: expect.stringContaining("get_booking_options"),
    });
    expect(navigation.url.pathname).toBe("/lumen-physio/book");
    expect(await agent.call("open_business", { slug: "lumen-physio" })).toMatchObject({
      opened: "/lumen-physio",
    });
    expect(await agent.call("open_business", { slug: "../admin" })).toEqual({
      error: "slug must be a business's slug from search_businesses.",
    });
    expect(await agent.call("open_business", {})).toHaveProperty("error");
  });
});
