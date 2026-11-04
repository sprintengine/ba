"use client";

import { useCallback } from "react";
import { searchCenter, useMarketplaceMeta, useMarketplaceSearch } from "@/lib/api/hooks/use-marketplace";
import type { MarketplaceMeta, MarketplaceSearchResult } from "@/lib/api/types";
import {
  DEFAULT_FILTERS,
  clearRefinements,
  effectiveRadiusKm,
  hasRefinements,
  panelFilterCount,
  roundCoordinate,
  sanitizeFilters,
  toMarketplaceQuery,
  widerRadiusKm,
  type ExploreFilters,
  type ExplorePreset,
} from "@/lib/explore";
import { Button } from "@/components/ui/button";
import { CategoryChips } from "./category-chips";
import { ExploreResults, type EmptySuggestion } from "./explore-results";
import { FiltersPanel } from "./filters-panel";
import { LocationPicker } from "./location-picker";
import { MobileFilters } from "./mobile-filters";
import { SearchBox } from "./search-box";
import { useExploreFilters } from "./use-explore-filters";
import { useGeolocation } from "./use-geolocation";

const PANEL_DEFAULTS = {
  available: "any",
  minPrice: null,
  maxPrice: null,
  deals: false,
  radiusKm: null,
} satisfies Partial<ExploreFilters>;

/**
 * The public marketplace: search, category chips, city / "Near me", filters and paginated results.
 * All state is in the URL (see `lib/explore/filters.ts`). Render inside `<Suspense>` (it reads search params).
 */
export function ExplorePage({ preset = {} }: { preset?: ExplorePreset }) {
  const { filters: fromUrl, navigate } = useExploreFilters(preset);
  const meta = useMarketplaceMeta();
  const filters = sanitizeFilters(fromUrl, meta.data);
  const search = useMarketplaceSearch(toMarketplaceQuery(filters));

  const change = useCallback(
    (patch: Partial<ExploreFilters>) => navigate({ ...filters, ...patch }),
    [filters, navigate],
  );
  const geo = useGeolocation(({ latitude, longitude }) =>
    change({
      location: { kind: "near", lat: roundCoordinate(latitude), lng: roundCoordinate(longitude) },
      radiusKm: null,
    }),
  );

  // The infinite-query options type pages as `Page<Listing>`; the search endpoint returns the wider result.
  const pages = search.data?.pages as MarketplaceSearchResult[] | undefined;
  const centerLabel = searchCenter(pages)?.label ?? null;
  const scope = describeScope(filters, meta.data, centerLabel);
  const radius = effectiveRadiusKm(filters);
  const wider = radius !== null ? widerRadiusKm(radius) : null;
  const panelCount = panelFilterCount(filters);

  const suggestions: EmptySuggestion[] = [];
  if (hasRefinements(filters))
    suggestions.push({ label: "Clear filters", onSelect: () => navigate(clearRefinements(filters)) });
  if (wider !== null)
    suggestions.push({ label: `Widen to ${wider} km`, onSelect: () => change({ radiusKm: wider }) });
  if (filters.location.kind !== "anywhere") {
    suggestions.push({
      label: "Search all of Ireland",
      onSelect: () => change({ location: { kind: "anywhere" }, radiusKm: null }),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <SearchBox className="md:flex-1" value={filters.q} onCommit={(q) => change({ q })} />
        <LocationPicker
          cities={meta.data?.cities}
          location={filters.location}
          onCityChange={(slug) => {
            geo.dismiss();
            change({ location: slug ? { kind: "city", slug } : { kind: "anywhere" }, radiusKm: null });
          }}
          onNearMe={geo.locate}
          geolocation={geo.state}
          onDismissError={geo.dismiss}
        />
      </div>

      <CategoryChips
        categories={meta.data?.categories}
        loading={meta.isPending}
        value={filters.category}
        onValueChange={(category) => change({ category })}
      />

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <aside aria-labelledby="explore-filters-title" className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-5">
            <div className="flex h-8 items-center justify-between">
              <h2 id="explore-filters-title" className="text-sm font-semibold">
                Filters
              </h2>
              {panelCount > 0 && (
                <Button variant="link" size="sm" onClick={() => change(PANEL_DEFAULTS)}>
                  Clear
                </Button>
              )}
            </div>
            <FiltersPanel filters={filters} onChange={change} />
          </div>
        </aside>

        <section aria-labelledby="explore-results-title" className="@container flex min-w-0 flex-col gap-4">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <h2 id="explore-results-title" className="text-sm font-medium text-muted-foreground">
              {scope}
            </h2>
            <MobileFilters
              filters={filters}
              activeCount={panelCount}
              onChange={change}
              onClear={() => change(PANEL_DEFAULTS)}
            />
          </div>
          <ExploreResults
            search={search}
            emptyDescription={emptyDescription(filters, meta.data, centerLabel)}
            suggestions={suggestions}
            onReset={() => navigate(DEFAULT_FILTERS)}
          />
        </section>
      </div>
    </div>
  );
}

function cityName(filters: ExploreFilters, meta: MarketplaceMeta | undefined, centerLabel: string | null) {
  const location = filters.location;
  if (location.kind !== "city") return null;
  return meta?.cities.find((c) => c.slug === location.slug)?.name ?? centerLabel ?? "your area";
}

/** "Physiotherapists in Galway · within 20 km", "Businesses near you · within 25 km", "Businesses across Ireland". */
function describeScope(
  filters: ExploreFilters,
  meta: MarketplaceMeta | undefined,
  centerLabel: string | null,
): string {
  const subject = meta?.categories.find((c) => c.key === filters.category)?.plural ?? "Businesses";
  const radius = effectiveRadiusKm(filters);
  switch (filters.location.kind) {
    case "anywhere":
      return `${subject} across Ireland`;
    case "near":
      return `${subject} near you · within ${radius} km`;
    case "city":
      return `${subject} in ${cityName(filters, meta, centerLabel)} · within ${radius} km`;
  }
}

function emptyDescription(
  filters: ExploreFilters,
  meta: MarketplaceMeta | undefined,
  centerLabel: string | null,
): string {
  const refined = hasRefinements(filters);
  const radius = effectiveRadiusKm(filters);
  const what = refined ? "matches your search" : "is listed yet";
  switch (filters.location.kind) {
    case "anywhere":
      return refined
        ? "No listed business matches your search."
        : "No businesses are listed yet. Check back soon.";
    case "near":
      return `Nothing within ${radius} km of you ${what}.`;
    case "city":
      return `Nothing within ${radius} km of ${cityName(filters, meta, centerLabel)} ${what}.`;
  }
}
