"use client";

import { DeadEndMark } from "@/components/brand/logo";
import { RotateCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type RootErrorProps = { error: Error & { digest?: string }; reset: () => void };

/**
 * The last-resort boundary, for a page that failed to render (failed requests are shown in place, with `ErrorState`).
 * Every page loads it, so it stays light: no API client or auth helpers.
 */
function RootError({ reset }: RootErrorProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <EmptyState
        headingLevel={1}
        icon={<DeadEndMark />}
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

/** Also reports the error to Sentry, loading its client lazily. */
function ReportedRootError(props: RootErrorProps) {
  const { error } = props;
  useEffect(() => {
    // The DSN is checked here as well: the bundler drops a dead `if` before it emits chunks, a dead ternary branch only
    // later. Errors from server rendering (with a `digest`) were reported by the server's `onRequestError`, so they
    // don't fetch the SDK.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN && !error.digest) {
      import("@/lib/observability/sentry-client").then(
        ({ captureBoundaryError }) => captureBoundaryError(error),
        () => undefined,
      );
    }
  }, [error]);
  return <RootError {...props} />;
}

// Chosen at build time: without NEXT_PUBLIC_SENTRY_DSN (always defined, see next.config.ts) the reporting wrapper and
// its import are dropped, leaving the boundary byte for byte as before.
export default process.env.NEXT_PUBLIC_SENTRY_DSN ? ReportedRootError : RootError;
