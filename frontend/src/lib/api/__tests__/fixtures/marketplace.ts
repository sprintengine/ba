/** Marketplace (§18) and OAuth consent (§20) fixtures. */
import type {
  AuthorizeCheck,
  ConnectedApp,
  Listing,
  MarketplaceSearchResult,
  MarketplaceSettings,
  NextSlot,
} from "@/lib/api/types";
import { publicBusiness } from "./business";
import { ids } from "./ids";
import { publicOffer, publicOfferSparse, slotOffer } from "./offers";

const physio = { key: "physio", label: "Physiotherapy", plural: "Physiotherapists" };

export const nextSlot = {
  start: "2026-10-06T13:00:00+01:00",
  serviceId: ids.service,
  serviceName: "Initial assessment",
  optionId: ids.option,
  optionName: "Extended",
  priceCents: 5_600,
  offer: slotOffer,
} satisfies NextSlot;

export const listing = {
  business: {
    id: ids.business,
    slug: publicBusiness.slug,
    name: publicBusiness.name,
    description: publicBusiness.description,
    timezone: publicBusiness.timezone,
    address: publicBusiness.address,
    branding: publicBusiness.branding,
    location: { latitude: 53.3398, longitude: -6.2393 },
  },
  category: physio,
  distanceKm: 1.4,
  rating: { average: 4.8, count: 25 },
  priceFromCents: 4_500,
  currency: "EUR",
  nextSlots: [nextSlot],
  deals: [publicOffer],
} satisfies Listing;

export const listingSparse = {
  ...listing,
  business: {
    ...listing.business,
    description: null,
    address: { line1: null, line2: null, city: null, postcode: null },
    branding: { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null },
    location: null,
  },
  distanceKm: null,
  rating: null,
  priceFromCents: null,
  nextSlots: [{ ...nextSlot, optionId: null, optionName: null, offer: null }],
  deals: [publicOfferSparse],
} satisfies Listing;

export const marketplaceSearchResult = {
  items: [listing],
  nextCursor: "c_2",
  center: { latitude: 53.3498, longitude: -6.2603, radiusKm: 10, label: "Dublin" },
} satisfies MarketplaceSearchResult;

export const marketplaceSearchResultSparse = {
  items: [listingSparse],
  nextCursor: null,
  center: null,
} satisfies MarketplaceSearchResult;

export const marketplaceSettings = {
  listed: true,
  category: "physio",
  eligible: true,
  location: {
    latitude: 53.3398,
    longitude: -6.2393,
    precision: "address",
    source: "mapbox",
    geocodedAt: "2026-09-01T10:00:00Z",
  },
  locationStatus: "located",
  categories: [physio],
} satisfies MarketplaceSettings;

export const marketplaceSettingsSparse = {
  ...marketplaceSettings,
  listed: false,
  location: null,
  locationStatus: "missing_address",
} satisfies MarketplaceSettings;

export const authorizeConsent = {
  type: "consent",
  client: {
    clientId: "client_claude",
    name: "Claude",
    uri: "https://claude.ai",
    kind: "dynamic",
    redirectUri: "https://claude.ai/api/mcp/auth_callback",
    redirectHost: "claude.ai",
    localOnly: false,
  },
  scopes: [{ key: "bookings:read", label: "See your bookings", description: "Read bookings and customers." }],
  resource: "https://api.bookanything.test/mcp",
  audience: "customer",
  user: { email: "avery@example.test", name: "Avery Morgan" },
  previouslyApproved: false,
  businesses: [{ name: "Lumen Physiotherapy", slug: "lumen-physio", role: "owner", aiAgentsAllowed: true }],
} satisfies AuthorizeCheck;

const { businesses: _businesses, ...consentFields } = authorizeConsent;

export const authorizeConsentSparse = {
  ...consentFields,
  client: { ...authorizeConsent.client, uri: null },
  user: { email: null, name: null },
} satisfies AuthorizeCheck;

export const authorizeRedirect = {
  type: "redirect",
  redirectTo: "https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz",
} satisfies AuthorizeCheck;

export const connectedApp = {
  id: "00000000-0000-4000-8000-000000000090",
  clientId: "client_claude",
  name: "Claude",
  clientUri: "https://claude.ai",
  kind: "dynamic",
  redirectHost: "claude.ai",
  audience: "customer",
  scopes: authorizeConsent.scopes,
  connectedAt: "2026-09-10T10:00:00Z",
  lastUsedAt: "2026-09-30T18:00:00Z",
} satisfies ConnectedApp;

export const connectedAppSparse = {
  ...connectedApp,
  clientUri: null,
  lastUsedAt: null,
} satisfies ConnectedApp;
