import { vi } from "vitest";
import type { Listing, MarketplaceMeta, MarketplaceSearchResult } from "@/lib/api/types";

export const META: MarketplaceMeta = {
  categories: [
    { key: "physio", label: "Physiotherapy", plural: "Physiotherapists" },
    { key: "barber", label: "Barber", plural: "Barbers" },
    { key: "car-wash", label: "Car wash and valeting", plural: "Car washes" },
  ],
  cities: [
    {
      slug: "dublin",
      name: "Dublin",
      county: "Dublin",
      latitude: 53.3498,
      longitude: -6.2603,
      listingCount: 12,
    },
    {
      slug: "galway",
      name: "Galway",
      county: "Galway",
      latitude: 53.2707,
      longitude: -9.0568,
      listingCount: 1,
    },
  ],
};

export function listing(patch: Partial<Listing> & { name?: string; slug?: string } = {}): Listing {
  const { name = "Lumen Physiotherapy", slug = "lumen-physio", ...rest } = patch;
  return {
    business: {
      id: `b-${slug}`,
      slug,
      name,
      description: "Sports and back pain physio on Dame Street.",
      timezone: "Europe/Dublin",
      address: { line1: "1 Dame Street", line2: null, city: "Dublin", postcode: "D02" },
      branding: { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null },
      location: { latitude: 53.344, longitude: -6.266 },
    },
    category: { key: "physio", label: "Physiotherapy", plural: "Physiotherapists" },
    distanceKm: 1.24,
    rating: null,
    priceFromCents: 4500,
    currency: "EUR",
    nextSlots: [
      {
        start: "2026-10-01T14:00:00+01:00",
        serviceId: "s1",
        serviceName: "Assessment",
        optionId: null,
        optionName: null,
        priceCents: 6000,
        offer: null,
      },
      {
        start: "2026-10-02T13:30:00+01:00",
        serviceId: "s2",
        serviceName: "Follow-up",
        optionId: null,
        optionName: null,
        priceCents: 3600,
        offer: {
          id: "o1",
          name: "Quiet Tuesdays",
          label: "20% off",
          originalPriceCents: 4500,
          priceCents: 3600,
        },
      },
    ],
    deals: [
      {
        id: "o1",
        name: "Quiet afternoons",
        description: null,
        kind: "off_peak",
        discount: { type: "percent", percent: 20 },
        label: "20% off",
        summary: "Fri, 13:00–17:00",
        serviceIds: ["s2"],
        validUntil: null,
      },
    ],
    ...rest,
  };
}

export const page = (items: Listing[], nextCursor: string | null = null): MarketplaceSearchResult => ({
  items,
  nextCursor,
  center: null,
});

export const apiError = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ error: { code, message, fields: {} } }), { status });

type Route = (url: URL) => unknown;

/** Stub `fetch` for the marketplace endpoints. `search` receives the request URL (query included). */
export function mockMarketplace({ search, meta = () => META }: { search: Route; meta?: Route }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace(/^\/api/, "");
    const body =
      path === "/v1/public/marketplace/meta"
        ? meta(url)
        : path === "/v1/public/marketplace/search"
          ? search(url)
          : {};
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body ?? {}), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The query strings of every search request made so far. */
export function searchCalls(fetchMock: ReturnType<typeof mockMarketplace>): URLSearchParams[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), "http://localhost"))
    .filter((u) => u.pathname.endsWith("/marketplace/search"))
    .map((u) => u.searchParams);
}
