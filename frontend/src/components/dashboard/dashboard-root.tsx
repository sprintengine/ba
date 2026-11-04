"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { Business, Me, Membership, MemberRole } from "@/lib/api/types";
import type { ApiError } from "@/lib/api/client";
import { useBusiness, useBusinessBySlug, useMe } from "@/lib/api/hooks";
import { BusinessContextProvider } from "@/lib/business/business-context";
import { VocabularyProvider } from "@/lib/vocabulary";
import { ErrorState, NoAccess } from "@/components/common/feedback";
import { DashboardShell } from "@/components/shells/dashboard-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingActionsProvider } from "./booking/booking-actions-provider";

/** Where loading `Me` and the business for `/dashboard/[slug]` has got to. */
export type DashboardBootstrap =
  | { state: "me-error"; error: ApiError; retry: () => void }
  | { state: "not-member"; slug: string }
  | { state: "no-access" }
  | {
      state: "business-error";
      error: ApiError;
      retry: () => void;
      role: MemberRole;
      memberships: Membership[];
    }
  | { state: "loading"; role: MemberRole; memberships: Membership[] }
  | { state: "ready"; business: Business; role: MemberRole; me: Me };

/**
 * Load `Me` and, at the same time, the business by the URL's slug; find the membership for the slug, which decides
 * (not a member, renamed address), then show that business. Should the slug not lead to it, the business is read by
 * the membership's id, as before the slug read existed.
 */
export function useDashboardBootstrap(): DashboardBootstrap {
  const { slug } = useParams<{ slug: string }>();
  const me = useMe();
  const bySlug = useBusinessBySlug(slug);
  const memberships = me.data?.memberships ?? [];
  const membership = useMembershipAt(slug, memberships);
  // Once the slug read has answered: it either stored this business (so this finds it fresh) or found nothing.
  const business = useBusiness(membership?.businessId ?? "", { enabled: !bySlug.isLoading });
  const role = membership?.role ?? "staff";

  if (me.isError) return { state: "me-error", error: me.error, retry: () => void me.refetch() };
  if (me.data && !membership) return { state: "not-member", slug };
  if (business.isError) {
    if (business.error.isForbidden || business.error.isNotFound) return { state: "no-access" };
    return {
      state: "business-error",
      error: business.error,
      retry: () => void business.refetch(),
      role,
      memberships,
    };
  }
  if (!me.data || !membership || !business.data) return { state: "loading", role, memberships };
  return {
    state: "ready",
    business: business.data,
    role: business.data.myRole,
    me: me.data,
  };
}

/**
 * The membership for the URL's slug. Changing the address in Settings refreshes `me` (with the new slug) before the
 * URL follows: the business shown at this slug is remembered, so it carries on (and the URL moves along to its new
 * slug) instead of flashing "not a member". A slug that was never this business's still finds nothing.
 */
function useMembershipAt(slug: string, memberships: Membership[]): Membership | null {
  const router = useRouter();
  const pathname = usePathname();
  const bySlug = memberships.find((m) => m.slug === slug) ?? null;
  const [shown, setShown] = useState<{ businessId: string; slug: string } | null>(null);
  if (bySlug && (shown?.businessId !== bySlug.businessId || shown.slug !== slug)) {
    setShown({ businessId: bySlug.businessId, slug });
  }
  const renamed =
    !bySlug && shown?.slug === slug
      ? (memberships.find((m) => m.businessId === shown.businessId && m.slug !== slug) ?? null)
      : null;
  const renamedTo = renamed?.slug ?? null;
  useEffect(() => {
    if (renamedTo) router.replace(pathname.replace(/^\/dashboard\/[^/]+/, `/dashboard/${renamedTo}`));
  }, [renamedTo, pathname, router]);
  return bySlug ?? renamed;
}

/** The chrome around a ready dashboard (the app layout adds the assistant to the `DashboardShell`). */
export type DashboardChrome = React.ComponentType<{
  business: Business;
  role: MemberRole;
  memberships: Membership[];
  children: React.ReactNode;
}>;

/**
 * Loads `Me` + `Business` for /dashboard/[slug] and provides BusinessContext (business, role, me), the business
 * vocabulary and the shared booking drawer/sheet to every dashboard page, inside `Chrome`. Handles unknown slug /
 * no membership (403/404) and load errors; shows skeleton chrome while loading.
 */
export function DashboardRoot({ Chrome, children }: { Chrome: DashboardChrome; children: React.ReactNode }) {
  const boot = useDashboardBootstrap();
  switch (boot.state) {
    case "me-error":
      return (
        <div className="flex min-h-dvh items-center justify-center">
          <ErrorState error={boot.error} onRetry={boot.retry} />
        </div>
      );
    case "not-member":
      return (
        <NoAccess
          title="Business not found"
          description={`You're not a member of a business at “${boot.slug}”. It may have moved, or you may be signed in with a different account.`}
        />
      );
    case "no-access":
      return <NoAccess />;
    case "business-error":
      return (
        <DashboardShell business={null} role={boot.role} memberships={boot.memberships}>
          <ErrorState error={boot.error} onRetry={boot.retry} />
        </DashboardShell>
      );
    case "loading":
      return (
        <DashboardShell business={null} role={boot.role} memberships={boot.memberships}>
          <DashboardPageSkeleton />
        </DashboardShell>
      );
    case "ready":
      return (
        <BusinessContextProvider value={{ business: boot.business, role: boot.role, me: boot.me }}>
          <VocabularyProvider vocabulary={boot.business.vocabulary}>
            <BookingActionsProvider>
              <Chrome business={boot.business} role={boot.role} memberships={boot.me.memberships}>
                {children}
              </Chrome>
            </BookingActionsProvider>
          </VocabularyProvider>
        </BusinessContextProvider>
      );
  }
}

function DashboardPageSkeleton() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
