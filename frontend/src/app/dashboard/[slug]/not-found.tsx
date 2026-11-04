"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useCurrentBusiness } from "@/lib/business/business-context";

export default function DashboardNotFound() {
  const business = useCurrentBusiness();
  return (
    <EmptyState
      size="md"
      headingLevel={1}
      icon={<Compass />}
      title="Page not found"
      description="This page doesn't exist or has moved."
      action={
        <Button asChild variant="primary">
          <Link href={dashboardHref(business.slug)}>Back to overview</Link>
        </Button>
      }
    />
  );
}
