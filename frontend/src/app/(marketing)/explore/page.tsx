import type { Metadata } from "next";
import { Suspense } from "react";
import { exploreSeo } from "@/lib/explore/seo";
import { ExploreFallback, ExploreLayout } from "@/components/explore/explore-hero";
import { ExplorePage } from "@/components/explore/explore-page";

const seo = exploreSeo();

export const metadata: Metadata = {
  title: { absolute: seo.title },
  description: seo.description,
  alternates: { canonical: seo.canonical },
  openGraph: { title: seo.title, description: seo.description, url: seo.canonical, type: "website" },
};

/** The public marketplace (§18): search every listed business. Filters live in the query string. */
export default function ExploreRoute() {
  return (
    <ExploreLayout title={seo.heading} description={seo.description}>
      <Suspense fallback={<ExploreFallback />}>
        <ExplorePage />
      </Suspense>
    </ExploreLayout>
  );
}
