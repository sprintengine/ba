import { DeadEndMark } from "@/components/brand/logo";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Page not found" };

/** Under the marketing nav, which already carries the logo and the way home. */
export default function MarketingNotFound() {
  return (
    <EmptyState
      size="lg"
      headingLevel={1}
      icon={<DeadEndMark />}
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved."
      action={
        <Button asChild variant="primary">
          <Link href="/explore">Find a business</Link>
        </Button>
      }
    />
  );
}
