/**
 * The marketplace's WebMCP tools (`/explore`): an AI agent in the visitor's browser searches businesses with the page's
 * own filters, so the visitor sees the results it reads, and opens a business's page or booking flow, where the
 * booking tools take over. Registered by Explore's layout (`explore-agent-tools-host.tsx`), so a search that moves to
 * a city's page doesn't unregister them mid-call; loaded only in browsers with WebMCP.
 */
import type { QueryClient } from "@tanstack/react-query";
import { marketplaceApi } from "@/lib/api/marketplace";
import { MARKETPLACE_SEARCH_STALE_MS, marketplaceSearchQuery } from "@/lib/api/hooks/use-marketplace";
import type { Listing, MarketplaceMeta } from "@/lib/api/types";
import { readInput } from "@/lib/booking/agent";
import { shortAddress } from "@/lib/booking/booking";
import { DEFAULT_FILTERS, toMarketplaceQuery, type ExploreFilters } from "@/lib/explore";
import { formatMoney, toPlainDate, toTimeOfDay } from "@/lib/format";
import { toolOutput, type ModelContextTool } from "@/lib/webmcp/model-context";

/** What the tools read of the page as last rendered, and how they change it. */
export type ExploreAgentPage = {
  meta: MarketplaceMeta | undefined;
  /** Shows these filters on Explore (its URL), as the visitor changing them would. */
  navigate: (filters: ExploreFilters) => void;
  /** Goes to a page of the site. */
  open: (href: string) => void;
  queryClient: QueryClient;
};

type Deps = { page: () => ExploreAgentPage; registration: AbortSignal };

/** A business's slug, as the backend accepts them. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const LEFT = { error: "The page was left, so nothing was searched." };

export function exploreAgentTools(deps: Deps): ModelContextTool[] {
  return [searchBusinesses(deps), openBusiness(deps)];
}

const listingSchema = {
  type: "object",
  properties: {
    slug: { type: "string" },
    name: { type: "string" },
    category: { type: "string" },
    address: { type: ["string", "null"] },
    distanceKm: { type: ["number", "null"] },
    priceFrom: { type: ["string", "null"] },
    nextFreeTimes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          time: { type: "string" },
          service: { type: "string" },
          price: { type: "string" },
          deal: { type: ["string", "null"] },
        },
        required: ["date", "time", "service", "price", "deal"],
      },
    },
    deals: { type: "array", items: { type: "string" } },
  },
  required: ["slug", "name", "category", "address", "distanceKm", "priceFrom", "nextFreeTimes", "deals"],
} as const;

function searchBusinesses({ page, registration }: Deps): ModelContextTool {
  return {
    name: "search_businesses",
    title: "Search businesses",
    description:
      "Searches the businesses listed on bookanything in Ireland and shows the results on this page. All filters " +
      "are optional; a search replaces the page's current filters. Each result has the business's slug (for " +
      "open_business), category, address, distance, from-price, its next free times and its deals. An unknown " +
      "category or city returns the ones there are.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A business name, a service or what the visitor needs." },
        category: { type: "string", description: 'Category key, e.g. "physio".' },
        city: { type: "string", description: 'City slug, e.g. "galway".' },
        available: {
          type: "string",
          enum: ["any", "today", "week"],
          description: "Only businesses with a free time today or this week.",
        },
        dealsOnly: { type: "boolean", description: "Only businesses with an active deal." },
      },
    },
    outputSchema: toolOutput(
      {
        shown: { type: "string" },
        results: { type: "array", items: listingSchema },
        more: { type: "boolean" },
        categories: { type: "array", items: { type: "string" } },
        cities: { type: "array", items: { type: "string" } },
      },
      ["shown", "results", "more"],
    ),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, { signal }) => {
      const read = readInput(input);
      const query = read.string("query") ?? "";
      const category = read.string("category");
      const city = read.string("city");
      const available = read.string("available") ?? "any";
      const deals = read.boolean("dealsOnly") ?? false;
      if (read.problems.length) return { error: read.problems.join("; ") };
      if (available !== "any" && available !== "today" && available !== "week")
        return { error: "available must be any, today or week." };
      const meta = page().meta ?? (await marketplaceApi.meta({ signal }));
      if (category && !meta.categories.some((c) => c.key === category))
        return { error: `Unknown category ${category}.`, categories: meta.categories.map((c) => c.key) };
      if (city && !meta.cities.some((c) => c.slug === city))
        return { error: `Unknown city ${city}.`, cities: meta.cities.map((c) => c.slug) };
      // Left Explore while the categories loaded: don't pull the visitor back.
      if (registration.aborted) return LEFT;

      const filters: ExploreFilters = {
        ...DEFAULT_FILTERS,
        q: query,
        category,
        location: city ? { kind: "city", slug: city } : { kind: "anywhere" },
        available,
        deals,
      };
      const { navigate, queryClient } = page();
      navigate(filters);
      // The page's own query (same key, page size and cache), so the agent reads what the visitor sees.
      const data = await queryClient.infiniteQuery({
        ...marketplaceSearchQuery(toMarketplaceQuery(filters)),
        staleTime: MARKETPLACE_SEARCH_STALE_MS,
      });
      const first = data.pages[0];
      return {
        shown: "The page shows these results; the visitor can open any of them.",
        results: (first?.items ?? []).map(listingSummary),
        more: first?.nextCursor != null,
      };
    },
  };
}

/** One result in words: times in the business's zone, prices formatted. */
export function listingSummary(l: Listing) {
  const tz = l.business.timezone;
  const money = (cents: number) => (cents === 0 ? "Free" : formatMoney(cents, l.currency));
  return {
    slug: l.business.slug,
    name: l.business.name,
    category: l.category.label,
    address: shortAddress(l.business.address) || null,
    distanceKm: l.distanceKm,
    priceFrom: l.priceFromCents == null ? null : money(l.priceFromCents),
    nextFreeTimes: l.nextSlots.map((s) => ({
      date: toPlainDate(s.start, tz),
      time: toTimeOfDay(s.start, tz),
      service: s.optionName ? `${s.serviceName} (${s.optionName})` : s.serviceName,
      price: money(s.offer?.priceCents ?? s.priceCents),
      deal: s.offer?.label ?? null,
    })),
    deals: l.deals.map((d) => `${d.name}: ${d.label}`),
  };
}

function openBusiness({ page }: Deps): ModelContextTool {
  return {
    name: "open_business",
    title: "Open a business",
    description:
      "Opens a business's page on bookanything, or its booking page (book: true), where the visitor sees its " +
      "services and the booking tools let you find a time and fill in the booking with them.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The business's slug from search_businesses." },
        book: { type: "boolean", description: "Open its booking page instead of its home page." },
      },
      required: ["slug"],
    },
    outputSchema: toolOutput({ opened: { type: "string" }, next: { type: "string" } }, ["opened", "next"]),
    execute: (input) => {
      const read = readInput(input);
      const slug = read.string("slug");
      const book = read.boolean("book") ?? false;
      if (read.problems.length) return { error: read.problems.join("; ") };
      if (!slug || !SLUG.test(slug))
        return { error: "slug must be a business's slug from search_businesses." };
      const href = book ? `/${slug}/book` : `/${slug}`;
      page().open(href);
      return {
        opened: href,
        next: book
          ? "The booking page is opening: use its tools (get_booking_options first)."
          : "The business's page is opening; open_business with book: true goes to its booking page.",
      };
    },
  };
}
