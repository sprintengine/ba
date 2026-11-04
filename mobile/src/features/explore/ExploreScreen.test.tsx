import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { listing, listingSparse, marketplaceSearchResult } from "@shared/api/__tests__/fixtures/marketplace";
import type { MarketplaceMeta } from "@shared/api/types";
import { DEFAULT_FILTERS, type ExploreFilters } from "@shared/explore/filters";
import { apiError, mockApi } from "~/test/api-mock";
import { renderScreen } from "~/test/render";
import * as layout from "~/ui/layout";
import { describeScope, emptyDescription, euroText, locationLabel, parseEuro } from "./explore";
import { ExploreScreen } from "./ExploreScreen";

const mockLocation = {
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
};
jest.mock("expo-location", () => mockLocation);

const meta: MarketplaceMeta = {
  categories: [
    { key: "physio", label: "Physiotherapy", plural: "Physiotherapists" },
    { key: "car-wash", label: "Car wash", plural: "Car washes" },
  ],
  cities: [
    { slug: "dublin", name: "Dublin", county: "Dublin", latitude: 53.35, longitude: -6.26, listingCount: 4 },
    { slug: "galway", name: "Galway", county: "Galway", latitude: 53.27, longitude: -9.05, listingCount: 1 },
  ],
};

const SEARCH = "/v1/public/marketplace/search";

function setup(search: (query: URLSearchParams) => unknown = () => marketplaceSearchResult) {
  const queries: URLSearchParams[] = [];
  const api = mockApi((_method, path) => {
    if (path === "/v1/public/marketplace/meta") return meta;
    if (path === SEARCH) {
      const call = api.mock.calls.at(-1)!;
      const query = new URL(String(call[0])).searchParams;
      queries.push(query);
      return search(query);
    }
    return undefined;
  });
  return { api, queries };
}

describe("ExploreScreen", () => {
  beforeEach(() => {
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 844 });
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    mockLocation.getLastKnownPositionAsync.mockResolvedValue({
      coords: { latitude: 53.34987, longitude: -6.26031 },
    });
  });

  it("lists businesses with their next free times and deals, and opens one", async () => {
    setup();
    const app = renderScreen(<ExploreScreen />, { routes: { "[slug]/index": () => <></> } });
    const card = await screen.findByTestId(`listing-${listing.business.slug}`);
    expect(card).toHaveAccessibleName(
      /^Lumen Physiotherapy\. Physiotherapy\. Dublin · 1\.4 km\. from €45\. Deals: 20% off\. Next free times: /,
    );
    expect(screen.getByText("Businesses across Ireland")).toBeOnTheScreen();
    fireEvent.press(card);
    await waitFor(() => expect(app.getPathname()).toBe(`/${listing.business.slug}`));
  });

  it("searches by text and category, and loads more as you scroll", async () => {
    const { queries } = setup((q) =>
      q.get("cursor")
        ? {
            items: [{ ...listingSparse, business: { ...listingSparse.business, id: "b2", slug: "second" } }],
            nextCursor: null,
            center: null,
          }
        : marketplaceSearchResult,
    );
    renderScreen(<ExploreScreen />);
    await screen.findByTestId(`listing-${listing.business.slug}`);
    fireEvent.press(screen.getByTestId("category-physio"));
    await waitFor(() => expect(queries.at(-1)?.get("category")).toBe("physio"));
    expect(await screen.findByText("Physiotherapists across Ireland")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId("explore-search"), "knee");
    fireEvent(screen.getByTestId("explore-search"), "submitEditing");
    await waitFor(() => expect(queries.at(-1)?.get("q")).toBe("knee"));
    await act(async () => {
      screen.getByTestId("explore-results").props.onEndReached();
    });
    expect(await screen.findByTestId("listing-second")).toBeOnTheScreen();
    expect(queries.at(-1)?.get("cursor")).toBe("c_2");
  });

  it("searches near me with the phone's position, and in a city", async () => {
    const { queries } = setup();
    renderScreen(<ExploreScreen />);
    await screen.findByTestId(`listing-${listing.business.slug}`);
    fireEvent.press(screen.getByTestId("explore-near-me"));
    await waitFor(() => expect(queries.at(-1)?.get("lat")).toBe("53.35"));
    expect(queries.at(-1)?.get("lng")).toBe("-6.26");
    expect(await screen.findByText("Businesses near you · within 25 km")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("explore-location"));
    fireEvent.press(await screen.findByTestId("city-galway"));
    await waitFor(() => expect(queries.at(-1)?.get("city")).toBe("galway"));
    expect(await screen.findByText("Businesses in Galway · within 20 km")).toBeOnTheScreen();
  });

  it("says when location access is off, with a way to Settings", async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    setup();
    renderScreen(<ExploreScreen />);
    fireEvent.press(await screen.findByTestId("explore-near-me"));
    expect(await screen.findByTestId("near-me-error")).toHaveTextContent(
      /Location access is off for bookanything/,
    );
    fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("near-me-error")).toBeNull();
  });

  it("applies filters from the sheet", async () => {
    const { queries } = setup();
    renderScreen(<ExploreScreen />);
    await screen.findByTestId(`listing-${listing.business.slug}`);
    fireEvent.press(screen.getByTestId("explore-filters"));
    fireEvent.press(await screen.findByRole("tab", { name: "Today" }));
    fireEvent.changeText(screen.getByTestId("filters-max"), "abc");
    expect(screen.getByText("Enter an amount in euro, like 25 or 12.50")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId("filters-max"), "60");
    fireEvent(screen.getByTestId("filters-deals"), "valueChange", true);
    fireEvent.press(screen.getByTestId("filters-apply"));
    await waitFor(() => expect(queries.at(-1)?.get("available")).toBe("today"));
    expect(queries.at(-1)?.get("maxPrice")).toBe("6000");
    expect(queries.at(-1)?.get("deals")).toBe("true");
    expect(screen.getByTestId("explore-filters")).toHaveAccessibleName("Filters · 3");
  });

  it("says when nothing matches, with ways out", async () => {
    setup(() => ({ items: [], nextCursor: null, center: null }));
    renderScreen(<ExploreScreen preset={{ city: "galway", category: "physio" }} />);
    expect(await screen.findByTestId("explore-empty")).toBeOnTheScreen();
    expect(screen.getByText("Nothing within 20 km of Galway matches your search.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Widen to 50 km" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Search all of Ireland" })).toBeOnTheScreen();
  });

  it("explains rate limiting and errors", async () => {
    setup(() => apiError(429, "RATE_LIMITED", "Slow down."));
    renderScreen(<ExploreScreen />);
    expect(await screen.findByText("Lots of searches in a short time")).toBeOnTheScreen();
  });

  it("explains filters the server refused", async () => {
    setup(() => apiError(400, "INVALID_REQUEST", "Price range is invalid."));
    renderScreen(<ExploreScreen />);
    expect(await screen.findByText("Those filters don't work together")).toBeOnTheScreen();
    expect(screen.getByText("Price range is invalid.")).toBeOnTheScreen();
  });

  it("shows two columns on large screens", async () => {
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: true, width: 1180, height: 820 });
    setup();
    renderScreen(<ExploreScreen />);
    expect(await screen.findByTestId(`listing-${listing.business.slug}`)).toBeOnTheScreen();
    expect(screen.getByTestId("explore-results").props.numColumns).toBe(2);
  });
});

describe("explore wording", () => {
  const near: ExploreFilters = { ...DEFAULT_FILTERS, location: { kind: "near", lat: 1, lng: 2 } };
  it("describes the scope and the empty result", () => {
    expect(describeScope(DEFAULT_FILTERS, meta, null)).toBe("Businesses across Ireland");
    expect(describeScope(near, meta, null)).toBe("Businesses near you · within 25 km");
    expect(emptyDescription(DEFAULT_FILTERS, meta, null)).toBe(
      "No businesses are listed yet. Check back soon.",
    );
    expect(emptyDescription({ ...DEFAULT_FILTERS, q: "x" }, meta, null)).toBe(
      "No listed business matches your search.",
    );
    expect(emptyDescription(near, meta, null)).toBe("Nothing within 25 km of you is listed yet.");
    expect(locationLabel(near, meta)).toBe("Near you");
    expect(locationLabel({ ...DEFAULT_FILTERS, location: { kind: "city", slug: "dublin" } }, meta)).toBe(
      "Dublin",
    );
  });
  it("reads and writes euro amounts", () => {
    expect(parseEuro("")).toBeNull();
    expect(parseEuro("€12,50")).toBe(1250);
    expect(parseEuro("abc")).toBeUndefined();
    expect(euroText(1250)).toBe("12.50");
    expect(euroText(4000)).toBe("40");
    expect(euroText(null)).toBe("");
  });
});
