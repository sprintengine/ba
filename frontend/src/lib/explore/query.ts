import type { MarketplaceSearchQuery } from "@/lib/api/types";
import { normalizeFilters, type ExploreFilters } from "./filters";

export const EXPLORE_PAGE_SIZE = 12;
/** The backend ignores shorter text queries; don't refetch for them either. */
export const MIN_QUERY_LENGTH = 2;

/** Filters → the marketplace search query (without the cursor). Only set keys are present. */
export function toMarketplaceQuery(
  filters: ExploreFilters,
  limit: number = EXPLORE_PAGE_SIZE,
): Omit<MarketplaceSearchQuery, "cursor"> {
  const f = normalizeFilters(filters);
  const query: Omit<MarketplaceSearchQuery, "cursor"> = {};
  if (f.q.length >= MIN_QUERY_LENGTH) query.q = f.q;
  if (f.category) query.category = f.category;
  if (f.location.kind === "city") query.city = f.location.slug;
  if (f.location.kind === "near") {
    query.lat = f.location.lat;
    query.lng = f.location.lng;
  }
  if (f.location.kind !== "anywhere" && f.radiusKm !== null) query.radiusKm = f.radiusKm;
  if (f.available !== "any") query.available = f.available;
  if (f.minPrice !== null) query.minPrice = f.minPrice;
  if (f.maxPrice !== null) query.maxPrice = f.maxPrice;
  if (f.deals) query.deals = true;
  query.limit = limit;
  return query;
}
