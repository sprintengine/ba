import { Suspense } from "react";
import { ReportsView } from "@/components/dashboard/reports/reports-view";

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsView />
    </Suspense>
  );
}
