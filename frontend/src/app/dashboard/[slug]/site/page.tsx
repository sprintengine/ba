import { Suspense } from "react";
import { SiteEditorPage } from "@/components/dashboard/site/site-editor";

export default function SitePage() {
  return (
    <Suspense>
      <SiteEditorPage />
    </Suspense>
  );
}
