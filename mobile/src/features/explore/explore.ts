/** Explore's wording and icons (the website's explore-page helpers). Pure; tested in explore.test.ts. */
import {
  Activity,
  CarFront,
  Dumbbell,
  Flower2,
  GraduationCap,
  Music,
  PawPrint,
  Scissors,
  Smile,
  Sparkles,
  Stethoscope,
  Store,
} from "lucide-react-native";
import type { MarketplaceMeta } from "@shared/api/types";
import { effectiveRadiusKm, hasRefinements, type ExploreFilters } from "@shared/explore/filters";
import type { IconComponent } from "~/ui";

/** Category key → icon (the website's CATEGORY_ICONS, lucide-react-native); unknown keys get a shop. */
const CATEGORY_ICONS: Readonly<Record<string, IconComponent>> = {
  physio: Activity,
  "gp-practice": Stethoscope,
  dental: Smile,
  salon: Sparkles,
  barber: Scissors,
  massage: Flower2,
  fitness: Dumbbell,
  "music-lessons": Music,
  tutoring: GraduationCap,
  "car-wash": CarFront,
  "pet-grooming": PawPrint,
  other: Store,
};

export function categoryIcon(key: string | null | undefined): IconComponent {
  return (key && Object.hasOwn(CATEGORY_ICONS, key) ? CATEGORY_ICONS[key] : undefined) ?? Store;
}

function cityName(filters: ExploreFilters, meta: MarketplaceMeta | undefined, centerLabel: string | null) {
  const location = filters.location;
  if (location.kind !== "city") return null;
  return meta?.cities.find((c) => c.slug === location.slug)?.name ?? centerLabel ?? "your area";
}

/** "Physiotherapists in Galway · within 20 km", "Businesses near you · within 25 km", "Businesses across Ireland". */
export function describeScope(
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

export function emptyDescription(
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

/** What the location button says. */
export function locationLabel(filters: ExploreFilters, meta: MarketplaceMeta | undefined): string {
  const location = filters.location;
  if (location.kind === "near") return "Near you";
  if (location.kind === "city") return meta?.cities.find((c) => c.slug === location.slug)?.name ?? "City";
  return "All of Ireland";
}

/** Euro text ("12.50") → cents; empty → null; anything else → undefined (invalid). */
export function parseEuro(text: string): number | null | undefined {
  const t = text.trim().replace(/^€/, "").replace(",", ".");
  if (!t) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100);
}

/** Cents → euro text for an input ("12.5" → "12.50", whole euro without decimals). */
export function euroText(cents: number | null): string {
  if (cents === null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
