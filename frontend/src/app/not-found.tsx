import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { MinimalShell } from "@/components/shells/minimal-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <MinimalShell width="wide">
      <EmptyState
        size="lg"
        headingLevel={1}
        icon={<Compass />}
        title="Page not found"
        description="This address doesn't lead anywhere. If you were looking for a business, it may have moved."
        action={
          <>
            <Button asChild variant="primary">
              <Link href="/explore">Find a business</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">Back to home</Link>
            </Button>
          </>
        }
      />
    </MinimalShell>
  );
}
