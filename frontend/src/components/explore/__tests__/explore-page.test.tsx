import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ExplorePage } from "../explore-page";
import { apiError, listing, mockMarketplace, page, searchCalls } from "./fixtures";
import { navigation } from "./navigation-mock";

vi.mock("next/navigation", async () => (await import("./navigation-mock")).nextNavigation);

/** Mirrors the routes: `/explore/[city]/[category]` presets + the query string. */
function Route() {
  const [, , city, category] = usePathname().split("/");
  return <ExplorePage preset={{ city, category }} />;
}

function renderExplore(path = "/explore") {
  navigation.reset(path);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Route />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const lastSearch = (fetchMock: ReturnType<typeof mockMarketplace>) => searchCalls(fetchMock).at(-1)!;

function stubGeolocation(value: Partial<Geolocation> | undefined) {
  Object.defineProperty(window.navigator, "geolocation", { value, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  stubGeolocation(undefined);
});

describe("ExplorePage", () => {
  it("renders listing cards from the search", async () => {
    const api = mockMarketplace({ search: () => page([listing()]) });
    renderExplore();
    const link = await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    expect(link).toHaveAttribute("href", "/lumen-physio");
    expect(screen.getByText("Deals")).toBeInTheDocument();
    expect(screen.getByText("Businesses across Ireland")).toBeInTheDocument();
    expect(Object.fromEntries(lastSearch(api))).toEqual({ limit: "12" });
  });

  it("puts the typed search in the URL and the query (debounced)", async () => {
    const api = mockMarketplace({ search: () => page([listing()]) });
    renderExplore();
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    await userEvent.type(screen.getByRole("searchbox", { name: /search businesses/i }), "sports massage");
    await waitFor(() => expect(navigation.url.searchParams.get("q")).toBe("sports massage"));
    await waitFor(() => expect(lastSearch(api).get("q")).toBe("sports massage"));
    // One navigation for the whole phrase, not one per keystroke.
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  it("filters by category chip", async () => {
    const api = mockMarketplace({ search: () => page([listing()]) });
    renderExplore();
    const chips = await screen.findByRole("group", { name: "Categories" });
    await userEvent.click(within(chips).getByRole("button", { name: "Barber" }));
    expect(navigation.url.pathname + navigation.url.search).toBe("/explore?category=barber");
    await waitFor(() => expect(lastSearch(api).get("category")).toBe("barber"));
    expect(within(chips).getByRole("button", { name: "Barber" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("Barbers across Ireland")).toBeInTheDocument();
  });

  it("filters by availability and deals", async () => {
    const api = mockMarketplace({ search: () => page([listing()]) });
    renderExplore();
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    await userEvent.click(screen.getByRole("radio", { name: "Today" }));
    await waitFor(() => expect(lastSearch(api).get("available")).toBe("today"));
    await userEvent.click(screen.getByRole("switch", { name: "Has deals" }));
    await waitFor(() => expect(lastSearch(api).get("deals")).toBe("true"));
    expect(navigation.url.search).toBe("?available=today&deals=true");
  });

  it("loads more with the cursor", async () => {
    const api = mockMarketplace({
      search: (url) =>
        url.searchParams.get("cursor") === "c2"
          ? page([listing({ name: "Harbour Barbers", slug: "harbour-barbers" })])
          : page([listing()], "c2"),
    });
    renderExplore();
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("link", { name: "Harbour Barbers" })).toHaveAttribute(
      "href",
      "/harbour-barbers",
    );
    expect(screen.getByRole("link", { name: "Lumen Physiotherapy" })).toBeInTheDocument();
    expect(lastSearch(api).get("cursor")).toBe("c2");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("suggests clearing filters and widening the radius when nothing matches", async () => {
    const api = mockMarketplace({ search: () => page([]) });
    renderExplore("/explore/galway/physio?deals=true");
    expect(await screen.findByText("Nothing matches yet")).toBeInTheDocument();
    expect(screen.getByText("Nothing within 20 km of Galway matches your search.")).toBeInTheDocument();
    expect(lastSearch(api).get("city")).toBe("galway");

    await userEvent.click(screen.getByRole("button", { name: "Widen to 50 km" }));
    expect(navigation.url.pathname + navigation.url.search).toBe(
      "/explore/galway/physio?radiusKm=50&deals=true",
    );
    await waitFor(() => expect(lastSearch(api).get("radiusKm")).toBe("50"));

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(navigation.url.pathname + navigation.url.search).toBe("/explore/galway?radiusKm=50");
    expect(screen.getByRole("button", { name: "Search all of Ireland" })).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    let fail = true;
    mockMarketplace({
      search: () =>
        fail ? apiError(500, "INTERNAL_SERVER_ERROR", "Search is having a moment.") : page([listing()]),
    });
    renderExplore();
    expect(await screen.findByText("We couldn't load results")).toBeInTheDocument();
    expect(screen.getByText("Search is having a moment.")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("link", { name: "Lumen Physiotherapy" })).toBeInTheDocument();
  });

  it("explains rate limiting", async () => {
    mockMarketplace({ search: () => apiError(429, "RATE_LIMITED", "Too many requests.") });
    renderExplore();
    expect(await screen.findByText("Lots of searches in a short time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("offers a reset for filters the backend rejects", async () => {
    mockMarketplace({ search: () => apiError(400, "INVALID_REQUEST", "Must be between 1 and 200.") });
    renderExplore("/explore?lat=53&lng=-6&radiusKm=150");
    await userEvent.click(await screen.findByRole("button", { name: "Reset filters" }));
    expect(navigation.url.pathname + navigation.url.search).toBe("/explore");
  });

  it("picks a city from the combobox", async () => {
    const api = mockMarketplace({ search: () => page([listing()]) });
    renderExplore("/explore?category=physio");
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    await userEvent.click(screen.getByRole("combobox", { name: "City" }));
    expect(screen.getByRole("option", { name: /Dublin.*12 businesses/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /Galway/ }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/explore/galway/physio", { scroll: false });
    await waitFor(() => expect(lastSearch(api).get("city")).toBe("galway"));
    expect(lastSearch(api).get("category")).toBe("physio");
    expect(await screen.findByText("Within 20 km of Galway")).toBeInTheDocument();
  });

  it("searches near the visitor with Near me", async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 53.349805, longitude: -6.26031 } } as GeolocationPosition),
    );
    stubGeolocation({ getCurrentPosition });
    const api = mockMarketplace({ search: () => page([listing()]) });
    renderExplore("/explore/dublin");
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    await userEvent.click(screen.getByRole("button", { name: "Near me" }));
    expect(navigation.url.pathname + navigation.url.search).toBe("/explore?lat=53.35&lng=-6.26");
    await waitFor(() => expect(lastSearch(api).get("lat")).toBe("53.35"));
    expect(lastSearch(api).get("lng")).toBe("-6.26");
    expect(lastSearch(api).has("city")).toBe(false);
    expect(await screen.findByText("Within 25 km of you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Near me" })).toHaveAttribute("aria-pressed", "true");
  });

  it("explains a denied location and keeps the city picker usable", async () => {
    stubGeolocation({
      getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback | null) =>
        fail?.({ code: 1, message: "denied" } as GeolocationPositionError),
    });
    mockMarketplace({ search: () => page([listing()]) });
    renderExplore();
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    await userEvent.click(screen.getByRole("button", { name: "Near me" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/location access is turned off/i);
    expect(navigation.replace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("combobox", { name: "City" }));
    await userEvent.click(screen.getByRole("option", { name: /Dublin/ }));
    expect(navigation.url.pathname).toBe("/explore/dublin");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("copes with a browser without geolocation", async () => {
    stubGeolocation(undefined);
    mockMarketplace({ search: () => page([listing()]) });
    renderExplore();
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    await userEvent.click(screen.getByRole("button", { name: "Near me" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your browser can't share your location.");
  });
});
