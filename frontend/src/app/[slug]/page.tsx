import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPublicBusiness, loadPublicBusinessPage } from "@/lib/api/server";
import { bookingPortalPath } from "@/lib/booking/url";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { siteSeo } from "@/lib/site/seo";
import { PublicSitePage } from "@/components/public/public-site-page";

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
  const { title, description, image } = siteSeo(b);
  const images = image ? [{ url: image }] : undefined;
  return {
    // The site's own SEO title stands alone (no "· bookanything" suffix).
    title: { absolute: title },
    description,
    alternates: { canonical: `/${b.slug}` },
    openGraph: { title, description, type: "website", siteName: b.name, url: `/${b.slug}`, images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description },
  };
}

/**
 * Public site (§15.1): the business's published site plan rendered with its theme, leading into
 * the booking flow at `/[slug]/book`. Old booking deep links (`?service=…`) redirect there. Without websites
 * (`SITES_ENABLED` off, the default) the API sends no site and this short link goes straight to the booking portal.
 * `?preview=1` skips the server 404 so members can preview a draft business; `?site=draft`
 * shows owners their unpublished site draft.
 */
export default async function BusinessSitePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const page = await loadPublicBusinessPage(slug, query, { withOffers: true, redirectDeepLinks: true });
  if (page.business && !page.business.site) redirect(bookingPortalPath(slug, query));
  return (
    <PublicSitePage
      slug={slug}
      initialBusiness={page.business}
      initialServices={page.services}
      initialOffers={page.offers}
      showDraft={query.site === "draft"}
    />
  );
}
