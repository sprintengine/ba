"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  exploreHref,
  normalizeFilters,
  parseExploreParams,
  type ExploreFilters,
  type ExplorePreset,
} from "@/lib/explore";

/**
 * Explore filters from the URL (path preset + search params). `navigate` replaces the URL with the canonical one
 * for new filters, so a city change moves between `/explore/{city}` pages. Needs a `<Suspense>` boundary.
 */
export function useExploreFilters(preset: ExplorePreset) {
  const params = useSearchParams();
  const { city, category } = preset;
  const filters = useMemo(() => parseExploreParams(params, { city, category }), [params, city, category]);
  const navigate = useExploreNavigate();
  return { filters, navigate };
}

/** Shows `next` filters on Explore: replaces the URL with their canonical one (a city has its own page). */
export function useExploreNavigate() {
  const router = useRouter();
  return useCallback(
    (next: ExploreFilters) => router.replace(exploreHref(normalizeFilters(next)), { scroll: false }),
    [router],
  );
}
