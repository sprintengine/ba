"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CalendarCheck2, CalendarSearch, CircleUserRound } from "lucide-react";
import type { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/context";
import { ErrorState } from "@/components/common/feedback";
import { PublicBookingShell } from "@/components/shells/public-booking-shell";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * "My bookings" for signed-in visitors, else "Sign in" (returning to `returnPath`). A named glyph on phones, so the
 * business's name keeps its room in the header.
 */
export function PublicAccountLink({ returnPath }: { returnPath: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  return isSignedIn ? (
    <ActionButton
      href="/my/bookings"
      icon={<CalendarCheck2 />}
      label="My bookings"
      variant="ghost"
      size="sm"
    />
  ) : (
    <ActionButton
      href={`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`}
      icon={<CircleUserRound />}
      label="Sign in"
      variant="ghost"
      size="sm"
    />
  );
}

/** The public page of a business that failed to load: "doesn't exist" for a 404, else the error with a retry. */
export function PublicBusinessError({
  slug,
  error,
  onRetry,
  headerAction,
}: {
  slug: string;
  error: ApiError;
  onRetry: () => void;
  headerAction: React.ReactNode;
}) {
  return (
    <PublicBookingShell business={null} headerAction={headerAction}>
      {error.isNotFound ? (
        <BusinessNotFound slug={slug} />
      ) : (
        <ErrorState error={error} onRetry={onRetry} headingLevel={1} />
      )}
    </PublicBookingShell>
  );
}

export function BusinessNotFound({ slug }: { slug: string }) {
  return (
    <EmptyState
      size="lg"
      headingLevel={1}
      icon={<CalendarSearch />}
      title="This booking page doesn't exist"
      description={`There's no business at bookanything.ie/${slug}. Check the link you were given.`}
      action={
        <Button asChild variant="secondary">
          <Link href="/">Go to bookanything</Link>
        </Button>
      }
    />
  );
}

/**
 * A signed-in visitor may be the owner just after changing the page (its branding and style, or publishing its site),
 * and the server's copy can be half a minute old: refreshed for them (once signed in is known), not for every visitor.
 */
export function useRefreshWhenSignedIn(refetchBusiness: () => unknown, refetchServices: () => unknown) {
  const { isSignedIn } = useAuth();
  useEffect(() => {
    if (!isSignedIn) return;
    void refetchBusiness();
    void refetchServices();
  }, [isSignedIn, refetchBusiness, refetchServices]);
}
