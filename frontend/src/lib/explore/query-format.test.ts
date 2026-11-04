import { Activity, Store } from "lucide-react";
import { describe, expect, it } from "vitest";
import { CATEGORY_ICONS, FALLBACK_CATEGORY_ICON, categoryIcon } from "./category-icons";
import { DEFAULT_FILTERS, type ExploreFilters } from "./filters";
import { formatDistance, formatListingCount, formatPriceFrom, formatSlotLabel } from "./format";
import { toMarketplaceQuery } from "./query";

describe("toMarketplaceQuery", () => {
  it("sends only the page size by default", () => {
    expect(toMarketplaceQuery(DEFAULT_FILTERS)).toEqual({ limit: 12 });
  });

  it("maps every filter", () => {
    const f: ExploreFilters = {
      q: "sports massage",
      category: "physio",
      location: { kind: "near", lat: 53.35, lng: -6.26 },
      radiusKm: 50,
      available: "week",
      minPrice: 1000,
      maxPrice: 8000,
      deals: true,
    };
    expect(toMarketplaceQuery(f, 6)).toEqual({
      q: "sports massage",
      category: "physio",
      lat: 53.35,
      lng: -6.26,
      radiusKm: 50,
      available: "week",
      minPrice: 1000,
      maxPrice: 8000,
      deals: true,
      limit: 6,
    });
  });

  it("maps a city and skips one-letter text and default radius", () => {
    expect(
      toMarketplaceQuery({
        ...DEFAULT_FILTERS,
        q: "y",
        location: { kind: "city", slug: "cork" },
        radiusKm: 20,
      }),
    ).toEqual({ city: "cork", limit: 12 });
  });

  it("never sends a radius without a location", () => {
    expect(toMarketplaceQuery({ ...DEFAULT_FILTERS, radiusKm: 50 })).toEqual({ limit: 12 });
  });
});

describe("formatDistance", () => {
  it.each([
    [0, "10 m"],
    [0.004, "10 m"],
    [0.35, "350 m"],
    [0.999, "1 km"],
    [1, "1 km"],
    [4.23, "4.2 km"],
    [9.96, "10 km"],
    [23.4, "23 km"],
    [1234.5, "1,235 km"],
  ])("%s km → %s", (km, label) => {
    expect(formatDistance(km)).toBe(label);
  });
});

describe("formatSlotLabel", () => {
  // Thu 1 Oct 2026, 10:00 in Dublin (IST, UTC+1).
  const now = new Date("2026-10-01T09:00:00Z");
  const tz = "Europe/Dublin";
  it("uses the business timezone and relative days", () => {
    expect(formatSlotLabel("2026-10-01T14:00:00+01:00", tz, now)).toBe("Today 14:00");
    expect(formatSlotLabel("2026-10-02T09:30:00+01:00", tz, now)).toBe("Tomorrow 09:30");
    expect(formatSlotLabel("2026-10-03T10:00:00+01:00", tz, now)).toBe("Sat 10:00");
    expect(formatSlotLabel("2026-10-13T10:00:00+01:00", tz, now)).toMatch(/^Tue,? 13 Oct 10:00$/);
  });
  it("converts instants given in another offset", () => {
    // 23:30 UTC on the 1st is 00:30 on the 2nd in Dublin.
    expect(formatSlotLabel("2026-10-01T23:30:00Z", tz, now)).toBe("Tomorrow 00:30");
    // 22:30 UTC on the 30th is 23:30 that day in Dublin: a past day keeps its date.
    expect(formatSlotLabel("2026-09-30T22:30:00Z", tz, now)).toMatch(/^Wed,? 30 Sept? 23:30$/);
  });
});

describe("formatPriceFrom / formatListingCount", () => {
  it("formats prices", () => {
    expect(formatPriceFrom(4500, "EUR")).toBe("from €45");
    expect(formatPriceFrom(0, "EUR")).toBe("Free");
    expect(formatPriceFrom(null, "EUR")).toBeNull();
  });
  it("formats counts", () => {
    expect(formatListingCount(0)).toBe("No businesses yet");
    expect(formatListingCount(1)).toBe("1 business");
    expect(formatListingCount(12)).toBe("12 businesses");
  });
});

describe("categoryIcon", () => {
  it("maps known categories and falls back for new ones", () => {
    expect(categoryIcon("physio")).toBe(Activity);
    expect(categoryIcon("underwater-basket-weaving")).toBe(FALLBACK_CATEGORY_ICON);
    expect(categoryIcon(null)).toBe(Store);
    expect(categoryIcon("constructor")).toBe(FALLBACK_CATEGORY_ICON);
    expect(Object.keys(CATEGORY_ICONS)).toContain("other");
  });
});
