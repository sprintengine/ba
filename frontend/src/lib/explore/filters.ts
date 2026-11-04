import * as z from "zod";
import type { MarketplaceMeta } from "@/lib/api/types";

/**
 * Marketplace (`/explore`) filter state. It lives in the URL so every search is shareable:
 * a city (+ category) is the path (`/explore/galway/physio`), everything else is the query string.
 */

export type ExploreAvailability = "any" | "today" | "week";

export type ExploreLocation =
  { kind: "anywhere" } | { kind: "city"; slug: string } | { kind: "near"; lat: number; lng: number };

export type ExploreFilters = {
  q: string;
  category: string | null;
  location: ExploreLocation;
  /** Null = the backend default for the location (see `defaultRadiusKm`). Ignored without a location. */
  radiusKm: number | null;
  available: ExploreAvailability;
  /** Euro cents. */
  minPrice: number | null;
  maxPrice: number | null;
  deals: boolean;
};

/** A city/category fixed by the route (`/explore/[city]/[category]`); it wins over the query string. */
export type ExplorePreset = { city?: string | null; category?: string | null };

export const MAX_QUERY_LENGTH = 100;
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 200;
export const CITY_RADIUS_KM = 20;
export const NEAR_RADIUS_KM = 25;
const MAX_PRICE_CENTS = 10_000_000;

export const DEFAULT_FILTERS: ExploreFilters = {
  q: "",
  category: null,
  location: { kind: "anywhere" },
  radiusKm: null,
  available: "any",
  minPrice: null,
  maxPrice: null,
  deals: false,
};

/** The radius the backend uses when none is sent: 20 km around a city, 25 km around a point. */
export function defaultRadiusKm(location: ExploreLocation): number | null {
  if (location.kind === "city") return CITY_RADIUS_KM;
  if (location.kind === "near") return NEAR_RADIUS_KM;
  return null;
}

/** The radius actually searched (null when there is no location). */
export function effectiveRadiusKm(filters: ExploreFilters): number | null {
  return filters.location.kind === "anywhere"
    ? null
    : (filters.radiusKm ?? defaultRadiusKm(filters.location));
}

// ---------------------------------------------------------------------------
// Parsing: every field falls back to its default on garbage, independently.
// ---------------------------------------------------------------------------

const decimal = z
  .string()
  .trim()
  .regex(/^-?\d{1,7}(\.\d{1,10})?$/)
  .transform(Number);
const between = (min: number, max: number) => decimal.pipe(z.number().min(min).max(max));
const cents = z
  .string()
  .trim()
  .regex(/^\d{1,9}$/)
  .transform(Number)
  .pipe(z.number().int().min(0).max(MAX_PRICE_CENTS));
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);

const paramsSchema = z.object({
  q: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH).trim())
    .catch(""),
  category: slug.nullable().catch(null),
  city: slug.nullable().catch(null),
  lat: between(-90, 90).nullable().catch(null),
  lng: between(-180, 180).nullable().catch(null),
  radiusKm: between(MIN_RADIUS_KM, MAX_RADIUS_KM).nullable().catch(null),
  available: z.enum(["any", "today", "week"]).catch("any"),
  minPrice: cents.nullable().catch(null),
  maxPrice: cents.nullable().catch(null),
  deals: z
    .enum(["true", "1"])
    .transform(() => true)
    .catch(false),
});

type ParamsLike = Pick<URLSearchParams, "get">;

/** Parse search params (plus a route preset) into filters. Never throws; bad values become defaults. */
export function parseExploreParams(params: ParamsLike, preset: ExplorePreset = {}): ExploreFilters {
  const raw = Object.fromEntries(Object.keys(paramsSchema.shape).map((key) => [key, params.get(key)]));
  const p = paramsSchema.parse(raw);
  const presetCity = preset.city ? slug.safeParse(preset.city) : null;
  const presetCategory = preset.category ? slug.safeParse(preset.category) : null;

  // The backend prefers a point over a city, so do we (the UI never sets both).
  const location: ExploreLocation = presetCity?.success
    ? { kind: "city", slug: presetCity.data }
    : p.lat !== null && p.lng !== null
      ? { kind: "near", lat: p.lat, lng: p.lng }
      : p.city
        ? { kind: "city", slug: p.city }
        : { kind: "anywhere" };

  const [minPrice, maxPrice] =
    p.minPrice !== null && p.maxPrice !== null && p.maxPrice < p.minPrice
      ? [p.maxPrice, p.minPrice]
      : [p.minPrice, p.maxPrice];

  return normalizeFilters({
    q: p.q,
    category: presetCategory?.success ? presetCategory.data : p.category,
    location,
    radiusKm: p.radiusKm,
    available: p.available,
    minPrice,
    maxPrice,
    deals: p.deals,
  });
}

/** Drop values that mean "default" so equal searches have equal URLs. */
export function normalizeFilters(filters: ExploreFilters): ExploreFilters {
  const q = filters.q.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH).trim();
  const radius =
    filters.radiusKm === null || filters.location.kind === "anywhere"
      ? null
      : Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, filters.radiusKm));
  return {
    ...filters,
    q,
    radiusKm: radius === defaultRadiusKm(filters.location) ? null : radius,
  };
}

// ---------------------------------------------------------------------------
// Serializing
// ---------------------------------------------------------------------------

/** Filters → search params, omitting defaults. City and category are included (see `exploreHref`). */
export function serializeExploreParams(filters: ExploreFilters): URLSearchParams {
  const f = normalizeFilters(filters);
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.category) params.set("category", f.category);
  if (f.location.kind === "city") params.set("city", f.location.slug);
  if (f.location.kind === "near") {
    params.set("lat", String(f.location.lat));
    params.set("lng", String(f.location.lng));
  }
  if (f.radiusKm !== null) params.set("radiusKm", String(f.radiusKm));
  if (f.available !== "any") params.set("available", f.available);
  if (f.minPrice !== null) params.set("minPrice", String(f.minPrice));
  if (f.maxPrice !== null) params.set("maxPrice", String(f.maxPrice));
  if (f.deals) params.set("deals", "true");
  return params;
}

/**
 * The canonical URL for a search: `/explore/{city}[/{category}]?…` when a city is chosen (the SEO pages),
 * else `/explore?…`.
 */
export function exploreHref(filters: ExploreFilters): string {
  const params = serializeExploreParams(filters);
  let path = "/explore";
  if (filters.location.kind === "city") {
    path += `/${encodeURIComponent(filters.location.slug)}`;
    params.delete("city");
    if (filters.category) {
      path += `/${encodeURIComponent(filters.category)}`;
      params.delete("category");
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

// ---------------------------------------------------------------------------
// Helpers for the UI
// ---------------------------------------------------------------------------

/** Filters outside the search box, category chips and location (the "Filters" panel). */
export function panelFilterCount(filters: ExploreFilters): number {
  return (
    Number(filters.available !== "any") +
    Number(filters.minPrice !== null || filters.maxPrice !== null) +
    Number(filters.deals) +
    Number(filters.radiusKm !== null)
  );
}

/** Anything narrowing the search besides the location. */
export function hasRefinements(filters: ExploreFilters): boolean {
  return (
    !!filters.q ||
    !!filters.category ||
    filters.available !== "any" ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.deals
  );
}

/** Keep the location and radius, reset everything else. */
export function clearRefinements(filters: ExploreFilters): ExploreFilters {
  return { ...DEFAULT_FILTERS, location: filters.location, radiusKm: filters.radiusKm };
}

export const RADIUS_OPTIONS_KM = [5, 10, 25, 50, 100, 200] as const;

/** Radius choices for a location, including its default. */
export function radiusOptions(location: ExploreLocation): number[] {
  const fallback = defaultRadiusKm(location);
  const all = new Set<number>([...RADIUS_OPTIONS_KM, ...(fallback ? [fallback] : [])]);
  return [...all].sort((a, b) => a - b);
}

/** A noticeably wider radius (about double), or null when already at the maximum. */
export function widerRadiusKm(current: number): number | null {
  if (current >= MAX_RADIUS_KM) return null;
  return RADIUS_OPTIONS_KM.find((r) => r >= current * 2) ?? MAX_RADIUS_KM;
}

/**
 * Drop a category or city the backend doesn't know (a hand-edited or stale link) once the meta has loaded,
 * so the search still works instead of failing with `INVALID_REQUEST`.
 */
export function sanitizeFilters(filters: ExploreFilters, meta: MarketplaceMeta | undefined): ExploreFilters {
  if (!meta) return filters;
  const categoryOk = !filters.category || meta.categories.some((c) => c.key === filters.category);
  const location = filters.location;
  const cityOk = location.kind !== "city" || meta.cities.some((c) => c.slug === location.slug);
  if (categoryOk && cityOk) return filters;
  return normalizeFilters({
    ...filters,
    category: categoryOk ? filters.category : null,
    location: cityOk ? location : { kind: "anywhere" },
  });
}

/** Round a device position to about 100 m before it goes into a shareable URL. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}
