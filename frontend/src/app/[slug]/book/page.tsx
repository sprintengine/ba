import type { Metadata } from "next";
import { getPublicBusiness, loadPublicBusinessPage } from "@/lib/api/server";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { siteSeo } from "@/lib/site/seo";
import { PublicBookingPage } from "@/components/public/public-booking-page";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (isReservedSlug(slug)) return {};
  const result = await getPublicBusiness(slug);
  if (result.status !== "ok") return { title: "Book online" };
  const b = result.data;
  const { description } = siteSeo(b);
  const title = `Book with ${b.name}`;
  return {
    title,
    description,
    alternates: { canonical: `/${b.slug}/book` },
    openGraph: { title, description, type: "website", siteName: b.name, url: `/${b.slug}/book` },
  };
}

/**
 * The booking flow. The business and its services are fetched server-side (together, for metadata, a proper 404
 * and a first paint that already lists the services); the flow itself is a client component. `?preview=1` skips
 * the server 404 so members can preview a draft.
 */
export default async function BusinessBookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  // Deals too: without a site, the portal is where they are shown.
  const page = await loadPublicBusinessPage(slug, await searchParams, { withOffers: true });
  return (
    <PublicBookingPage
      slug={slug}
      initialBusiness={page.business}
      initialServices={page.services}
      initialOffers={page.offers}
    />
  );
}
