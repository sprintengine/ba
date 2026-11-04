import { describe, expect, it } from "vitest";
import type { MarketplaceMeta } from "@/lib/api/types";
import { exploreSeo, resolveExploreRoute } from "./seo";

const galway = {
  slug: "galway",
  name: "Galway",
  county: "Galway",
  latitude: 53.27,
  longitude: -9.06,
  listingCount: 4,
};
const bray = {
  slug: "bray",
  name: "Bray",
  county: "Wicklow",
  latitude: 53.2,
  longitude: -6.1,
  listingCount: 1,
};
const physio = { key: "physio", label: "Physiotherapy", plural: "Physiotherapists" };
const meta: MarketplaceMeta = { categories: [physio], cities: [galway, bray] };

describe("resolveExploreRoute", () => {
  it("validates the city and category", () => {
    expect(resolveExploreRoute(meta, "galway")).toEqual({ status: "ok", route: { city: galway } });
    expect(resolveExploreRoute(meta, "galway", "physio")).toEqual({
      status: "ok",
      route: { city: galway, category: physio },
    });
    expect(resolveExploreRoute(meta, "atlantis")).toEqual({ status: "not_found" });
    expect(resolveExploreRoute(meta, "galway", "knitting")).toEqual({ status: "not_found" });
  });

  it("is unavailable without meta (the page still renders)", () => {
    expect(resolveExploreRoute(null, "galway", "physio")).toEqual({ status: "unavailable" });
  });
});

describe("exploreSeo", () => {
  it("titles the category page", () => {
    expect(exploreSeo({ city: galway, category: physio })).toEqual({
      title: "Physiotherapists in Galway | bookanything",
      heading: "Physiotherapists in Galway",
      description: "Find physiotherapists in Galway. See next free times, prices and deals, and book online.",
      canonical: "/explore/galway/physio",
    });
  });

  it("titles the city page, naming the county when it differs", () => {
    const seo = exploreSeo({ city: bray });
    expect(seo.title).toBe("Book local businesses in Bray | bookanything");
    expect(seo.description).toContain("in Bray, Co. Wicklow.");
    expect(seo.canonical).toBe("/explore/bray");
  });

  it("titles the explore page", () => {
    expect(exploreSeo()).toMatchObject({
      title: "Explore businesses near you | bookanything",
      canonical: "/explore",
    });
  });
});
