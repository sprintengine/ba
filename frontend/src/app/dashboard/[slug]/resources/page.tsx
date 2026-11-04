import { Suspense } from "react";
import { ResourcesView } from "@/components/dashboard/resources/resources-view";

export default function ResourcesPage() {
  return (
    <Suspense>
      <ResourcesView />
    </Suspense>
  );
}
