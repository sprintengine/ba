/** API types: Marketplace (architecture §18). Import them from `@/lib/api/types`. */
import type { Address, Branding } from "./business";
import type { Page } from "./common";
import type { PublicOffer, SlotOffer } from "./offers";

export type MarketplaceCategory = { key: string; label: string; plural: string };
export type MarketplaceCity = {
  slug: string;
  name: string;
  county: string;
  latitude: number;
  longitude: number;
  listingCount: number;
};
export type MarketplaceMeta = { categories: MarketplaceCategory[]; cities: MarketplaceCity[] };

export type MarketplaceAvailabilityFilter = "today" | "week";
export type MarketplaceSearchQuery = {
  q?: string;
  category?: string;
  /** City slug; alternatively lat + lng. */
  city?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  available?: MarketplaceAvailabilityFilter;
  /** `YYYY-MM-DD`: free times on this date. */
  date?: string;
  /** Cents. */
  minPrice?: number;
  maxPrice?: number;
  deals?: boolean;
  limit?: number;
  cursor?: string | null;
};

export type NextSlot = {
  start: string;
  serviceId: string;
  serviceName: string;
  optionId: string | null;
  optionName: string | null;
  priceCents: number;
  offer: SlotOffer | null;
};

export type Listing = {
  business: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    timezone: string;
    address: Address;
    branding: Branding;
    location: { latitude: number; longitude: number } | null;
  };
  category: MarketplaceCategory;
  distanceKm: number | null;
  /** Only once real reviews exist; always null for now. */
  rating: { average: number; count: number } | null;
  priceFromCents: number | null;
  currency: string;
  nextSlots: NextSlot[];
  deals: PublicOffer[];
};

export type MarketplaceSearchResult = Page<Listing> & {
  center: { latitude: number; longitude: number; radiusKm: number; label: string | null } | null;
};

export type LocationStatus = "located" | "pending" | "not_found" | "missing_address";
export type MarketplaceSettings = {
  listed: boolean;
  category: string;
  /** Pro and Business plans. */
  eligible: boolean;
  location: {
    latitude: number;
    longitude: number;
    /** How exactly the address was placed. */
    precision: "address" | "postcode" | "city";
    /** `mapbox` or `table`. */
    source: string;
    geocodedAt: string;
  } | null;
  locationStatus: LocationStatus;
  categories: MarketplaceCategory[];
};
export type MarketplaceSettingsInput = { listed: boolean; category?: string };
