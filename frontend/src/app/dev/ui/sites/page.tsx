import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteGallery } from "./site-gallery";

export const metadata: Metadata = { title: "Site themes", robots: { index: false } };

export default function DevSitesPage() {
  return (
    <Suspense>
      <SiteGallery />
    </Suspense>
  );
}
