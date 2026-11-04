import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getMarketplaceMeta } from "@/lib/api/server";
import { exploreSeo, resolveExploreRoute } from "@/lib/explore/seo";
import { ExploreFallback, ExploreLayout } from "@/components/explore/explore-hero";
import { ExplorePage } from "@/components/explore/explore-page";

type Props = { params: Promise<{ city: string; category: string }> };

async function resolve(city: string, category: string) {
  const meta = await getMarketplaceMeta();
  return resolveExploreRoute(meta.status === "ok" ? meta.data : null, city, category);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city, category } = await params;
  const result = await resolve(city, category);
  if (result.status === "not_found") return {};
  const seo = exploreSeo(result.status === "ok" ? result.route : undefined);
  const canonical =
    result.status === "ok"
      ? seo.canonical
      : `/explore/${encodeURIComponent(city)}/${encodeURIComponent(category)}`;
  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical },
    openGraph: { title: seo.title, description: seo.description, url: canonical, type: "website" },
  };
}

/** `/explore/{city}/{category}`, e.g. "Physiotherapists in Galway". */
export default async function ExploreCityCategoryRoute({ params }: Props) {
  const { city, category } = await params;
  const result = await resolve(city, category);
  if (result.status === "not_found") notFound();
  const seo = exploreSeo(result.status === "ok" ? result.route : undefined);
  return (
    <ExploreLayout title={seo.heading} description={seo.description}>
      <Suspense fallback={<ExploreFallback />}>
        <ExplorePage preset={{ city, category }} />
      </Suspense>
    </ExploreLayout>
  );
}
