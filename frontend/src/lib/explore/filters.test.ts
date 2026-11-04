import { describe, expect, it } from "vitest";
import type { MarketplaceMeta } from "@/lib/api/types";
import {
  DEFAULT_FILTERS,
  clearRefinements,
  effectiveRadiusKm,
  exploreHref,
  hasRefinements,
  panelFilterCount,
  parseExploreParams,
  radiusOptions,
  roundCoordinate,
  sanitizeFilters,
  serializeExploreParams,
  widerRadiusKm,
  type ExploreFilters,
} from "./filters";

const parse = (qs: string, preset = {}) => parseExploreParams(new URLSearchParams(qs), preset);

/** Split an `exploreHref` back into a preset + params, like the routes do. */
function parseHref(href: string): ExploreFilters {
  const url = new URL(href, "http://x");
  const [, , city, category] = url.pathname.split("/");
  return parseExploreParams(url.searchParams, { city: city ?? null, category: category ?? null });
}

const full: ExploreFilters = {
  q: "sports massage",
  category: "physio",
  location: { kind: "near", lat: 53.349, lng: -6.26 },
  radiusKm: 50,
  available: "today",
  minPrice: 2000,
  maxPrice: 6000,
  deals: true,
};

describe("parseExploreParams", () => {
  it("returns defaults for empty params", () => {
    expect(parse("")).toEqual(DEFAULT_FILTERS);
  });

  it("parses every field", () => {
    expect(
      parse(
        "q=sports%20massage&category=physio&lat=53.349&lng=-6.26&radiusKm=50&available=today&minPrice=2000&maxPrice=6000&deals=true",
      ),
    ).toEqual(full);
  });

  it("falls back per field on garbage", () => {
    const f = parse(
      "q=%20%20yoga%20%20&category=Not%20A%20Slug!&city=../etc&lat=abc&lng=1e400&radiusKm=9999&available=tomorrow&minPrice=-5&maxPrice=12.5&deals=maybe",
    );
    expect(f).toEqual({ ...DEFAULT_FILTERS, q: "yoga" });
  });

  it("needs both coordinates, and in range", () => {
    expect(parse("lat=53.3").location).toEqual({ kind: "anywhere" });
    expect(parse("lat=95&lng=-6").location).toEqual({ kind: "anywhere" });
    expect(parse("lat=&lng=").location).toEqual({ kind: "anywhere" });
    expect(parse("lat=0&lng=0").location).toEqual({ kind: "near", lat: 0, lng: 0 });
  });

  it("prefers a point over a city, and a route preset over both", () => {
    expect(parse("city=dublin&lat=53&lng=-6").location).toEqual({ kind: "near", lat: 53, lng: -6 });
    expect(
      parse("city=dublin&lat=53&lng=-6&category=barber", { city: "galway", category: "physio" }),
    ).toMatchObject({
      location: { kind: "city", slug: "galway" },
      category: "physio",
    });
  });

  it("lower-cases slugs and caps the text query", () => {
    expect(parse("city=Galway&category=Car-Wash")).toMatchObject({
      location: { kind: "city", slug: "galway" },
      category: "car-wash",
    });
    expect(parse(`q=${"a".repeat(300)}`).q).toHaveLength(100);
  });

  it("swaps a reversed price range", () => {
    expect(parse("minPrice=5000&maxPrice=1000")).toMatchObject({ minPrice: 1000, maxPrice: 5000 });
  });

  it("drops a radius without a location or equal to the default", () => {
    expect(parse("radiusKm=50").radiusKm).toBeNull();
    expect(parse("city=cork&radiusKm=20").radiusKm).toBeNull();
    expect(parse("lat=53&lng=-6&radiusKm=25").radiusKm).toBeNull();
    expect(parse("city=cork&radiusKm=25").radiusKm).toBe(25);
  });

  it("accepts deals=1", () => {
    expect(parse("deals=1").deals).toBe(true);
  });
});

describe("serializeExploreParams / exploreHref", () => {
  it("omits defaults", () => {
    expect(serializeExploreParams(DEFAULT_FILTERS).toString()).toBe("");
    expect(exploreHref(DEFAULT_FILTERS)).toBe("/explore");
  });

  it("round-trips through the query string", () => {
    expect(parse(serializeExploreParams(full).toString())).toEqual(full);
    const city: ExploreFilters = { ...full, location: { kind: "city", slug: "cork" } };
    expect(parse(serializeExploreParams(city).toString())).toEqual(city);
  });

  it("puts a city and category in the path", () => {
    const f: ExploreFilters = {
      ...DEFAULT_FILTERS,
      category: "physio",
      location: { kind: "city", slug: "galway" },
      deals: true,
    };
    expect(exploreHref(f)).toBe("/explore/galway/physio?deals=true");
    expect(exploreHref({ ...f, category: null })).toBe("/explore/galway?deals=true");
    expect(exploreHref({ ...f, location: { kind: "anywhere" } })).toBe("/explore?category=physio&deals=true");
  });

  it("round-trips through the href", () => {
    for (const f of [
      full,
      { ...full, location: { kind: "city", slug: "limerick" } } as ExploreFilters,
      { ...full, category: null, location: { kind: "city", slug: "limerick" } } as ExploreFilters,
      { ...DEFAULT_FILTERS, q: "a b" },
    ]) {
      expect(parseHref(exploreHref(f))).toEqual(f);
    }
  });
});

describe("helpers", () => {
  it("counts panel filters and refinements", () => {
    expect(panelFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(panelFilterCount(full)).toBe(4);
    expect(hasRefinements(DEFAULT_FILTERS)).toBe(false);
    expect(hasRefinements({ ...DEFAULT_FILTERS, category: "salon" })).toBe(true);
  });

  it("clears refinements but keeps the location", () => {
    expect(clearRefinements(full)).toEqual({ ...DEFAULT_FILTERS, location: full.location, radiusKm: 50 });
  });

  it("knows the effective radius and wider options", () => {
    expect(effectiveRadiusKm(DEFAULT_FILTERS)).toBeNull();
    expect(effectiveRadiusKm({ ...DEFAULT_FILTERS, location: { kind: "city", slug: "cork" } })).toBe(20);
    expect(effectiveRadiusKm(full)).toBe(50);
    expect(radiusOptions({ kind: "city", slug: "cork" })).toEqual([5, 10, 20, 25, 50, 100, 200]);
    expect(radiusOptions({ kind: "near", lat: 0, lng: 0 })).toEqual([5, 10, 25, 50, 100, 200]);
    expect(widerRadiusKm(20)).toBe(50);
    expect(widerRadiusKm(100)).toBe(200);
    expect(widerRadiusKm(150)).toBe(200);
    expect(widerRadiusKm(200)).toBeNull();
  });

  it("drops an unknown category or city once meta is known", () => {
    const meta: MarketplaceMeta = {
      categories: [{ key: "physio", label: "Physiotherapy", plural: "Physiotherapists" }],
      cities: [
        { slug: "cork", name: "Cork", county: "Cork", latitude: 51.9, longitude: -8.47, listingCount: 3 },
      ],
    };
    const f: ExploreFilters = {
      ...DEFAULT_FILTERS,
      category: "knitting",
      location: { kind: "city", slug: "atlantis" },
      radiusKm: 50,
    };
    expect(sanitizeFilters(f, undefined)).toBe(f);
    expect(sanitizeFilters(f, meta)).toEqual(DEFAULT_FILTERS);
    const ok: ExploreFilters = { ...f, category: "physio", location: { kind: "city", slug: "cork" } };
    expect(sanitizeFilters(ok, meta)).toBe(ok);
  });

  it("rounds coordinates to about 100 m", () => {
    expect(roundCoordinate(53.349805)).toBe(53.35);
    expect(roundCoordinate(-6.26031)).toBe(-6.26);
  });
});
