import type { MarketplaceCategory, MarketplaceCity, MarketplaceMeta } from "@/lib/api/types";

export type ExploreRoute = { city?: MarketplaceCity | null; category?: MarketplaceCategory | null };

export type ExploreRouteResult =
  | { status: "ok"; route: ExploreRoute }
  | { status: "not_found" }
  /** Meta couldn't be loaded: render the explorer anyway with generic copy. */
  | { status: "unavailable" };

/** Validate `/explore/[city]/[category]` segments against the marketplace meta. */
export function resolveExploreRoute(
  meta: MarketplaceMeta | null,
  citySlug: string,
  categoryKey?: string,
): ExploreRouteResult {
  if (!meta) return { status: "unavailable" };
  const city = meta.cities.find((c) => c.slug === citySlug);
  if (!city) return { status: "not_found" };
  if (categoryKey === undefined) return { status: "ok", route: { city } };
  const category = meta.categories.find((c) => c.key === categoryKey);
  return category ? { status: "ok", route: { city, category } } : { status: "not_found" };
}

export type ExploreSeo = { title: string; heading: string; description: string; canonical: string };

const SUFFIX = " | bookanything";
const PITCH = "See next free times, prices and deals, and book online.";

/** Title, H1, description and canonical path for an explore page. */
export function exploreSeo({ city, category }: ExploreRoute = {}): ExploreSeo {
  if (city && category) {
    const heading = `${category.plural} in ${city.name}`;
    return {
      title: heading + SUFFIX,
      heading,
      description: `Find ${category.plural.toLowerCase()} in ${placeName(city)}. ${PITCH}`,
      canonical: `/explore/${city.slug}/${category.key}`,
    };
  }
  if (city) {
    const heading = `Book local businesses in ${city.name}`;
    return {
      title: heading + SUFFIX,
      heading,
      description: `Physios, salons, barbers, car washes and more in ${placeName(city)}. ${PITCH}`,
      canonical: `/explore/${city.slug}`,
    };
  }
  const heading = "Explore businesses near you";
  return {
    title: heading + SUFFIX,
    heading,
    description: `Find something to book near you, from physios and salons to car washes and music lessons. ${PITCH}`,
    canonical: "/explore",
  };
}

/** "Galway" or "Bray, Co. Wicklow". */
function placeName(city: MarketplaceCity): string {
  return city.county && city.county !== city.name ? `${city.name}, Co. ${city.county}` : city.name;
}
