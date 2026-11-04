"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The last-resort boundary, for a page that failed to render (failed requests are shown in place, with `ErrorState`).
 * Every page loads it, so it stays light: no API client or auth helpers.
 */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <EmptyState
        headingLevel={1}
        icon={<CircleAlert />}
        title="Something went wrong"
        description="This page didn't load properly. Try again, or come back in a moment."
        action={
          <Button variant="secondary" onClick={reset}>
            <RotateCw /> Try again
          </Button>
        }
      />
    </div>
  );
}
