"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleAlert, Lock, RotateCw } from "lucide-react";
import { errorMessage, isApiError } from "@/lib/api/client";
import { signInUrl } from "@/lib/auth/components";
import { cn } from "@/lib/utils";
import { LogoLoader } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Full-viewport loading state (auth/redirect gates). */
export function FullPageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex min-h-dvh items-center justify-center bg-background"
    >
      <div className="flex flex-col items-center gap-4">
        <LogoLoader />
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}

/** Error with retry, for failed queries. Shows the API's message. */
export function ErrorState({
  error,
  onRetry,
  title = "This didn’t load",
  headingLevel,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  /** See `EmptyState`: 2 when the error stands in for a page's content, right under its title; 1 for the page. */
  headingLevel?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const unavailable = isApiError(error) && error.isUnavailable;
  const signedOut = isApiError(error) && error.isUnauthenticated;
  let heading = title;
  let description = errorMessage(error);
  if (unavailable) {
    heading = "Can't reach bookanything";
    description =
      process.env.NODE_ENV === "production"
        ? "The server didn't respond. Check your connection and try again."
        : "The server didn't respond. Check your connection. If you're developing locally, make sure the backend is running.";
  } else if (signedOut) {
    heading = "You're signed out";
    description = "Your session has ended. Sign in again to carry on.";
  }
  return (
    <EmptyState
      className={className}
      headingLevel={headingLevel}
      icon={<CircleAlert />}
      title={heading}
      description={description}
      action={
        (signedOut || onRetry) && (
          <>
            {signedOut && <SignInAgain />}
            {onRetry && (
              <Button variant="secondary" onClick={onRetry}>
                <RotateCw /> Try again
              </Button>
            )}
          </>
        )
      }
    />
  );
}

/** Sign in, then come back to this page. */
function SignInAgain() {
  const pathname = usePathname();
  return (
    <Button asChild variant="primary">
      <Link href={signInUrl(pathname)}>Sign in</Link>
    </Button>
  );
}

/** 403/404 for business-scoped pages. */
export function NoAccess({
  title = "You don't have access to this",
  description = "It may not exist, or your account isn't a member. Check the address or switch account.",
  backHref = "/dashboard",
  backLabel = "Go to dashboard",
  inShell = false,
}: {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  /** Inside the dashboard's shell: fills the page, not the whole screen. */
  inShell?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-background px-6",
        inShell ? "min-h-[60dvh]" : "min-h-dvh",
      )}
    >
      <EmptyState
        size="lg"
        headingLevel={1}
        icon={<Lock />}
        title={title}
        description={description}
        action={
          <Button asChild variant="primary">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        }
      />
    </div>
  );
}
