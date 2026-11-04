import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { bookingDeepLink } from "@/lib/booking/url";
import { isReservedSlug } from "@/lib/reserved-slugs";
import type { MarketplaceMeta, PublicBusiness, PublicOffer, PublicService } from "./types";

/**
 * Server-side reads for metadata/SEO (server components, `generateMetadata`).
 * Talks to `BACKEND_ORIGIN` directly (the `/api` rewrite only exists for the
 * browser). Client components keep using the hooks in `@/lib/api/hooks`.
 */
const backendOrigin = () => (process.env.BACKEND_ORIGIN ?? "http://localhost:8080").replace(/\/$/, "");

export type ServerResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_found" }
  /** Backend unreachable or erroring — render the client page and let it retry. */
  | { status: "unavailable" };

async function serverGet<T>(path: string, revalidate: number): Promise<ServerResult<T>> {
  try {
    const res = await fetch(`${backendOrigin()}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate },
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "unavailable" };
    return { status: "ok", data: (await res.json()) as T };
  } catch {
    return { status: "unavailable" };
  }
}

/** Public business by slug, deduplicated per request (metadata + page share one call). */
export const getPublicBusiness = cache((slug: string) =>
  serverGet<PublicBusiness>(`/v1/public/businesses/${encodeURIComponent(slug)}`, 30),
);

/** Public services by slug (the site renders them server-side; the client refetches on mount). */
export const getPublicServices = cache((slug: string) =>
  serverGet<PublicService[]>(`/v1/public/businesses/${encodeURIComponent(slug)}/services`, 30),
);

/** A business's active deals (the site shows them under its hero; server-rendered so they don't push it down). */
export const getPublicOffers = cache((slug: string) =>
  serverGet<PublicOffer[]>(`/v1/public/businesses/${encodeURIComponent(slug)}/offers`, 30),
);

type SearchParams = Record<string, string | string[] | undefined>;

/** What the server hands a business's public page; null where the backend couldn't be reached (the client retries). */
export type PublicBusinessPage = {
  business: PublicBusiness | null;
  services: PublicService[] | null;
  offers: PublicOffer[] | null;
};

/**
 * Loads a business's public page (`/[slug]`, `/[slug]/book`): a reserved slug or an unknown business is a 404,
 * except with `?preview=1` (members previewing a draft business get the client page, which shows its own state).
 * `redirectDeepLinks` sends old booking deep links (`/[slug]?service=…`) to the booking flow first. Offers are
 * fetched only when `withOffers`.
 */
export async function loadPublicBusinessPage(
  slug: string,
  query: SearchParams,
  {
    withOffers = false,
    redirectDeepLinks = false,
  }: { withOffers?: boolean; redirectDeepLinks?: boolean } = {},
): Promise<PublicBusinessPage> {
  if (isReservedSlug(slug)) notFound();
  const deepLink = redirectDeepLinks ? bookingDeepLink(slug, query) : null;
  if (deepLink) redirect(deepLink);
  const [business, services, offers] = await Promise.all([
    getPublicBusiness(slug),
    getPublicServices(slug),
    withOffers ? getPublicOffers(slug) : null,
  ]);
  if (business.status === "not_found" && query.preview !== "1") notFound();
  return {
    business: business.status === "ok" ? business.data : null,
    services: services.status === "ok" ? services.data : null,
    offers: offers?.status === "ok" ? offers.data : null,
  };
}

/** Marketplace categories and cities (for `/explore` SEO pages and their metadata). */
export const getMarketplaceMeta = cache(() => serverGet<MarketplaceMeta>("/v1/public/marketplace/meta", 300));
