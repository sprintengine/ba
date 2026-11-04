import type { Listing, MarketplaceSearchResult } from "@/lib/api/types";

/** The search centre from the first results page (`searchCenter(pages)`). */
export type ExploreMapCenter = NonNullable<MarketplaceSearchResult["center"]>;

/**
 * Map seam for `/explore`. A map implementation takes the loaded listings (those with
 * `business.location` can be plotted) and the search centre + radius, and reports pin selection.
 *
 * To add a map later: write a client component with this signature (lazy-load the map library with
 * `next/dynamic`, `ssr: false`), keep colours to design tokens, give every pin an accessible name,
 * and render it from `ExplorePage` next to the results. Until then nothing renders a map and there
 * is no map dependency.
 */
export type ExploreMapProps = {
  listings: Listing[];
  center: ExploreMapCenter | null;
  /** The business id whose pin/card is highlighted. */
  selectedId?: string | null;
  onSelect?: (businessId: string) => void;
  className?: string;
};

export type ExploreMapComponent = (props: ExploreMapProps) => React.ReactNode;

/** Null implementation: renders nothing. Not mounted anywhere by default. */
export const ExploreMap: ExploreMapComponent = () => null;
