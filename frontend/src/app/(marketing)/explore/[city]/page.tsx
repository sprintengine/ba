import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getMarketplaceMeta } from "@/lib/api/server";
import { exploreSeo, resolveExploreRoute } from "@/lib/explore/seo";
import { ExploreFallback, ExploreLayout } from "@/components/explore/explore-hero";
import { ExplorePage } from "@/components/explore/explore-page";

type Props = { params: Promise<{ city: string }> };

async function resolve(city: string) {
  const meta = await getMarketplaceMeta();
  return resolveExploreRoute(meta.status === "ok" ? meta.data : null, city);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city } = await params;
  const result = await resolve(city);
  if (result.status === "not_found") return {};
  const seo = exploreSeo(result.status === "ok" ? result.route : undefined);
  const canonical = result.status === "ok" ? seo.canonical : `/explore/${encodeURIComponent(city)}`;
  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical },
    openGraph: { title: seo.title, description: seo.description, url: canonical, type: "website" },
  };
}

/** `/explore/{city}`: listed businesses in and around a city (SEO landing page for the explorer). */
export default async function ExploreCityRoute({ params }: Props) {
  const { city } = await params;
  const result = await resolve(city);
  if (result.status === "not_found") notFound();
  const seo = exploreSeo(result.status === "ok" ? result.route : undefined);
  return (
    <ExploreLayout title={seo.heading}>
      <Suspense fallback={<ExploreFallback />}>
        <ExplorePage preset={{ city }} />
      </Suspense>
    </ExploreLayout>
  );
}
